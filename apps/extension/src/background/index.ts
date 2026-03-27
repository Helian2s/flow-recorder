import type { ExportedSession, NormalizedEvent, RecorderConfig } from '@flow-recorder/schema';
import {
  createExportFilename,
  FLOW_RECORDER_BATCH_EVENT,
  type ExtensionSessionState
} from '@flow-recorder/devtools-shared';

interface StoredTabSession extends ExtensionSessionState {
  events: NormalizedEvent[];
}

interface PopupResponse {
  ok: boolean;
  status?: StoredTabSession;
  recentEvents?: Array<{ event_type: string; action_kind?: string | null; sequence_no: number }>;
  exportSession?: ExportedSession | null;
  filename?: string;
  error?: string;
}

const STORAGE_PREFIX = 'flow-recorder-tab-';
const DEFAULT_OPTIONS = {
  rawInputCapture: false,
  debug: false
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set(DEFAULT_OPTIONS);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }),
    );
  return true;
});

async function handleMessage(message: unknown, sender: chrome.runtime.MessageSender): Promise<PopupResponse> {
  const payload = message as Record<string, unknown>;
  switch (payload.type) {
    case 'PING':
      return { ok: true };
    case 'FLOW_BATCH':
      await handleBatch(sender.tab?.id ?? null, payload.payload as { events: NormalizedEvent[]; session: ExportedSession['session'] });
      return { ok: true };
    case 'FLOW_STATUS':
      await handleStatus(
        sender.tab?.id ?? null,
        payload.payload as { status: ExtensionSessionState; exportSession: ExportedSession | null },
      );
      return { ok: true };
    case 'POPUP_GET_STATUS':
      return getPopupStatus();
    case 'POPUP_START':
      return runPopupCommand('start');
    case 'POPUP_STOP':
      return runPopupCommand('stop');
    case 'POPUP_FLUSH':
      return runPopupCommand('flush');
    case 'POPUP_CLEAR':
      return runPopupCommand('clear');
    case 'POPUP_EXPORT': {
      const status = await getPopupStatus();
      return {
        ...status,
        filename: createExportFilename(status.status?.sessionId)
      };
    }
    case 'POPUP_SET_OPTIONS':
      await chrome.storage.local.set(payload.payload as object);
      return getPopupStatus();
    default:
      return { ok: true };
  }
}

async function getPopupStatus(): Promise<PopupResponse> {
  const tab = await getActiveTab();
  const stored = tab.id !== undefined ? await loadSession(tab.id) : createEmptyState(null, tab.url ?? '');
  const recentEvents = stored.events.slice(-8).map((event) => ({
    event_type: event.event_type,
    action_kind: event.action_kind,
    sequence_no: event.sequence_no
  }));

  return {
    ok: true,
    status: {
      ...stored,
      currentUrl: tab.url ?? stored.currentUrl
    },
    recentEvents,
    exportSession: stored.exportedSession ?? null
  };
}

async function runPopupCommand(command: 'start' | 'stop' | 'flush' | 'clear'): Promise<PopupResponse> {
  const tab = await getActiveTab();
  if (tab.id === undefined) {
    return { ok: false, error: 'No active tab' };
  }

  await ensureContentInjected(tab.id);

  if (command === 'start') {
    const config = await buildRecorderConfig(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'FLOW_COMMAND',
      command,
      payload: config
    });
  } else {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'FLOW_COMMAND',
      command
    });
  }

  if (command === 'clear') {
    await saveSession(tab.id, createEmptyState(tab.id, tab.url ?? ''));
  }

  return getPopupStatus();
}

async function buildRecorderConfig(tabId: number): Promise<RecorderConfig> {
  const options = (await chrome.storage.local.get(DEFAULT_OPTIONS)) as typeof DEFAULT_OPTIONS;
  return {
    endpoint: '',
    appId: 'flow-recorder-extension',
    mode: 'extension-local',
    autoStart: true,
    debug: options.debug,
    capture: {
      clicks: true,
      inputs: true,
      keyboard: true,
      scroll: {
        throttleMs: 180,
        idleMs: 180
      },
      network: true,
      visibilityContext: true,
      snapshots: 'enhanced-local'
    },
    privacy: {
      textInputMode: options.rawInputCapture ? 'raw' : 'masked',
      clearTextAllowInExtension: options.rawInputCapture,
      redactQueryParams: ['token', 'auth', 'code']
    },
    extension: {
      tabId: String(tabId),
      bridgeChannel: FLOW_RECORDER_BATCH_EVENT
    }
  };
}

async function ensureContentInjected(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return;
  } catch {}

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

async function handleBatch(
  tabId: number | null,
  batch: { events: NormalizedEvent[]; session: ExportedSession['session'] },
): Promise<void> {
  if (tabId === null) {
    return;
  }

  const previous = await loadSession(tabId);
  const next: StoredTabSession = {
    ...previous,
    started: true,
    mode: batch.session.mode,
    currentUrl: batch.session.current_url,
    sessionId: batch.session.session_id,
    tabId,
    eventCount: previous.eventCount + batch.events.length,
    events: [...previous.events, ...batch.events]
  };
  await saveSession(tabId, next);
}

async function handleStatus(
  tabId: number | null,
  payload: { status: ExtensionSessionState; exportSession: ExportedSession | null },
): Promise<void> {
  if (tabId === null) {
    return;
  }

  const previous = await loadSession(tabId);
  const next: StoredTabSession = {
    ...previous,
    ...payload.status,
    tabId,
    exportedSession: payload.exportSession,
    events: payload.exportSession?.events ?? previous.events,
    eventCount: payload.exportSession?.events.length ?? payload.status.eventCount
  };
  await saveSession(tabId, next);
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error('No active tab found');
  }
  return tab;
}

async function loadSession(tabId: number): Promise<StoredTabSession> {
  const key = `${STORAGE_PREFIX}${tabId}`;
  const stored = (await chrome.storage.local.get(key))[key] as StoredTabSession | undefined;
  return stored ?? createEmptyState(tabId, '');
}

async function saveSession(tabId: number, session: StoredTabSession): Promise<void> {
  const key = `${STORAGE_PREFIX}${tabId}`;
  await chrome.storage.local.set({ [key]: session });
}

function createEmptyState(tabId: number | null, url: string): StoredTabSession {
  return {
    started: false,
    mode: 'extension-local',
    currentUrl: url,
    sessionId: null,
    eventCount: 0,
    tabId,
    events: [],
    exportedSession: null
  };
}
