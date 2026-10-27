/**
 * parser.js — 字幕格式解析 / 序列化
 * 支持：SRT / WebVTT / ASS(SSA) 基础解析，以及纯文本按句自动分配时间轴。
 * 挂载到 window.AVS.parse 等。
 */
(function (root) {
  'use strict';
  const AVS = (root.AVS = root.AVS || {});

  /* ---------------- 时间工具 ---------------- */

  function fracToMs(frac) {
    if (!frac) return 0;
    const n = parseInt(frac, 10);
    return Math.round((n / Math.pow(10, frac.length)) * 1000);
  }

  function toSec(h, m, s, ms) {
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  /** 12.345 -> "00:00:12.345" (sep 用于 SRT 的 ',') */
  function formatTime(sec, sep) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const total = Math.round(sec * 1000);
    const ms = total % 1000;
    const t = Math.floor(total / 1000);
    const s = t % 60;
    const m = Math.floor(t / 60) % 60;
    const h = Math.floor(t / 3600);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(h)}:${p2(m)}:${p2(s)}${sep}${String(ms).padStart(3, '0')}`;
  }

  /** 紧凑时间，用于面板里的输入框：mm:ss.mmm（超过 1 小时才带 h） */
  function formatShort(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const total = Math.round(sec * 1000);
    const ms = total % 1000;
    const t = Math.floor(total / 1000);
    const s = t % 60;
    const m = Math.floor(t / 60) % 60;
    const h = Math.floor(t / 3600);
    const p2 = (n) => String(n).padStart(2, '0');
    return (h ? `${h}:${p2(m)}` : `${p2(m)}`) + `:${p2(s)}.${String(ms).padStart(3, '0')}`;
  }

  /** 解析 "1:02.500" / "01:02:03,500" / "2.5" -> 秒 */
  function parseShort(str) {
    if (typeof str !== 'string') return NaN;
    const s = str.trim().replace(',', '.');
    if (!s) return NaN;
    const m = s.match(/^(?:(\d{1,3}):)?(?:(\d{1,3}):)?(\d{1,3}(?:\.\d{1,3})?)$/);
    if (!m) return NaN;
    const parts = [m[1], m[2], m[3]].filter((x) => x !== undefined);
    let sec = 0;
    for (const p of parts) sec = sec * 60 + parseFloat(p);
    return sec;
  }

  /* ---------------- 文本清洗 ---------------- */

  const TAG_RE = /\{\\[^}]*\}|<\/?(?:i|b|u|c|v|font|ruby|rt|lang)(?:\s[^>]*)?>/gi;

  function stripTags(s) {
    return s
      .replace(TAG_RE, '')
      .replace(/\\N/gi, '\n')
      .replace(/\\n/gi, '\n')
      .replace(/\\h/gi, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  /* ---------------- SRT / VTT ---------------- */

  // 完整 HH:MM:SS(.|,)mmm
  const RE_LONG =
    /(\d{1,3}):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*-->\s*(\d{1,3}):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/;
  // 简写 MM:SS.mmm（VTT 允许）
  const RE_SHORT = /(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?\s*-->\s*(\d{1,3}):(\d{1,2})(?:[.,](\d{1,3}))?/;

  function matchTiming(line) {
    let m = line.match(RE_LONG);
    if (m) {
      return [toSec(+m[1], +m[2], +m[3], fracToMs(m[4])), toSec(+m[5], +m[6], +m[7], fracToMs(m[8]))];
    }
    m = line.match(RE_SHORT);
    if (m) {
      return [toSec(0, +m[1], +m[2], fracToMs(m[3])), toSec(0, +m[4], +m[5], fracToMs(m[6]))];
    }
    return null;
  }

  /** 通用行式解析，SRT 与 VTT 都能吃 */
  function parseTimedText(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const cues = [];
    let pending = null;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!pending) {
        const t = matchTiming(raw);
        if (!t) continue;
        pending = { start: t[0], end: t[1], text: '' };
        continue;
      }
      if (raw.trim() === '') {
        pending.text = stripTags(pending.text.replace(/\n+$/, ''));
        if (pending.text || pending.end > pending.start) cues.push(pending);
        pending = null;
        continue;
      }
      pending.text += (pending.text ? '\n' : '') + raw;
    }
    if (pending) {
      pending.text = stripTags(pending.text.replace(/\n+$/, ''));
      if (pending.text) cues.push(pending);
    }
    return normalize(cues);
  }

  /* ---------------- ASS / SSA ---------------- */

  function parseASS(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    let fmt = null;
    const cues = [];
    let inEvents = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (/^\[script info\]/i.test(line)) continue;
      if (/^\[v4\+? styles\]/i.test(line) || /^\[v4\]/i.test(line)) continue;
      if (/^\[events\]/i.test(line)) {
        inEvents = true;
        continue;
      }
      if (!inEvents) continue;

      if (/^format:/i.test(line)) {
        fmt = line
          .slice(7)
          .split(',')
          .map((s) => s.trim().toLowerCase());
        continue;
      }
      if (!/^(dialogue|comment):/i.test(line)) continue;

      let body = line.slice(line.indexOf(':') + 1);
      // 只按前 N-1 个逗号切分，最后一个字段（Text）里可能含逗号
      const fields = [];
      let idx = body.indexOf(',');
      let count = 0;
      const maxSplit = fmt ? fmt.length - 1 : 9;
      while (idx !== -1 && count < maxSplit) {
        fields.push(body.slice(0, idx));
        body = body.slice(idx + 1);
        idx = body.indexOf(',');
        count++;
      }
      fields.push(body);

      const gi = (name, dflt) => {
        if (!fmt) return dflt;
        const i = fmt.indexOf(name);
        return i === -1 ? dflt : i;
      };
      const si = gi('start', 1);
      const ei = gi('end', 2);
      const ti = gi('text', fields.length - 1);

      const st = parseShort((fields[si] || '').trim());
      const en = parseShort((fields[ei] || '').trim());
      if (!isFinite(st) || !isFinite(en)) continue;

      const txt = stripTags(fields[ti] || '');
      if (!txt) continue;
      cues.push({ start: st, end: en, text: txt });
    }
    return normalize(cues);
  }

  /* ---------------- 纯文本（无时间轴） ---------------- */

  /**
   * 把没有时间轴的台词文本，按阅读速度摊到整段视频里。
   * 空行分段；每段时长 = max(1.2s, 字数 * cps)，cps 默认 0.09s/字（≈11 字/秒）。
   */
  function parsePlainText(text, opts) {
    opts = opts || {};
    const total = opts.duration || 0;
    const cps = opts.cps || 0.09;
    const blocks = String(text)
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);

    const cues = [];
    let t = opts.start || 0;
    for (const b of blocks) {
      const dur = Math.min(8, Math.max(1.2, b.replace(/\s/g, '').length * cps));
      cues.push({ start: t, end: t + dur, text: b });
      t += dur + 0.15;
    }
    // 给了总时长就等比缩放
    if (total && cues.length && t > 0) {
      const k = total / t;
      if (k > 0.2 && k < 5) for (const c of cues) {
        c.start *= k;
        c.end *= k;
      }
    }
    return normalize(cues);
  }

  /* ---------------- 归一化与导出 ---------------- */

  function normalize(cues) {
    const out = [];
    for (const c of cues) {
      let s = +c.start;
      let e = +c.end;
      if (!isFinite(s) || !isFinite(e)) continue;
      if (e < s) e = s;
      if (e === s) e = s + 0.001;
      const text = String(c.text == null ? '' : c.text).replace(/\n{3,}/g, '\n\n').trim();
      out.push({ start: s, end: e, text });
    }
    out.sort((a, b) => a.start - b.start || a.end - b.end);
    return out;
  }

  function detect(text) {
    if (/^WEBVTT/m.test(text)) return 'vtt';
    if (/\[script info\]/i.test(text) || /^dialogue:/im.test(text)) return 'ass';
    if (/-->/.test(text)) return 'srt'; // SRT / VTT 共用同一套行式解析器
    return 'plain';
  }

  function parse(text, opts) {
    opts = opts || {};
    const kind = opts.format && opts.format !== 'auto' ? opts.format : detect(text);
    switch (kind) {
      case 'vtt':
        return parseTimedText(text);
      case 'ass':
        return parseASS(text);
      case 'plain':
        return parsePlainText(text, opts);
      default:
        return parseTimedText(text);
    }
  }

  function toSRT(cues) {
    return (
      cues
        .map((c, i) => `${i + 1}\n${formatTime(c.start, ',')} --> ${formatTime(c.end, ',')}\n${c.text}\n`)
        .join('\n') + '\n'
    );
  }

  function toVTT(cues) {
    return (
      'WEBVTT\n\n' +
      cues.map((c, i) => `${i + 1}\n${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}\n${c.text}\n`).join('\n') +
      '\n'
    );
  }

  AVS.parse = parse;
  AVS.detect = detect;
  AVS.toSRT = toSRT;
  AVS.toVTT = toVTT;
  AVS.formatTime = formatTime;
  AVS.formatShort = formatShort;
  AVS.parseShort = parseShort;
  AVS.stripTags = stripTags;
})(typeof window !== 'undefined' ? window : this);
