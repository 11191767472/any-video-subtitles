/**
 * panel.js — 字幕控制面板（shadow DOM，避免污染页面样式）
 * 依赖 app 提供的状态与方法，见 content.js。
 */
(function (root) {
  'use strict';
  const AVS = (root.AVS = root.AVS || {});
  const F = AVS.formatShort;
  const P = AVS.parseShort;

  const CSS = `
:host{all:initial;}
*{box-sizing:border-box;}
.p{position:fixed;z-index:2147483646;width:332px;max-height:82vh;display:flex;flex-direction:column;
  background:rgba(24,26,30,.96);color:#e8eaed;border:1px solid rgba(255,255,255,.12);
  border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.55);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  overflow:hidden;backdrop-filter:blur(8px);}
.p.hide{display:none;}
.hd{display:flex;align-items:center;gap:6px;padding:9px 10px;cursor:move;user-select:none;
  background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border-bottom:1px solid rgba(255,255,255,.1);}
.hd b{font-size:13px;font-weight:600;flex:1;letter-spacing:.3px;}
.hd button{all:unset;cursor:pointer;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;color:#b9bec7;}
.hd button:hover{background:rgba(255,255,255,.12);color:#fff;}
.bd{overflow:auto;padding:8px 10px 10px;}
.sec{margin-bottom:10px;padding-bottom:9px;border-bottom:1px dashed rgba(255,255,255,.1);}
.sec:last-child{border:0;margin-bottom:0;}
.lb{font-size:11px;color:#8f959e;margin:0 0 5px;letter-spacing:.4px;text-transform:uppercase;}
.row{display:flex;gap:5px;align-items:center;flex-wrap:wrap;}
button.b{all:unset;cursor:pointer;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.09);
  color:#e8eaed;font-size:12px;white-space:nowrap;border:1px solid rgba(255,255,255,.08);}
button.b:hover{background:rgba(255,255,255,.18);}
button.b.pri{background:#3b6ef5;border-color:#3b6ef5;color:#fff;}
button.b.pri:hover{background:#5a86ff;}
button.b.rec{background:#e0344b;border-color:#e0344b;color:#fff;}
button.b.sm{padding:2px 6px;font-size:11px;}
select,input[type=text],input[type=number],textarea{background:rgba(0,0,0,.35);color:#e8eaed;
  border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:3px 6px;font-size:12px;font-family:inherit;}
select{width:100%;}
textarea{width:100%;resize:vertical;min-height:34px;}
input[type=color]{width:26px;height:22px;padding:0;border:1px solid rgba(255,255,255,.2);border-radius:5px;background:none;}
input[type=range]{width:100%;accent-color:#3b6ef5;}
label.ck{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#c8ccd3;cursor:pointer;}
.hint{font-size:11px;color:#7d838c;margin-top:5px;line-height:1.45;}
.src{font-size:11px;color:#9aa0a8;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.list{max-height:300px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(0,0,0,.22);}
.cue{display:grid;grid-template-columns:34px 76px 76px 1fr 22px;gap:4px;align-items:center;
  padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11.5px;}
.cue:last-child{border-bottom:0;}
.cue.act{background:rgba(59,110,245,.28);}
.cue.rec{background:rgba(224,52,75,.3);}
.cue .i{color:#7d838c;text-align:right;font-variant-numeric:tabular-nums;}
.cue input,.cue textarea{font-size:11px;padding:1px 3px;width:100%;background:rgba(0,0,0,.3);
  border:1px solid transparent;border-radius:4px;color:#dfe3e8;font-variant-numeric:tabular-nums;}
.cue input:focus,.cue textarea:focus{border-color:#3b6ef5;background:rgba(0,0,0,.5);}
.cue textarea{resize:none;overflow:hidden;min-height:18px;line-height:1.35;}
.cue .x{all:unset;cursor:pointer;color:#8f959e;text-align:center;font-size:14px;line-height:1;}
.cue .x:hover{color:#ff6b6b;}
.fab{position:fixed;z-index:2147483646;right:18px;bottom:90px;width:40px;height:40px;border-radius:50%;
  background:rgba(24,26,30,.92);color:#e8eaed;border:1px solid rgba(255,255,255,.15);cursor:pointer;
  display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;
  box-shadow:0 6px 20px rgba(0,0,0,.5);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}
.fab.hide{display:none;}
.kbd{display:inline-block;padding:0 4px;border:1px solid rgba(255,255,255,.22);border-radius:4px;font-size:10.5px;background:rgba(255,255,255,.06);}
`;

  const TPL = `
<div class="p">
  <div class="hd"><b>字幕 · 任意网页视频</b>
    <button data-a="min" title="收起">－</button>
    <button data-a="close" title="关闭(Alt+Shift+S)">×</button>
  </div>
  <div class="bd">
    <div class="sec">
      <div class="lb">视频</div>
      <select data-r="vsel"></select>
      <div class="src" data-r="vinfo"></div>
    </div>

    <div class="sec">
      <div class="lb">字幕来源</div>
      <div class="row">
        <button class="b pri" data-a="file">选择文件</button>
        <button class="b" data-a="paste">粘贴文本</button>
        <button class="b" data-a="add">+ 新增一条</button>
      </div>
      <div class="src" data-r="src"></div>
      <div class="hint">支持 .srt / .vtt / .ass / .txt（可直接把文件拖进这个面板，或拖到视频上）</div>
      <div data-r="pasteBox" style="display:none;margin-top:6px">
        <textarea data-r="pasteTa" rows="4" placeholder="粘贴 SRT/VTT 内容，或纯台词（空行分段，自动分配时间）"></textarea>
        <div class="row" style="margin-top:4px">
          <button class="b pri" data-a="pasteOk">载入</button>
          <button class="b" data-a="pasteCancel">取消</button>
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="lb">打轴（手动做时间轴）</div>
      <div class="row">
        <button class="b" data-a="rec">● 开始打轴</button>
        <button class="b sm" data-a="stamp">Alt+Z 打点</button>
        <button class="b sm" data-a="cut">Alt+X 收尾</button>
      </div>
      <div class="src" data-r="rec"></div>
      <div class="hint">边播边听：每句开始时按 <span class="kbd">Alt+Z</span>（上一句自动收尾并开新句），全部打完按
        <span class="kbd">Alt+X</span> 收尾。打点后直接在列表里输入台词。
        另有 <span class="kbd">Alt+A</span> 把当前字幕起点对齐此刻，<span class="kbd">Alt+P</span> 播放/暂停。</div>
    </div>

    <div class="sec">
      <div class="lb">同步（毫秒）</div>
      <div class="row">
        <button class="b sm" data-a="off-1000" title="字幕提前 1 秒出现">◀ 提前1s</button>
        <button class="b sm" data-a="off-100">-100ms</button>
        <input type="number" data-r="off" style="width:74px" step="100" title="偏移量(ms)，正数=字幕延后">
        <button class="b sm" data-a="off100">+100ms</button>
        <button class="b sm" data-a="off1000" title="字幕延后 1 秒出现">延后1s ▶</button>
        <button class="b sm" data-a="align">对齐当前句</button>
        <button class="b sm" data-a="off0">归零</button>
      </div>
      <div class="hint">字幕比人声<b>早</b> → 点「延后」；比人声<b>晚</b> → 点「提前」。
        边播边调用 <span class="kbd">Alt</span>+<span class="kbd">←/→</span>（±250ms）更顺手；
        「对齐当前句」会把当前（或下一句）字幕的起点直接对齐到此刻。</div>
    </div>

    <div class="sec">
      <div class="lb">样式</div>
      <div class="row" style="margin-bottom:4px">
        <span style="width:34px;font-size:11px;color:#9aa0a8">字号</span>
        <input type="range" data-r="rel" min="2" max="14" step="0.1" style="flex:1">
        <span data-r="relV" style="width:34px;text-align:right;font-size:11px;color:#9aa0a8"></span>
      </div>
      <div class="row" style="margin-bottom:4px">
        <span style="width:34px;font-size:11px;color:#9aa0a8">位置</span>
        <input type="range" data-r="bottom" min="0" max="60" step="1" style="flex:1">
        <span data-r="bottomV" style="width:34px;text-align:right;font-size:11px;color:#9aa0a8"></span>
      </div>
      <div class="row">
        <span style="font-size:11px;color:#9aa0a8">文字</span><input type="color" data-r="color">
        <label class="ck"><input type="checkbox" data-r="outline">描边</label>
        <label class="ck"><input type="checkbox" data-r="bold">粗体</label>
        <label class="ck"><input type="checkbox" data-r="bgOn">底衬</label>
        <input type="color" data-r="bg">
      </div>
    </div>

    <div class="sec">
      <div class="lb">字幕列表（<span data-r="count">0</span> 条）</div>
      <div class="row" style="margin-bottom:5px">
        <label class="ck"><input type="checkbox" data-r="near" checked>只看附近</label>
        <input type="text" data-r="q" placeholder="搜索文本…" style="flex:1;min-width:90px">
      </div>
      <div class="list" data-r="list"></div>
    </div>

    <div class="sec">
      <div class="row">
        <button class="b" data-a="srt">导出 SRT</button>
        <button class="b" data-a="vtt">导出 VTT</button>
        <button class="b pri" data-a="save">保存到本视频</button>
        <button class="b" data-a="clear">清空</button>
      </div>
      <div class="hint" data-r="saveHint">保存后，下次打开同一视频会自动加载。</div>
    </div>
  </div>
</div>
<div class="fab hide" data-a="fab" title="打开字幕面板">字</div>
<input type="file" data-r="file" accept=".srt,.vtt,.ass,.ssa,.txt,.json" style="display:none">
`;

  class Panel {
    constructor(app) {
      this.app = app;
      this.visible = false;
      this.near = true;
      this.q = '';
      this.editing = false;
      this._rendered = '';

      this.host = document.createElement('avs-panel');
      const sr = this.host.attachShadow({ mode: 'open' });
      const st = document.createElement('style');
      st.textContent = CSS;
      sr.appendChild(st);
      const box = document.createElement('div');
      box.innerHTML = TPL;
      sr.appendChild(box);
      this.sr = sr;
      this.$ = (sel) => sr.querySelector(sel);
      this.$$ = (sel) => Array.from(sr.querySelectorAll(sel));

      (document.body || document.documentElement).appendChild(this.host);
      this._bind();
      this._place(app.panelPos);
      this.sync();
      // 默认收起：只保留右下角浮动按钮，点它 / Alt+Shift+S / popup「打开面板」再展开
      this.setVisible(false);
    }

    /* ---------- 通用 ---------- */

    _place(pos) {
      const p = this.$('.p');
      const x = pos && typeof pos.x === 'number' ? pos.x : Math.max(12, window.innerWidth - 352);
      const y = pos && typeof pos.y === 'number' ? pos.y : 80;
      p.style.left = Math.min(Math.max(0, x), Math.max(0, window.innerWidth - 120)) + 'px';
      p.style.top = Math.min(Math.max(0, y), Math.max(0, window.innerHeight - 80)) + 'px';
      this.$('.fab').style.top = p.style.top;
    }

    setVisible(v) {
      this.visible = v;
      this.$('.p').classList.toggle('hide', !v);
      this.$('.fab').classList.toggle('hide', v);
      if (v) this.sync();
    }

    toggle() {
      this.setVisible(!this.visible);
    }

    _bind() {
      const sr = this.sr;

      sr.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const a = b.dataset.a;
        this.act(a);
      });

      // 拖拽
      const hd = this.$('.hd');
      let drag = null;
      hd.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        const p = this.$('.p');
        drag = { dx: e.clientX - p.getBoundingClientRect().left, dy: e.clientY - p.getBoundingClientRect().top };
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!drag) return;
        const p = this.$('.p');
        p.style.left = e.clientX - drag.dx + 'px';
        p.style.top = e.clientY - drag.dy + 'px';
      });
      window.addEventListener('mouseup', () => {
        if (!drag) return;
        drag = null;
        const r = this.$('.p').getBoundingClientRect();
        this.app.setPanelPos({ x: r.left, y: r.top });
      });

      // 文件
      this.$('[data-r="file"]').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) this.app.loadFile(f);
        e.target.value = '';
      });

      // 拖放
      const stop = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      ['dragenter', 'dragover'].forEach((t) => sr.addEventListener(t, stop));
      sr.addEventListener('drop', (e) => {
        stop(e);
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this.app.loadFile(f);
        else {
          const txt = e.dataTransfer && e.dataTransfer.getData('text');
          if (txt) this.app.loadText(txt, '拖入的文本');
        }
      });

      // 偏移输入
      this.$('[data-r="off"]').addEventListener('change', (e) => {
        const v = parseFloat(e.target.value);
        this.app.setOffset(isFinite(v) ? v : 0);
      });

      // 样式
      const s = (r, key, fn) => {
        const el = this.$(`[data-r="${r}"]`);
        el.addEventListener('input', () => this.app.setStyle({ [key]: fn(el) }));
        el.addEventListener('change', () => this.app.setStyle({ [key]: fn(el) }));
      };
      s('rel', 'rel', (el) => parseFloat(el.value));
      s('bottom', 'bottom', (el) => parseFloat(el.value));
      s('color', 'color', (el) => el.value);
      s('bg', 'bg', (el) => el.value);
      s('outline', 'outlineOn', (el) => el.checked);
      s('bold', 'weight', (el) => (el.checked ? 700 : 400));
      s('bgOn', 'bgOn', (el) => el.checked);

      this.$('[data-r="near"]').addEventListener('change', (e) => {
        this.near = e.target.checked;
        this.renderList(true);
      });
      this.$('[data-r="q"]').addEventListener('input', (e) => {
        this.q = e.target.value.trim();
        this.renderList(true);
      });
      this.$('[data-r="vsel"]').addEventListener('change', (e) => {
        this.app.selectVideo(parseInt(e.target.value, 10));
      });
    }

    act(a) {
      const app = this.app;
      const d = (n) => app.setOffset(app.offset + n);
      switch (a) {
        case 'close':
        case 'min':
          this.setVisible(false);
          break;
        case 'fab':
          this.setVisible(true);
          break;
        case 'file':
          this.$('[data-r="file"]').click();
          break;
        case 'paste':
          this.$('[data-r="pasteBox"]').style.display = '';
          this.$('[data-r="pasteTa"]').focus();
          break;
        case 'pasteCancel':
          this.$('[data-r="pasteBox"]').style.display = 'none';
          break;
        case 'pasteOk': {
          const t = this.$('[data-r="pasteTa"]').value;
          if (t.trim()) app.loadText(t, '粘贴的文本');
          this.$('[data-r="pasteBox"]').style.display = 'none';
          break;
        }
        case 'add':
          app.addCueAtCurrent();
          break;
        case 'rec':
          app.toggleRec();
          break;
        case 'stamp':
          app.stampStart();
          break;
        case 'cut':
          app.stampEnd();
          break;
        case 'off-1000': d(-1000); break;
        case 'off-100': d(-100); break;
        case 'off100': d(100); break;
        case 'off1000': d(1000); break;
        case 'off0': app.setOffset(0); break;
        case 'align': app.alignToCurrent(); break;
        case 'srt': app.export('srt'); break;
        case 'vtt': app.export('vtt'); break;
        case 'save': app.save(); break;
        case 'clear': app.clear(); break;
      }
    }

    /* ---------- 渲染 ---------- */

    sync() {
      if (!this.visible) return;
      const app = this.app;

      // 视频下拉
      const sel = this.$('[data-r="vsel"]');
      const sig = app.videos.map((v) => (v.src || '').slice(0, 60)).join('|') + '#' + app.index;
      if (this._sig !== sig) {
        this._sig = sig;
        sel.innerHTML = app.videos
          .map(
            (v, i) =>
              `<option value="${i}"${i === app.index ? ' selected' : ''}>#${i + 1} · ${v.label}${
                v.w ? ` · ${v.w}×${v.h}` : ''
              }</option>`
          )
          .join('');
      }
      this.$('[data-r="vinfo"]').textContent = app.videos[app.index]
        ? `${fmtClock(app.time)} / ${fmtClock(app.duration)}`
        : '本页未检测到 <video>';

      this.$('[data-r="src"]').textContent = app.cues.length
        ? `${app.fileName || '未命名'} · ${app.cues.length} 条`
        : '尚未加载字幕';
      this.$('[data-r="count"]').textContent = app.cues.length;

      // 注意：shadow DOM 内的聚焦元素要用 shadowRoot.activeElement 判断，
      // document.activeElement 只会指向宿主 <avs-panel>
      const ae = () => this.sr.activeElement;
      const off = this.$('[data-r="off"]');
      if (ae() !== off) off.value = Math.round(app.offset);

      const sty = app.style;
      const setR = (r, v) => {
        const el = this.$(`[data-r="${r}"]`);
        if (ae() !== el) el.value = v;
      };
      setR('rel', sty.rel);
      setR('bottom', sty.bottom);
      setR('color', sty.color);
      setR('bg', sty.bg);
      const setC = (r, v) => {
        const el = this.$(`[data-r="${r}"]`);
        if (el.checked !== v) el.checked = v;
      };
      setC('outline', sty.outlineOn);
      setC('bold', sty.weight === 700);
      setC('bgOn', sty.bgOn);
      this.$('[data-r="relV"]').textContent = (+sty.rel).toFixed(1);
      this.$('[data-r="bottomV"]').textContent = sty.bottom + '%';

      const recBtn = this.$('[data-a="rec"]');
      recBtn.textContent = app.rec ? '■ 停止打轴' : '● 开始打轴';
      recBtn.classList.toggle('rec', !!app.rec);
      this.$('[data-r="rec"]').textContent = app.rec
        ? app.recStart == null
          ? '等待起点：按 Alt+Z'
          : `录制中 ${F(app.recStart)} → 现在`
        : '';

      this.renderList();
    }

    /** 只更新「当前高亮」，每帧调用，不重建 DOM */
    tick() {
      if (!this.visible) return;
      const list = this.$('[data-r="list"]');
      const act = list.querySelector('.cue.act');
      const want = list.querySelector(`.cue[data-i="${this.app.activeIdx}"]`);
      if (act === want) return;
      if (act) act.classList.remove('act');
      if (want) {
        want.classList.add('act');
        const lr = list.getBoundingClientRect();
        const wr = want.getBoundingClientRect();
        if (wr.top < lr.top + 2 || wr.bottom > lr.bottom - 2) {
          list.scrollTop += wr.top - lr.top - lr.height / 2 + wr.height / 2;
        }
      }
    }

    renderList(force) {
      const app = this.app;
      const list = this.$('[data-r="list"]');
      const cues = app.cues;
      let idxs;
      if (this.q) {
        const q = this.q.toLowerCase();
        idxs = cues.map((c, i) => (c.text.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0);
        idxs = idxs.slice(0, 400);
      } else if (this.near) {
        const a = Math.max(0, app.activeIdx - 20);
        const b = Math.min(cues.length, app.activeIdx + 45);
        idxs = [];
        for (let i = a; i < b; i++) idxs.push(i);
      } else {
        idxs = cues.map((_, i) => i).slice(0, 500);
      }

      const sig = idxs.join(',') + '|' + (app.recStart == null ? '' : app.recStart) + '|' + app.cueRev;
      if (!force && sig === this._rendered) return;
      this._rendered = sig;

      list.innerHTML = idxs
        .map((i) => {
          const c = cues[i];
          if (!c) return '';
          return `<div class="cue${i === app.activeIdx ? ' act' : ''}" data-i="${i}">
            <span class="i">${i + 1}</span>
            <input class="ts" value="${F(c.start)}" title="开始时间">
            <input class="te" value="${F(c.end)}" title="结束时间">
            <textarea class="tx" rows="1">${esc(c.text)}</textarea>
            <button class="x" title="删除">×</button>
          </div>`;
        })
        .join('');

      if (!list.dataset.wired) {
        list.dataset.wired = '1';
        list.addEventListener('change', (e) => {
          const row = e.target.closest('.cue');
          if (!row) return;
          const i = +row.dataset.i;
          if (e.target.classList.contains('ts')) {
            const v = P(e.target.value);
            if (isFinite(v)) this.app.updateCue(i, { start: v });
          } else if (e.target.classList.contains('te')) {
            const v = P(e.target.value);
            if (isFinite(v)) this.app.updateCue(i, { end: v });
          } else if (e.target.classList.contains('tx')) {
            this.app.updateCue(i, { text: e.target.value });
          }
        });
        list.addEventListener('click', (e) => {
          const row = e.target.closest('.cue');
          if (!row) return;
          const i = +row.dataset.i;
          if (e.target.classList.contains('x')) {
            this.app.removeCue(i);
            return;
          }
          if (e.target.classList.contains('ts') || e.target.classList.contains('te')) {
            const c = this.app.cues[i];
            if (c) this.app.seek(e.target.classList.contains('ts') ? c.start : Math.max(c.start, c.end - 0.3));
          }
        });
        // 回车提交文本（不换行）
        list.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !e.target.classList.contains('tx')) return;
          e.preventDefault();
          e.target.blur();
        });
      }
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtClock(t) {
    if (!isFinite(t) || t < 0) return '--:--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  AVS.Panel = Panel;
})(typeof window !== 'undefined' ? window : this);
