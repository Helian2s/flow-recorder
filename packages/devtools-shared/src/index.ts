import type { ExportedSession, RecorderConfig, RuntimeMode, TransportBatch } from '@flow-recorder/schema';

export const FLOW_RECORDER_PAGE_SOURCE = 'flow-recorder-page';
export const FLOW_RECORDER_EXTENSION_SOURCE = 'flow-recorder-extension';
export const FLOW_RECORDER_BATCH_EVENT = 'FLOW_RECORDER_BATCH';
export const FLOW_RECORDER_COMMAND_EVENT = 'FLOW_RECORDER_COMMAND';
export const FLOW_RECORDER_STATUS_EVENT = 'FLOW_RECORDER_STATUS';

export type BridgeCommandType = 'start' | 'stop' | 'flush' | 'clear' | 'status' | 'config';

export interface BridgeCommand {
  source: typeof FLOW_RECORDER_EXTENSION_SOURCE;
  type: typeof FLOW_RECORDER_COMMAND_EVENT;
  command: BridgeCommandType;
  payload?: RecorderConfig | null;
}

export interface BridgeBatchMessage {
  source: typeof FLOW_RECORDER_PAGE_SOURCE;
  type: typeof FLOW_RECORDER_BATCH_EVENT;
  payload: TransportBatch;
}

export interface BridgeStatusMessage {
  source: typeof FLOW_RECORDER_PAGE_SOURCE;
  type: typeof FLOW_RECORDER_STATUS_EVENT;
  payload: {
    status: {
      started: boolean;
      mode: RuntimeMode | undefined;
      currentUrl: string;
      eventCount: number;
      queueSize: number;
      sessionId: string;
      stateId: string | null;
    };
    exportSession: ExportedSession | null;
  };
}

export interface ExtensionSessionState {
  started: boolean;
  mode: RuntimeMode;
  currentUrl: string;
  sessionId: string | null;
  eventCount: number;
  tabId: number | null;
  exportedSession?: ExportedSession | null;
}

export function isBridgeBatchMessage(value: unknown): value is BridgeBatchMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BridgeBatchMessage>;
  return (
    candidate.source === FLOW_RECORDER_PAGE_SOURCE &&
    candidate.type === FLOW_RECORDER_BATCH_EVENT &&
    typeof candidate.payload === 'object'
  );
}

export function isBridgeStatusMessage(value: unknown): value is BridgeStatusMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BridgeStatusMessage>;
  return (
    candidate.source === FLOW_RECORDER_PAGE_SOURCE &&
    candidate.type === FLOW_RECORDER_STATUS_EVENT &&
    typeof candidate.payload === 'object'
  );
}

export function createExportFilename(sessionId: string | null | undefined): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `flow-recorder-${sessionId ?? 'session'}-${stamp}.json`;
}
