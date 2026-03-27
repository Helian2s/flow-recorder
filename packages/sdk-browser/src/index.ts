import type { ExportedSession, RecorderConfig } from '@flow-recorder/schema';
import { createRecorder, type Recorder } from '@flow-recorder/recorder-core';
import {
  ConsoleTransport,
  ExtensionBridgeTransport,
  FetchTransport,
  NoopTransport,
  type EventTransport
} from '@flow-recorder/transport';

export const version = '0.1.0';

export interface FlowRecorderBrowserStatus {
  started: boolean;
  mode: RecorderConfig['mode'];
  currentUrl: string;
  eventCount: number;
  queueSize: number;
  sessionId: string;
  stateId: string | null;
}

export interface FlowRecorderBrowserApi {
  init(config: RecorderConfig): FlowRecorderBrowserApi;
  start(config?: RecorderConfig): void;
  stop(): void;
  flush(reason?: string): Promise<void>;
  exportSession(): ExportedSession | null;
  getStatus(): FlowRecorderBrowserStatus;
  version: string;
}

declare global {
  interface Window {
    FlowRecorder: FlowRecorderBrowserApi;
  }
}

export function createFlowRecorderBrowserApi(win: Window = window): FlowRecorderBrowserApi {
  let currentRecorder: Recorder | null = null;
  let currentConfig: RecorderConfig = {
    endpoint: '',
    mode: 'gtm',
    autoStart: true,
    debug: false
  };

  const ensureRecorder = (): Recorder => {
    if (!currentRecorder) {
      currentRecorder = createRecorder({
        win,
        doc: win.document,
        console,
        transportFactory: (config) => createTransport(config, win)
      });
    }
    return currentRecorder;
  };

  const api: FlowRecorderBrowserApi = {
    init(config): FlowRecorderBrowserApi {
      currentConfig = { ...currentConfig, ...config };
      const recorder = ensureRecorder();
      recorder.updateConfig(currentConfig);
      if (config.autoStart ?? true) {
        recorder.start(currentConfig);
      }
      return api;
    },
    start(config): void {
      if (config) {
        currentConfig = { ...currentConfig, ...config };
      }
      ensureRecorder().start(currentConfig);
    },
    stop(): void {
      currentRecorder?.stop();
    },
    flush(reason): Promise<void> {
      return currentRecorder?.flush(reason) ?? Promise.resolve();
    },
    exportSession(): ExportedSession | null {
      return currentRecorder?.getState().session_export ?? null;
    },
    getStatus(): FlowRecorderBrowserStatus {
      const state = currentRecorder?.getState();
      return {
        started: state?.started ?? false,
        mode: state?.mode ?? currentConfig.mode ?? 'gtm',
        currentUrl: state?.current_url ?? win.location.href,
        eventCount: state?.event_count ?? 0,
        queueSize: state?.queue_size ?? 0,
        sessionId: state?.session.session_id ?? '',
        stateId: state?.session.state_id ?? null
      };
    },
    version
  };

  return api;
}

export function installGlobalFlowRecorder(win: Window = window): FlowRecorderBrowserApi {
  const api = createFlowRecorderBrowserApi(win);
  win.FlowRecorder = api;
  return api;
}

export function createTransport(config: RecorderConfig, win: Window = window): EventTransport {
  if ((config.mode ?? 'gtm') === 'extension-local') {
    return new ExtensionBridgeTransport({
      source: 'flow-recorder-page',
      eventType: config.extension?.bridgeChannel ?? 'FLOW_RECORDER_BATCH',
      targetWindow: win
    });
  }

  if (config.endpoint) {
    return new FetchTransport({
      endpoint: config.endpoint,
      fetchImpl: win.fetch.bind(win),
      navigatorImpl: win.navigator
    });
  }

  if (config.debug) {
    return new ConsoleTransport();
  }

  return new NoopTransport();
}

const globalApi = typeof window !== 'undefined' ? installGlobalFlowRecorder(window) : null;

export default globalApi;
