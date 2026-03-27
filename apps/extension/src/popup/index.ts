type PopupStatusResponse = {
  ok: boolean;
  status?: {
    started: boolean;
    mode: string;
    currentUrl: string;
    sessionId: string | null;
    eventCount: number;
  };
  recentEvents?: Array<{ event_type: string; action_kind?: string | null; sequence_no: number }>;
  exportSession?: unknown;
  filename?: string;
};

const currentUrlEl = document.getElementById('current-url') as HTMLParagraphElement;
const statusValueEl = document.getElementById('status-value') as HTMLElement;
const modeValueEl = document.getElementById('mode-value') as HTMLElement;
const eventCountEl = document.getElementById('event-count') as HTMLElement;
const sessionIdEl = document.getElementById('session-id') as HTMLElement;
const recentEventsEl = document.getElementById('recent-events') as HTMLUListElement;
const rawToggleEl = document.getElementById('raw-toggle') as HTMLInputElement;
const debugToggleEl = document.getElementById('debug-toggle') as HTMLInputElement;

document.getElementById('start-btn')?.addEventListener('click', () => {
  void runCommand('POPUP_START');
});
document.getElementById('stop-btn')?.addEventListener('click', () => {
  void runCommand('POPUP_STOP');
});
document.getElementById('clear-btn')?.addEventListener('click', () => {
  void runCommand('POPUP_CLEAR');
});
document.getElementById('flush-btn')?.addEventListener('click', () => {
  void exportSession();
});

rawToggleEl.addEventListener('change', () => {
  void chrome.runtime.sendMessage({
    type: 'POPUP_SET_OPTIONS',
    payload: {
      rawInputCapture: rawToggleEl.checked
    }
  });
});

debugToggleEl.addEventListener('change', () => {
  void chrome.runtime.sendMessage({
    type: 'POPUP_SET_OPTIONS',
    payload: {
      debug: debugToggleEl.checked
    }
  });
});

void bootstrap();

async function bootstrap(): Promise<void> {
  const options = (await chrome.storage.local.get({
    rawInputCapture: false,
    debug: false
  })) as { rawInputCapture: boolean; debug: boolean };

  rawToggleEl.checked = options.rawInputCapture;
  debugToggleEl.checked = options.debug;
  await refresh();
}

async function runCommand(type: string): Promise<void> {
  await chrome.runtime.sendMessage({ type });
  await refresh();
}

async function exportSession(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: 'POPUP_EXPORT'
  })) as PopupStatusResponse;

  if (!response.exportSession) {
    return;
  }

  const blob = new Blob([JSON.stringify(response.exportSession, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = response.filename ?? 'flow-recorder-session.json';
  link.click();
  URL.revokeObjectURL(url);
  await refresh();
}

async function refresh(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: 'POPUP_GET_STATUS'
  })) as PopupStatusResponse;

  const status = response.status;
  currentUrlEl.textContent = status?.currentUrl ?? 'No active tab';
  statusValueEl.textContent = status?.started ? 'recording' : 'idle';
  modeValueEl.textContent = status?.mode ?? 'extension-local';
  eventCountEl.textContent = String(status?.eventCount ?? 0);
  sessionIdEl.textContent = status?.sessionId ?? '-';
  recentEventsEl.innerHTML = '';

  for (const event of response.recentEvents ?? []) {
    const item = document.createElement('li');
    item.textContent = `#${event.sequence_no} ${event.event_type}${event.action_kind ? ` (${event.action_kind})` : ''}`;
    recentEventsEl.appendChild(item);
  }
}
