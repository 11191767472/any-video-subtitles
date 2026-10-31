/**
 * overlay.js — 字幕渲染层
 * 用一个独立的 shadow host 挂在 <body>（或全屏元素）上，
 * 位置用 position:fixed 跟随 video.getBoundingClientRect()，
 * 每帧对齐，天然兼容滚动 / CSS 动画 / 伪全屏 / 原生全屏。
 */
(function (root) {
  'use strict';
  const AVS = (root.AVS = root.AVS || {});

  const DEFAULT_STYLE = {
    rel: 5.5, // 字号 = 视频高度 * rel%
    color: '#ffffff',
    bgOn: true,
    bg: '#000000',
    bgOpacity: 55,
    outlineOn: true,
    shadowOn: true,
    weight: 700,
    bottom: 8, // 距视频底部 %
    maxWidth: 90, // 最大宽度占视频宽度 %
    lineHeight: 1.35,
    family: '', // 留空用系统默认
  };

  const CSS = `
:host{all:initial;}
.wrap{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;}
.ring{position:absolute;inset:0;box-shadow:inset 0 0 0 3px rgba(66,133,244,.95);border-radius:2px;
  opacity:0;transition:opacity .15s;}
.wrap.sel .ring{opacity:1;}
.stage{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;align-items:flex-end;}
.txt{max-width:100%;white-space:pre-wrap;word-break:break-word;text-align:center;
  display:inline-block;padding:.12em .45em;border-radius:.18em;opacity:0;transition:opacity .12s linear;}
.txt.on{opacity:1;}
.txt.blank{display:none;}
.toast{position:absolute;left:50%;top:6%;transform:translate(-50%,-6px);pointer-events:none;
  background:rgba(0,0,0,.78);color:#fff;padding:.32em .8em;border-radius:.5em;font-size:13px;
  font-weight:600;letter-spacing:.3px;white-space:nowrap;opacity:0;transition:opacity .16s,transform .16s;}
.toast.on{opacity:1;transform:translate(-50%,0);}
`;

  class SubtitleOverlay {
    constructor(video) {
      this.video = video;
      this.style = Object.assign({}, DEFAULT_STYLE);
      this.text = '';
      this.visible = false;
      this._raf = 0;
      this._last = { x: -1, y: -1, w: -1, h: -1 };

      this.host = document.createElement('avs-overlay');
      this.sr = this.host.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = CSS;
      this.sr.appendChild(styleEl);

      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      wrap.innerHTML =
        '<div class="ring"></div><div class="stage"><span class="txt"></span></div><div class="toast"></div>';
      this.sr.appendChild(wrap);
      this.wrap = wrap;
      this.el = wrap.querySelector('.txt');
      this.stage = wrap.querySelector('.stage');
      this.toastEl = wrap.querySelector('.toast');

      this._onFs = () => this._reparent();
      document.addEventListener('fullscreenchange', this._onFs, true);
      document.addEventListener('webkitfullscreenchange', this._onFs, true);

      this._reparent();
      this._loop = this._loop.bind(this);
      this._raf = requestAnimationFrame(this._loop);
      this.applyStyle(this.style);
    }

    /** 全屏时 overlay 必须挂进全屏元素，否则会被浏览器遮罩挡住 */
    _hostParent() {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs && (fs === this.video || fs.contains(this.video))) return fs;
      return document.body || document.documentElement;
    }

    _reparent() {
      const p = this._hostParent();
      if (this.host.parentNode !== p) {
        try {
          p.appendChild(this.host);
        } catch (e) {
          /* 某些宿主节点不允许 append，退回 documentElement */
          (document.body || document.documentElement).appendChild(this.host);
        }
      }
    }

    _loop() {
      this._raf = requestAnimationFrame(this._loop);
      const v = this.video;
      if (!v.isConnected) return;
      const r = v.getBoundingClientRect();
      if (Math.abs(r.width) < 2 || Math.abs(r.height) < 2) {
        if (this._last.w !== 0) {
          this.wrap.style.width = '0px';
          this.wrap.style.height = '0px';
          this._last.w = 0;
        }
        return;
      }
      const l = this._last;
      if (Math.abs(r.left - l.x) < 0.5 && Math.abs(r.top - l.y) < 0.5 && Math.abs(r.width - l.w) < 0.5 && Math.abs(r.height - l.h) < 0.5) {
        return;
      }
      l.x = r.left;
      l.y = r.top;
      l.w = r.width;
      l.h = r.height;
      this.wrap.style.transform = `translate(${r.left}px,${r.top}px)`;
      this.wrap.style.width = r.width + 'px';
      this.wrap.style.height = r.height + 'px';
      this._sizeFont(r.height);
    }

    _sizeFont(h) {
      this.el.style.fontSize = Math.max(10, (h * this.style.rel) / 100) + 'px';
    }

    /**
     * 蓝框只在「选中切换的瞬间」闪一下（约 1.2s 后淡出），不常驻。
     * 常驻描边会一直压在画面上，用户明确要求去掉；保留瞬时提示是为了切视频时知道选中了谁。
     */
    setSelected(on, holdMs) {
      clearTimeout(this._selT);
      if (!on) {
        this.wrap.classList.remove('sel');
        return;
      }
      this.wrap.classList.add('sel');
      this._selT = setTimeout(() => this.wrap.classList.remove('sel'), holdMs || 1200);
    }

    applyStyle(s) {
      this.style = Object.assign({}, DEFAULT_STYLE, s || {});
      const st = this.style;
      const t = this.el;
      t.style.color = st.color;
      t.style.fontWeight = st.weight;
      t.style.lineHeight = st.lineHeight;
      t.style.fontFamily = st.family || 'inherit';
      t.style.background = st.bgOn ? hexA(st.bg, st.bgOpacity / 100) : 'transparent';
      t.style.padding = st.bgOn ? '.12em .45em' : '0';
      t.style.borderRadius = st.bgOn ? '.18em' : '0';
      const stroke = Math.max(1, (st.rel / 100) * 22);
      t.style.webkitTextStroke = st.outlineOn ? `${stroke}px #000` : '0';
      t.style.paintOrder = 'stroke fill';
      t.style.textShadow = st.shadowOn && !st.outlineOn ? '0 2px 6px rgba(0,0,0,.9)' : 'none';
      this.stage.style.bottom = st.bottom + '%';
      this.stage.style.left = (100 - st.maxWidth) / 2 + '%';
      this.stage.style.right = (100 - st.maxWidth) / 2 + '%';
      const r = this.video.getBoundingClientRect();
      this._sizeFont(r.height || 0);
    }

    /** text 为空字符串表示「当前没有字幕」，会隐藏而不是闪一个空框 */
    render(text) {
      if (text === this._shown) return;
      this._shown = text;
      if (!text) {
        this.el.classList.remove('on');
        this.el.textContent = '';
        return;
      }
      this.el.textContent = text;
      this.el.classList.add('on');
    }

    /** 短暂提示（偏移变化、对齐结果等），1.1 秒后自动消失 */
    toast(msg) {
      if (!this.toastEl) return;
      this.toastEl.textContent = msg;
      this.toastEl.classList.add('on');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => this.toastEl.classList.remove('on'), 1100);
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._toastT);
      clearTimeout(this._selT);
      document.removeEventListener('fullscreenchange', this._onFs, true);
      document.removeEventListener('webkitfullscreenchange', this._onFs, true);
      this.host.remove();
    }
  }

  function hexA(hex, a) {
    const h = String(hex || '#000').replace('#', '');
    const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(s, 16);
    if (!isFinite(n)) return `rgba(0,0,0,${a})`;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  AVS.SubtitleOverlay = SubtitleOverlay;
  AVS.DEFAULT_STYLE = DEFAULT_STYLE;
  AVS.hexA = hexA;
})(typeof window !== 'undefined' ? window : this);
