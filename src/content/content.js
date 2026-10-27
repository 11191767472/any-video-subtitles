/**
 * content.js — 主控：扫描视频、驱动字幕时间轴、面板交互、存储同步、快捷键
 */
(function (root) {
  'use strict';
  const AVS = root.AVS;
  if (!AVS || root.__AVS_READY) return;
  root.__AVS_READY = true;

  const KEY_SUBS = 'avs:subs';
  const KEY_SET = 'avs:settings';
  const storage = root.chrome && chrome.storage && chrome.storage.local ? chrome.storage.local : null;

  const store = {
    get(keys, cb) {
      if (!storage) return cb({});
      try {
        storage.get(keys, cb);
      } catch (e) {
        cb({});
      }
    },
    set(obj) {
      if (!storage) return;
      try {
        storage.set(obj);
      } catch (e) {}
    },
  };

  const App = {
    videos: [],
    index: -1,
    cues: [],
    offset: 0,
    style: Object.assign({}, AVS.DEFAULT_STYLE),
    fileName: '',
    libKey: '',
    rev: 0,
    cueRev: 0,
    activeIdx: -1,
    userLoaded: false, // 用户是否手动载入/编辑过字幕（为真时存档不得覆盖）
    rec: false,
    recStart: null,
    recIdx: -1,
    time: 0,
    duration: 0,
    enabled: true,
    userPicked: false,
    isTop: false,
    panelPos: null,
    panel: null,
  };
  root.AVS.app = App;

  /* ================= 存储 ================= */

  function packCues(cues) {
    return cues.map((c) => ({ s: c.start, e: c.end, t: c.text }));
  }
  function unpackCues(arr) {
    return (arr || []).map((c) => ({ start: +c.s || 0, end: +c.e || 0, text: String(c.t || '') }));
  }
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /**
   * 存档指纹。关键：只要拿到稳定的 currentSrc 就不要把 duration 编进 key，
   * 否则 HLS/DASH 切清晰度、直播流时长变化都会让 key 抖动，进而反复触发存档重载。
   */
  function videoKey(v, i) {
    const src = v.currentSrc || v.src || '';
    if (src && !/^blob:/i.test(src)) return `${location.hostname || 'file'}|${hash(src.slice(-160))}`;
    // 拿不到稳定 src（blob 流等）：用 站点 + 路径 + 页面内序号 兜底，
    // 不掺 duration —— 直播/渐进加载时 duration 会变，掺进去会让 key 抖动
    return `${location.hostname || 'file'}|i${i}:${hash(location.pathname)}`;
  }

  function loadFromStore(key, cb) {
    store.get([KEY_SUBS], (res) => {
      const m = (res && res[KEY_SUBS]) || {};
      cb(m[key] || null);
    });
  }

  function saveToStore() {
    if (!App.libKey) return;
    const name = App.fileName || '手动字幕';
    const payload = {
      n: name,
      c: packCues(App.cues),
      o: App.offset,
      st: App.style,
      rev: Date.now(),
      u: Date.now(),
    };
    App.rev = payload.rev;
    store.get([KEY_SUBS], (res) => {
      const m = (res && res[KEY_SUBS]) || {};
      m[App.libKey] = payload;
      // 只保留最近 40 条，避免撑爆 storage.local
      const keys = Object.keys(m).sort((a, b) => (m[b].u || 0) - (m[a].u || 0));
      if (keys.length > 40) keys.slice(40).forEach((k) => delete m[k]);
      store.set({ [KEY_SUBS]: m });
      flash('已保存：下次打开该视频自动加载');
    });
  }

  let flashTimer = 0;
  function flash(msg) {
    const el = App.panel && App.panel.$('[data-r="saveHint"]');
    if (!el) return;
    el.textContent = msg;
    el.style.color = '#7ee2a8';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.style.color = '';
      el.textContent = '保存后，下次打开同一视频会自动加载。';
    }, 2600);
  }

  /* ================= 视频扫描 ================= */

  function scanVideos() {
    const found = [];
    walk(document, found);
    return found;
  }

  function walk(rootNode, out, depth) {
    depth = depth || 0;
    let list;
    try {
      list = rootNode.querySelectorAll('video');
    } catch (e) {
      return;
    }
    for (const v of list) if (!out.includes(v)) out.push(v);
    if (depth > 3) return;
    // 递归进 shadow DOM（很多自定义播放器把 <video> 藏在里面）
    let all;
    try {
      all = rootNode.querySelectorAll('*');
    } catch (e) {
      return;
    }
    for (const el of all) {
      if (el.shadowRoot) walk(el.shadowRoot, out, depth + 1);
    }
  }

  function labelOf(v, i) {
    const s = v.currentSrc || v.src || '';
    let name = '';
    try {
      const u = new URL(s, location.href);
      name = /^blob:/i.test(u.protocol) ? '(blob 流)' : decodeURIComponent(u.pathname.split('/').pop() || '');
    } catch (e) {
      name = s.slice(-24);
    }
    if (!name) name = (document.title || '').slice(0, 24);
    return (name || '视频 ' + (i + 1)).slice(0, 36);
  }

  function syncVideos() {
    if (!App.enabled) return;
    const list = scanVideos();
    // 清理已移除的
    for (let i = App.videos.length - 1; i >= 0; i--) {
      if (!App.videos[i].el.isConnected) {
        App.videos[i].overlay.destroy();
        App.videos.splice(i, 1);
      }
    }
    for (const v of list) {
      if (App.videos.some((x) => x.el === v)) continue;
      const item = {
        el: v,
        label: labelOf(v, App.videos.length),
        w: v.videoWidth,
        h: v.videoHeight,
        overlay: new AVS.SubtitleOverlay(v),
      };
      App.videos.push(item);
      v.addEventListener('loadedmetadata', () => {
        item.w = v.videoWidth;
        item.h = v.videoHeight;
        if (App.videos[App.index] === item) refreshKey();
      });
      v.addEventListener('play', () => {
        const idx = App.videos.findIndex((x) => x.el === v);
        if (idx >= 0 && !App.userPicked) selectVideo(idx, true);
      });
      v.addEventListener('seeked', () => markDirty());
      // 允许直接把字幕文件拖到视频上
      v.addEventListener('dragover', (e) => e.preventDefault());
      v.addEventListener('drop', (e) => {
        e.preventDefault();
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) App.loadFile(f);
      });
    }
    if (App.index < 0 || App.index >= App.videos.length) {
      const idx = pickDefault();
      if (idx >= 0) selectVideo(idx, true);
    }
    if (App.panel) App.panel.sync();
  }

  function pickDefault() {
    if (!App.videos.length) return -1;
    let best = 0;
    let bestScore = -1;
    App.videos.forEach((v, i) => {
      const r = v.el.getBoundingClientRect();
      const score = r.width * r.height + (v.el.paused ? 0 : 1e7);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  function markDirty() {
    App._dirty = true;
  }

  /* ================= 选中视频 ================= */

  function selectVideo(i, silent) {
    if (i < 0 || i >= App.videos.length) return;
    if (i !== App.index) {
      App.index = i;
      App.videos.forEach((v, k) => v.overlay.setSelected(k === i));
      refreshKey();
    }
    if (!silent) App.userPicked = true;
    if (App.panel) App.panel.sync();
  }

  /**
   * 视频身份变化时同步存档。
   * 这里曾经有个致命 bug：异步回调会无条件用存档覆盖（没有存档就清空），
   * 而 loadedmetadata / 切清晰度会让它晚于用户操作触发 —— 用户刚载入的字幕被瞬间抹掉。
   * 现在：切换视频先同步清空，异步回调只在「用户尚未手动介入」时才套用存档。
   */
  function refreshKey() {
    const item = App.videos[App.index];
    if (!item) return;
    const key = videoKey(item.el, App.index);
    if (key === App.libKey) return;
    App.libKey = key;
    App.userLoaded = false;
    // 换视频：立即清掉上一条视频的字幕（同步，避免闪旧字幕）
    App.cues = [];
    App.offset = 0;
    App.fileName = '';
    App.activeIdx = -1;
    App.recIdx = -1;
    App.recStart = null;
    App.cueRev++;

    loadFromStore(key, (rec) => {
      if (key !== App.libKey) return; // key 又变了，丢弃这次结果
      if (App.userLoaded) return; // 用户已经在等待期间手动载入过，绝不覆盖
      if (!rec) return; // 没有存档就保持现状，不要清空
      App.cues = unpackCues(rec.c);
      App.offset = +rec.o || 0;
      App.fileName = rec.n || '';
      App.style = Object.assign({}, AVS.DEFAULT_STYLE, rec.st || {});
      App.rev = rec.rev || 0;
      App.activeIdx = -1;
      App.cueRev++;
      markDirty();
      if (App.panel) App.panel.sync();
    });
  }

  /* ================= 字幕查找与渲染 ================= */

  function findCue(cues, t) {
    let lo = 0;
    let hi = cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = cues[mid];
      if (t < c.start) hi = mid - 1;
      else if (t >= c.end) lo = mid + 1;
      else return mid;
    }
    return -1;
  }

  function tick() {
    requestAnimationFrame(tick);
    if (!App.enabled) return;
    const item = App.videos[App.index];
    if (!item || !item.el.isConnected) return;
    const v = item.el;
    const vt = v.currentTime;
    App.time = vt;
    App.duration = v.duration;
    const st = vt - App.offset / 1000;
    const idx = findCue(App.cues, st);
    if (idx !== App.activeIdx) {
      App.activeIdx = idx;
      markDirty();
    }
    item.overlay.render(idx >= 0 ? App.cues[idx].text : '');

    if (App.panel) {
      App.panel.tick();
      const now = performance.now();
      if (!App._lastSync || now - App._lastSync > 400) {
        App._lastSync = now;
        App.panel.sync();
      }
    }
  }

  /* ================= 对外操作 ================= */

  function sortCues() {
    App.cues.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  App.selectVideo = (i) => selectVideo(i, false);

  App.seek = (t) => {
    const item = App.videos[App.index];
    if (item) {
      try {
        item.el.currentTime = Math.max(0, t + App.offset / 1000);
      } catch (e) {}
    }
  };

  App.setOffset = (ms) => {
    App.offset = Math.round(ms);
    markDirty();
    offsetToast();
    if (App.panel) App.panel.sync();
  };

  /** 偏移变化有时在画面上几乎看不出来（尤其视频暂停时），给个明确反馈 */
  function offsetToast() {
    const item = App.videos[App.index];
    if (!item) return;
    const ms = App.offset;
    const txt =
      ms === 0
        ? '偏移已归零'
        : ms > 0
        ? `字幕延后 ${(ms / 1000).toFixed(1)}s`
        : `字幕提前 ${(-ms / 1000).toFixed(1)}s`;
    item.overlay.toast(txt);
  }

  App.setStyle = (patch) => {
    App.style = Object.assign({}, App.style, patch);
    App.videos.forEach((v) => v.overlay.applyStyle(App.style));
    // 样式写回全局默认，供 popup 读取
    store.get([KEY_SET], (res) => {
      const s = (res && res[KEY_SET]) || {};
      s.style = App.style;
      store.set({ [KEY_SET]: s });
    });
    if (App.panel) App.panel.sync();
  };

  App.setPanelPos = (pos) => {
    App.panelPos = pos;
    store.get([KEY_SET], (res) => {
      const s = (res && res[KEY_SET]) || {};
      s.panelPos = pos;
      store.set({ [KEY_SET]: s });
    });
  };

  App.loadText = (text, name) => {
    const item = App.videos[App.index];
    const dur = item && isFinite(item.el.duration) ? item.el.duration : 0;
    const cues = AVS.parse(text, { duration: dur });
    if (!cues.length) {
      flash('没解析出字幕，检查一下格式');
      return;
    }
    App.cues = cues;
    App.fileName = name || '字幕';
    App.offset = 0;
    App.activeIdx = -1;
    App.userLoaded = true; // 手动载入后，延迟到达的存档回调不许再覆盖
    App.cueRev++;
    markDirty();
    if (App.panel) App.panel.sync();
    flash(`已载入 ${cues.length} 条`);
  };

  App.loadFile = (file) => {
    const fr = new FileReader();
    fr.onload = () => App.loadText(String(fr.result || ''), file.name);
    fr.onerror = () => flash('读取文件失败');
    fr.readAsText(file, 'utf-8');
  };

  App.updateCue = (i, patch) => {
    const c = App.cues[i];
    if (!c) return;
    Object.assign(c, patch);
    if (patch.start !== undefined || patch.end !== undefined) sortCues();
    App.userLoaded = true;
    App.cueRev++;
    markDirty();
  };

  App.removeCue = (i) => {
    App.cues.splice(i, 1);
    if (App.recIdx === i) App.recIdx = -1;
    else if (App.recIdx > i) App.recIdx--;
    App.cueRev++;
    markDirty();
    if (App.panel) App.panel.sync();
  };

  App.addCueAtCurrent = () => {
    const item = App.videos[App.index];
    const t = item ? item.el.currentTime - App.offset / 1000 : 0;
    const c = { start: t, end: t + 2, text: '' };
    App.cues.push(c);
    sortCues();
    App.cueRev++;
    App.userLoaded = true;
    const idx = App.cues.indexOf(c);
    focusCue(idx);
    markDirty();
    if (App.panel) App.panel.sync();
  };

  App.toggleRec = () => {
    App.rec = !App.rec;
    if (!App.rec) {
      App.recStart = null;
      App.recIdx = -1;
    } else {
      App.recStart = null;
      App.recIdx = -1;
    }
    if (App.panel) App.panel.sync();
  };

  const subNow = () => {
    const item = App.videos[App.index];
    return item ? item.el.currentTime - App.offset / 1000 : 0;
  };

  /** Alt+Z：打点。无录制中→开新条；有→给上一条收尾并立刻开下一条 */
  App.stampStart = () => {
    if (!App.rec) App.rec = true;
    const t = subNow();
    if (App.recIdx >= 0 && App.cues[App.recIdx]) {
      const prev = App.cues[App.recIdx];
      if (t - prev.start > 0.15) prev.end = t;
      else prev.end = prev.start + 1;
    }
    const c = { start: t, end: t + 2, text: '' };
    App.cues.push(c);
    sortCues();
    App.recIdx = App.cues.indexOf(c);
    App.recStart = t;
    App.cueRev++;
    App.userLoaded = true;
    focusCue(App.recIdx);
    markDirty();
    if (App.panel) App.panel.sync();
  };

  /** Alt+X：给当前条收尾，停止连续打轴 */
  App.stampEnd = () => {
    const t = subNow();
    if (App.recIdx >= 0 && App.cues[App.recIdx]) {
      const c = App.cues[App.recIdx];
      if (t - c.start > 0.15) c.end = t;
      focusCue(App.recIdx);
    }
    App.rec = false;
    App.recStart = null;
    App.recIdx = -1;
    App.cueRev++;
    markDirty();
    if (App.panel) App.panel.sync();
  };

  /**
   * 把某条字幕的起点对齐到此刻。
   * 原来只认 activeIdx（当前正在显示的那一句），停在两句之间的空隙时点了没反应，
   * 现在回退到「下一句即将出现的字幕」——这才是对轴时真正想对齐的那句。
   */
  App.alignToCurrent = () => {
    const item = App.videos[App.index];
    if (!item || !App.cues.length) {
      flash('先载入字幕再对齐');
      return;
    }
    const st = item.el.currentTime - App.offset / 1000;
    let c = App.cues[App.activeIdx];
    if (!c) c = App.cues.find((x) => x.start > st) || App.cues[App.cues.length - 1];
    if (!c) return;
    App.offset = Math.round((item.el.currentTime - c.start) * 1000);
    App.userLoaded = true;
    markDirty();
    const ms = App.offset;
    const tip =
      ms === 0
        ? '已对齐（无偏移）'
        : `已对齐：字幕${ms > 0 ? '延后' : '提前'} ${Math.abs(ms / 1000).toFixed(1)}s`;
    item.overlay.toast(tip);
    if (App.panel) App.panel.sync();
    flash(tip);
  };

  App.clear = () => {
    App.cues = [];
    App.offset = 0;
    App.fileName = '';
    App.recIdx = -1;
    App.recStart = null;
    App.userLoaded = true;
    App.cueRev++;
    markDirty();
    if (App.panel) App.panel.sync();
  };

  App.save = saveToStore;

  App.export = (fmt) => {
    if (!App.cues.length) {
      flash('没有字幕可导出');
      return;
    }
    const text = fmt === 'vtt' ? AVS.toVTT(App.cues) : AVS.toSRT(App.cues);
    const base = (App.fileName || 'subtitles').replace(/\.[^.]+$/, '');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.${fmt}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  };

  function focusCue(i) {
    if (!App.panel || i < 0) return;
    App.panel.near = true;
    App.panel.renderList(true);
    const row = App.panel.sr.querySelector(`.cue[data-i="${i}"]`);
    if (!row) return;
    const ta = row.querySelector('.tx');
    if (ta) {
      ta.focus();
      if (row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    }
  }

  /* ================= 快捷键 ================= */

  function isTypingTarget(t) {
    if (!t) return false;
    if (t.tagName === 'AVS-PANEL') return false; // 自己的面板：允许快捷键
    const tn = t.tagName;
    return tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || t.isContentEditable;
  }

  function onKey(e) {
    if (!App.enabled || !e.altKey || e.ctrlKey || e.metaKey) return;
    if (isTypingTarget(e.target)) return;
    if (!App.videos.length) return;
    const code = e.code;
    if (code === 'KeyZ' || code === 'KeyX' || code === 'KeyA' || code === 'KeyP') {
      e.preventDefault();
      e.stopPropagation();
      if (code === 'KeyZ') App.stampStart();
      else if (code === 'KeyX') App.stampEnd();
      else if (code === 'KeyA') App.alignToCurrent();
      else {
        const item = App.videos[App.index];
        if (item) item.el.paused ? item.el.play().catch(() => {}) : item.el.pause();
      }
    } else if (code === 'KeyS' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (App.panel) App.panel.toggle();
    } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
      // 边播边微调：Alt+← 字幕提前 250ms，Alt+→ 字幕延后 250ms
      e.preventDefault();
      e.stopPropagation();
      App.setOffset(App.offset + (code === 'ArrowRight' ? 250 : -250));
    }
  }

  /* ================= 启动 ================= */

  function boot(settings) {
    const s = settings || {};
    App.enabled = s.enabled !== false;
    App.isTop = root === root.top;
    if (s.style) App.style = Object.assign({}, AVS.DEFAULT_STYLE, s.style);
    if (s.panelPos) App.panelPos = s.panelPos;

    syncVideos();
    App.videos.forEach((v) => v.overlay.applyStyle(App.style));

    if (App.isTop && App.enabled) App.panel = new AVS.Panel(App);

    // 新增/移除 <video> 时重新扫描
    const mo = new MutationObserver(() => {
      clearTimeout(App._moT);
      App._moT = setTimeout(syncVideos, 400);
    });
    try {
      mo.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(() => {
      if (!document.hidden) syncVideos();
    }, 5000);

    window.addEventListener('keydown', onKey, true);
    requestAnimationFrame(tick);

    // 注意：onChanged 挂在 chrome.storage 上，不是 chrome.storage.local
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== 'local') return;
        if (ch[KEY_SUBS] && App.libKey) {
          const m = ch[KEY_SUBS].newValue || {};
          const rec = m[App.libKey];
          // 只接受别的帧/别的页面写入的新版本，忽略自己刚写的
          if (rec && rec.rev && rec.rev !== App.rev) {
            App.cues = unpackCues(rec.c);
            App.offset = +rec.o || 0;
            App.fileName = rec.n || '';
            App.rev = rec.rev;
            App.cueRev++;
            markDirty();
            if (App.panel) App.panel.sync();
          }
        }
        if (ch[KEY_SET]) {
          const s2 = ch[KEY_SET].newValue || {};
          if (typeof s2.enabled === 'boolean' && s2.enabled !== App.enabled) setEnabled(s2.enabled);
          if (s2.style && JSON.stringify(s2.style) !== JSON.stringify(App.style)) {
            App.style = Object.assign({}, AVS.DEFAULT_STYLE, s2.style);
            App.videos.forEach((v) => v.overlay.applyStyle(App.style));
            if (App.panel) App.panel.sync();
          }
        }
      });
    }

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, send) => {
        if (!msg || !msg.type) return;
        switch (msg.type) {
          case 'AVS_TOGGLE':
            if (App.panel) App.panel.toggle();
            else if (App.enabled && App.isTop) App.panel = new AVS.Panel(App);
            send && send({ ok: true });
            break;
          case 'AVS_OPEN':
            if (!App.panel && App.enabled && App.isTop) App.panel = new AVS.Panel(App);
            if (App.panel) App.panel.setVisible(true);
            send && send({ ok: true });
            break;
          case 'AVS_STYLE':
            if (msg.style) {
              App.style = Object.assign({}, AVS.DEFAULT_STYLE, msg.style);
              App.videos.forEach((v) => v.overlay.applyStyle(App.style));
              if (App.panel) App.panel.sync();
            }
            send && send({ ok: true });
            break;
          case 'AVS_STATE':
            send &&
              send({ enabled: App.enabled, count: App.cues.length, name: App.fileName, videos: App.videos.length });
            break;
        }
      });
    }
  }

  function setEnabled(on) {
    App.enabled = on;
    if (!on) {
      App.videos.forEach((v) => {
        v.overlay.render('');
        v.overlay.destroy();
      });
      App.videos = [];
      App.index = -1;
      if (App.panel) {
        App.panel.host.remove();
        App.panel = null;
      }
    } else if (!App.videos.length) {
      syncVideos();
      App.videos.forEach((v) => v.overlay.applyStyle(App.style));
      if (App.isTop && !App.panel) App.panel = new AVS.Panel(App);
    }
  }

  store.get([KEY_SET], (res) => boot(res && res[KEY_SET]));
})(typeof window !== 'undefined' ? window : this);
