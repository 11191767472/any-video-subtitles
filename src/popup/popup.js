const KEY_SET = 'avs:settings';
const KEY_SUBS = 'avs:subs';
const DEFAULT_STYLE = {
  rel: 5.5,
  color: '#ffffff',
  bgOn: true,
  bg: '#000000',
  bgOpacity: 55,
  outlineOn: true,
  shadowOn: true,
  weight: 700,
  bottom: 8,
  maxWidth: 90,
  lineHeight: 1.35,
  family: '',
};

const $ = (id) => document.getElementById(id);
let settings = { enabled: true, style: DEFAULT_STYLE, panelPos: null };

function save() {
  chrome.storage.local.set({ [KEY_SET]: settings });
}

function applyStyleToUI() {
  const s = settings.style;
  $('rel').value = s.rel;
  $('relV').textContent = (+s.rel).toFixed(1);
  $('color').value = s.color;
  $('bg').value = s.bg;
  $('outline').checked = !!s.outlineOn;
  $('bgOn').checked = !!s.bgOn;
  $('enabled').checked = settings.enabled !== false;
}

function init() {
  chrome.storage.local.get([KEY_SET, KEY_SUBS], (res) => {
    settings = Object.assign({ enabled: true }, res[KEY_SET] || {});
    settings.style = Object.assign({}, DEFAULT_STYLE, settings.style || {});
    applyStyleToUI();
    const n = Object.keys(res[KEY_SUBS] || {}).length;
    $('libCount').textContent = `${n} 个视频的字幕`;
  });
}

$('enabled').addEventListener('change', (e) => {
  settings.enabled = e.target.checked;
  save();
});

function upd(patch) {
  settings.style = Object.assign({}, settings.style, patch);
  save();
}

$('rel').addEventListener('input', (e) => {
  $('relV').textContent = (+e.target.value).toFixed(1);
  upd({ rel: parseFloat(e.target.value) });
});
$('color').addEventListener('input', (e) => upd({ color: e.target.value }));
$('bg').addEventListener('input', (e) => upd({ bg: e.target.value }));
$('outline').addEventListener('change', (e) => upd({ outlineOn: e.target.checked }));
$('bgOn').addEventListener('change', (e) => upd({ bgOn: e.target.checked }));

$('apply').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!t.id || !/^https?:/.test(t.url || '')) continue;
    chrome.tabs.sendMessage(t.id, { type: 'AVS_STYLE', style: settings.style }, () => {
      void chrome.runtime.lastError;
    });
  }
  $('apply').textContent = '已应用 ✓';
  setTimeout(() => ($('apply').textContent = '应用到当前已打开页面'), 1400);
});

$('open').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'AVS_OPEN' }, () => {
    void chrome.runtime.lastError;
  });
  window.close();
});

$('clear').addEventListener('click', () => {
  if (!confirm('清空所有已保存的字幕？此操作不可撤销。')) return;
  chrome.storage.local.set({ [KEY_SUBS]: {} }, () => ($('libCount').textContent = '0 个视频的字幕'));
});

init();
