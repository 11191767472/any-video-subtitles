chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['avs:settings'], (res) => {
    if (!res || !res['avs:settings']) {
      chrome.storage.local.set({
        'avs:settings': { enabled: true, style: null, panelPos: null },
      });
    }
  });
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'AVS_TOGGLE' }, () => {
    void chrome.runtime.lastError;
  });
});
