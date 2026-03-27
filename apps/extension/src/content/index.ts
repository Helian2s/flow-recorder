import {
  FLOW_RECORDER_COMMAND_EVENT,
  FLOW_RECORDER_EXTENSION_SOURCE,
  isBridgeBatchMessage,
  isBridgeStatusMessage
} from '@flow-recorder/devtools-shared';

let injected = false;
let pendingCommands: Array<{ command: string; payload?: unknown }> = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const payload = message as Record<string, unknown>;
  if (payload.type === 'PING') {
    sendResponse({ ok: true });
    return;
  }

  if (payload.type === 'FLOW_COMMAND') {
    ensurePageBridge();
    pendingCommands.push({
      command: String(payload.command),
      payload: payload.payload
    });
    flushPendingCommands();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  if (isBridgeBatchMessage(event.data)) {
    void chrome.runtime.sendMessage({
      type: 'FLOW_BATCH',
      payload: event.data.payload
    });
  }

  if (isBridgeStatusMessage(event.data)) {
    void chrome.runtime.sendMessage({
      type: 'FLOW_STATUS',
      payload: event.data.payload
    });
  }
});

ensurePageBridge();
pendingCommands.push({ command: 'status' });
flushPendingCommands();

function ensurePageBridge(): void {
  if (injected) {
    return;
  }

  const existing = document.getElementById('flow-recorder-page-bridge');
  if (existing) {
    injected = true;
    return;
  }

  const script = document.createElement('script');
  script.id = 'flow-recorder-page-bridge';
  script.src = chrome.runtime.getURL('page-bridge.js');
  script.async = false;
  script.onload = () => {
    injected = true;
    flushPendingCommands();
    script.remove();
  };
  (document.head ?? document.documentElement).appendChild(script);
}

function flushPendingCommands(): void {
  if (!injected) {
    return;
  }

  while (pendingCommands.length > 0) {
    const next = pendingCommands.shift();
    if (!next) {
      return;
    }

    window.postMessage(
      {
        source: FLOW_RECORDER_EXTENSION_SOURCE,
        type: FLOW_RECORDER_COMMAND_EVENT,
        command: next.command,
        payload: next.payload
      },
      '*',
    );
  }
}
