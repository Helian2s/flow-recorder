import type { RecorderConfig } from '@flow-recorder/schema';
import {
  FLOW_RECORDER_COMMAND_EVENT,
  FLOW_RECORDER_EXTENSION_SOURCE,
  FLOW_RECORDER_PAGE_SOURCE,
  FLOW_RECORDER_STATUS_EVENT
} from '@flow-recorder/devtools-shared';
import { createFlowRecorderBrowserApi, type FlowRecorderBrowserApi } from '@flow-recorder/sdk-browser';

let api: FlowRecorderBrowserApi = createFlowRecorderBrowserApi(window);
window.FlowRecorder = api;

let lastConfig: RecorderConfig = {
  endpoint: '',
  mode: 'extension-local',
  autoStart: false,
  appId: 'flow-recorder-extension'
};

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data as {
    source?: string;
    type?: string;
    command?: string;
    payload?: RecorderConfig;
  };

  if (data.source !== FLOW_RECORDER_EXTENSION_SOURCE || data.type !== FLOW_RECORDER_COMMAND_EVENT) {
    return;
  }

  void handleCommand(data.command ?? 'status', data.payload);
});

void emitStatus();

async function handleCommand(command: string, payload?: RecorderConfig): Promise<void> {
  switch (command) {
    case 'start':
      lastConfig = {
        ...lastConfig,
        ...payload,
        mode: 'extension-local',
        autoStart: true
      };
      api.init(lastConfig);
      break;
    case 'stop':
      api.stop();
      break;
    case 'flush':
      await api.flush('extension-popup');
      break;
    case 'clear':
      api.stop();
      api = createFlowRecorderBrowserApi(window);
      window.FlowRecorder = api;
      if (lastConfig.autoStart) {
        api.init({
          ...lastConfig,
          autoStart: true
        });
      }
      break;
    case 'config':
      lastConfig = {
        ...lastConfig,
        ...payload
      };
      break;
    case 'status':
    default:
      break;
  }

  await emitStatus();
}

async function emitStatus(): Promise<void> {
  window.postMessage(
    {
      source: FLOW_RECORDER_PAGE_SOURCE,
      type: FLOW_RECORDER_STATUS_EVENT,
      payload: {
        status: api.getStatus(),
        exportSession: api.exportSession()
      }
    },
    '*',
  );
}
