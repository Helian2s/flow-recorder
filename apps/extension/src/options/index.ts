const rawInputCaptureEl = document.getElementById('raw-input-capture') as HTMLInputElement;
const debugEl = document.getElementById('debug') as HTMLInputElement;
const savedStateEl = document.getElementById('saved-state') as HTMLParagraphElement;

void bootstrap();

rawInputCaptureEl.addEventListener('change', persist);
debugEl.addEventListener('change', persist);

async function bootstrap(): Promise<void> {
  const options = (await chrome.storage.local.get({
    rawInputCapture: false,
    debug: false
  })) as { rawInputCapture: boolean; debug: boolean };

  rawInputCaptureEl.checked = options.rawInputCapture;
  debugEl.checked = options.debug;
}

async function persist(): Promise<void> {
  await chrome.storage.local.set({
    rawInputCapture: rawInputCaptureEl.checked,
    debug: debugEl.checked
  });
  savedStateEl.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
}
