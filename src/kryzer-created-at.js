(() => {
  'use strict';

  const ROUTE_RE = /^\/.+\/up\/MLBU\d+\/?$/i;
  const CREATION_KEYS = [
    'created_date','created_at','date_created','creation_date',
    'createdAt','dateCreated','start_time','startTime',
    'publication_date','publicationDate'
  ];
  const UPDATE_KEYS = ['last_updated','lastUpdated','updated_at','updatedAt'];

  if (window.__KRYZER_CREATED_AT_ENGINE__) return;
  window.__KRYZER_CREATED_AT_ENGINE__ = true;

  const state = {
    mlb: null,
    mlbu: null,
    best: null,
    candidates: []
  };

  function allowedRoute() {
    return (
      (location.hostname === 'www.mercadolivre.com.br' || location.hostname === 'www.mercadolibre.com.br') &&
      ROUTE_RE.test(location.pathname)
    );
  }

  function detectIds() {
    const href = String(location.href || '');
    state.mlbu = href.match(/\bMLBU\d+\b/i)?.[0]?.toUpperCase() || state.mlbu;

    try {
      const filters = new URLSearchParams(location.search).get('pdp_filters') || '';
      state.mlb = filters.match(/item_id:(MLB\d+)/i)?.[1]?.toUpperCase() || state.mlb;
    } catch {}

    if (!state.mlb) {
      state.mlb = href.match(/(?:wid=|item_id(?:%3A|:))(MLB\d+)/i)?.[1]?.toUpperCase() || null;
    }

    return { mlb: state.mlb, mlbu: state.mlbu };
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\\u0022/gi, '"')
      .replace(/\\u0027/gi, "'")
      .replace(/\\u003A/gi, ':')
      .replace(/\\u002F/gi, '/')
      .replace(/\\u003D/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/\\"/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"');
  }

  function parseDate(value) {
    if (!value) return null;
    const normalized = String(value).trim().replace(/(\.\d{3})\d+/, '$1');
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 0 || days > 8000) return null;
    return d;
  }

  function daysOld(date) {
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  }

  function dateLabel(date) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(date);
  }

  function keyScore(key) {
    return ({
      created_date: 1200,
      created_at: 1150,
      date_created: 1100,
      creation_date: 1050,
      createdAt: 1000,
      dateCreated: 950,
      publication_date: 850,
      publicationDate: 850,
      start_time: 700,
      startTime: 650
    })[key] || 500;
  }

  function scoreId(key, value) {
    if (typeof value !== 'string') return 0;
    const k = String(key).toLowerCase();
    const v = value.toUpperCase();
    let score = 0;

    if (state.mlb && v === state.mlb) {
      if (k === 'item_id' || k === 'itemid') score += 5000;
      else if (k === 'id') score += 4500;
      else if (k.includes('item')) score += 4200;
      else score += 3000;
    }

    if (state.mlbu && v === state.mlbu) {
      if (k === 'user_product_id') score += 5000;
      else if (k === 'product_id' || k === 'productid') score += 4800;
      else if (k === 'pid') score += 4600;
      else if (k === 'id') score += 4300;
      else score += 3000;
    }

    return score;
  }

  function scoreIds(obj, depth = 0, max = 3, seen = new WeakSet()) {
    if (!obj || typeof obj !== 'object' || depth > max || seen.has(obj)) return 0;
    seen.add(obj);
    let score = 0;

    if (Array.isArray(obj)) {
      for (const item of obj) score += scoreIds(item, depth + 1, max, seen);
      return score;
    }

    for (const [key, value] of Object.entries(obj)) {
      score += scoreId(key, value);
      if (value && typeof value === 'object') score += scoreIds(value, depth + 1, max, seen);
    }

    return score;
  }

  function findDates(obj, depth = 0, max = 4, path = '', seen = new WeakSet()) {
    const out = [];
    if (!obj || typeof obj !== 'object' || depth > max || seen.has(obj)) return out;
    seen.add(obj);

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => out.push(...findDates(item, depth + 1, max, `${path}[${i}]`, seen)));
      return out;
    }

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string') {
        if (CREATION_KEYS.includes(key)) {
          const date = parseDate(value);
          if (date) out.push({ type: 'creation', key, value, date, path: currentPath });
        }
        if (UPDATE_KEYS.includes(key)) {
          const date = parseDate(value);
          if (date) out.push({ type: 'update', key, value, date, path: currentPath });
        }
      }

      if (value && typeof value === 'object') {
        out.push(...findDates(value, depth + 1, max, currentPath, seen));
      }
    }

    return out;
  }

  function register(candidate) {
    if (!candidate?.created || !candidate?.date) return;

    const duplicate = state.candidates.some(x =>
      x.created === candidate.created &&
      x.source === candidate.source &&
      x.path === candidate.path
    );

    if (!duplicate) state.candidates.push(candidate);

    if (!state.best || candidate.score > state.best.score) {
      state.best = candidate;
      publish();
    }
  }

  function analyzeObject(obj, meta, objectPath = 'root') {
    const idScore = scoreIds(obj, 0, 3);
    if (idScore < 4000) return;

    const dates = findDates(obj, 0, 4);
    const creations = dates.filter(x => x.type === 'creation');
    if (!creations.length) return;

    let serialized = '';
    try { serialized = JSON.stringify(obj); } catch {}

    if (/review_id/i.test(serialized)) return;

    const updates = dates.filter(x => x.type === 'update');

    for (const creation of creations) {
      let score = idScore + keyScore(creation.key);
      if (state.mlb && serialized.includes(state.mlb)) score += 800;
      if (state.mlbu && serialized.includes(state.mlbu)) score += 800;

      const update = updates.find(x => x.date >= creation.date) || null;

      register({
        score,
        field: creation.key,
        created: creation.value,
        date: creation.date,
        updated: update?.value || null,
        source: meta.type,
        url: meta.url || '',
        path: creation.path,
        objectPath
      });
    }
  }

  function walkJson(obj, meta, path = 'root', depth = 0, seen = new WeakSet()) {
    if (!obj || typeof obj !== 'object' || depth > 15 || seen.has(obj)) return;
    seen.add(obj);

    analyzeObject(obj, meta, path);

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walkJson(item, meta, `${path}[${i}]`, depth + 1, seen));
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        walkJson(value, meta, `${path}.${key}`, depth + 1, seen);
      }
    }
  }

  function findObjectEnd(text, start) {
    let depth = 0;
    let inString = false;
    let quote = null;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const c = text[i];

      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === quote) { inString = false; quote = null; }
        continue;
      }

      if (c === '"' || c === "'") {
        inString = true;
        quote = c;
        continue;
      }

      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }

    return -1;
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function analyzeObjectText(fragment, meta, path) {
    let idScore = 0;
    const mlb = state.mlb ? escapeRegex(state.mlb) : null;
    const mlbu = state.mlbu ? escapeRegex(state.mlbu) : null;

    if (mlb) {
      const tests = [
        new RegExp(`["']item_id["']\\s*:\\s*["']${mlb}["']`, 'i'),
        new RegExp(`["']itemId["']\\s*:\\s*["']${mlb}["']`, 'i'),
        new RegExp(`["']id["']\\s*:\\s*["']${mlb}["']`, 'i')
      ];
      if (tests.some(r => r.test(fragment))) idScore += 5000;
    }

    if (mlbu) {
      const tests = [
        new RegExp(`["']user_product_id["']\\s*:\\s*["']${mlbu}["']`, 'i'),
        new RegExp(`["']product_id["']\\s*:\\s*["']${mlbu}["']`, 'i'),
        new RegExp(`["']pid["']\\s*:\\s*["']${mlbu}["']`, 'i'),
        new RegExp(`["']id["']\\s*:\\s*["']${mlbu}["']`, 'i')
      ];
      if (tests.some(r => r.test(fragment))) idScore += 5000;
    }

    if (idScore < 5000 || /review_id/i.test(fragment)) return;

    for (const key of CREATION_KEYS) {
      const match = fragment.match(new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`, 'i'));
      if (!match) continue;

      const date = parseDate(match[1]);
      if (!date) continue;

      let updated = null;
      for (const updateKey of UPDATE_KEYS) {
        const updateMatch = fragment.match(new RegExp(`["']${updateKey}["']\\s*:\\s*["']([^"']+)["']`, 'i'));
        if (updateMatch) {
          const updateDate = parseDate(updateMatch[1]);
          if (updateDate && updateDate >= date) {
            updated = updateMatch[1];
            break;
          }
        }
      }

      register({
        score: idScore + keyScore(key),
        field: key,
        created: match[1],
        date,
        updated,
        source: meta.type,
        url: meta.url || '',
        path,
        objectPath: path
      });
    }
  }

  function scanObjectsInText(original, meta) {
    const text = normalizeText(original);
    detectIds();
    const ids = [state.mlb, state.mlbu].filter(Boolean);
    if (!ids.length) return;

    const positions = [];

    for (const id of ids) {
      let pos = 0;
      let count = 0;

      while ((pos = text.indexOf(id, pos)) !== -1) {
        positions.push(pos);
        pos += id.length;
        if (++count >= 60) break;
      }
    }

    const tested = new Set();

    for (const index of positions) {
      let found = 0;

      for (let i = index; i >= Math.max(0, index - 100000); i--) {
        if (text[i] !== '{') continue;
        if (++found > 35) break;
        if (tested.has(i)) continue;
        tested.add(i);

        const end = findObjectEnd(text, i);
        if (end < index) continue;

        const size = end - i;
        if (size > 150000) continue;

        const fragment = text.slice(i, end + 1);
        if (!ids.some(id => fragment.includes(id))) continue;
        if (!CREATION_KEYS.some(key => fragment.includes(`"${key}"`) || fragment.includes(`'${key}'`))) continue;

        try {
          analyzeObject(JSON.parse(fragment), meta, `raw@${i}`);
        } catch {
          analyzeObjectText(fragment, meta, `raw@${i}`);
        }
      }
    }
  }

  function analyzeResponse(text, meta) {
    if (!allowedRoute() || !text) return;
    const normalized = normalizeText(text);

    try {
      walkJson(JSON.parse(normalized), meta);
    } catch {
      scanObjectsInText(normalized, meta);
    }
  }

  function publish() {
    if (!state.best) return;

    const d = state.best.date;
    const days = daysOld(d);
    const tone = days < 90 ? 'green' : days <= 200 ? 'yellow' : 'red';

    window.__KRYZER_CREATED_AT__ = {
      mlb: state.mlb,
      mlbu: state.mlbu,
      created_date: state.best.created,
      last_updated: state.best.updated,
      days,
      published_at: dateLabel(d),
      tone,
      field: state.best.field,
      source: state.best.source,
      score: state.best.score
    };

    window.dispatchEvent(new CustomEvent('kryzer:created-at', {
      detail: window.__KRYZER_CREATED_AT__
    }));

    patchUI();
  }

  function patchUI() {
    if (!allowedRoute() || !state.best) return;

    const host = document.getElementById('kryzer-analitico-host');
    const root = host?.shadowRoot;
    if (!root) return;

    const box = root.querySelector('.ageBox');
    const dot = root.querySelector('.ageDot');
    const main = root.querySelector('.ageMain');
    const sub = root.querySelector('.ageSub');
    if (!box || !dot || !main || !sub) return;

    const days = daysOld(state.best.date);
    const tone = days < 90 ? 'green' : days <= 200 ? 'yellow' : 'red';

    box.classList.remove('green', 'yellow', 'red', 'gray');
    dot.classList.remove('green', 'yellow', 'red', 'gray');
    box.classList.add(tone);
    dot.classList.add(tone);

    main.textContent = `Criado há ${days} ${days === 1 ? 'dia' : 'dias'}`;
    sub.textContent = `Publicado em ${dateLabel(state.best.date)}`;
  }

  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = async function (...args) {
      const response = await nativeFetch.apply(this, args);
      if (allowedRoute()) {
        const input = args[0];
        const url = typeof input === 'string' ? input : input?.url || '';
        try {
          response.clone().text().then(text => analyzeResponse(text, {
            type: 'FETCH', status: response.status, url
          })).catch(() => {});
        } catch {}
      }
      return response;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__kryzerCreatedAtUrl = String(url || '');
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      if (!allowedRoute()) return;
      try {
        let text = '';
        if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
        else if (this.responseType === 'json') text = JSON.stringify(this.response);
        if (text) analyzeResponse(text, {
          type: 'XHR', status: this.status, url: this.__kryzerCreatedAtUrl || ''
        });
      } catch {}
    });
    return nativeSend.apply(this, args);
  };

  function scanPage() {
    if (!allowedRoute()) return;
    detectIds();

    const html = document.documentElement?.innerHTML;
    if (html) analyzeResponse(html, { type: 'HTML', status: 200, url: location.href });

    for (let i = 0; i < document.scripts.length; i++) {
      const raw = document.scripts[i]?.textContent || '';
      if (!raw) continue;
      if ((state.mlb && raw.includes(state.mlb)) || (state.mlbu && raw.includes(state.mlbu))) {
        analyzeResponse(raw, { type: `SCRIPT_${i}`, status: 200, url: location.href });
      }
    }
  }

  function resetForRoute() {
    state.mlb = null;
    state.mlbu = null;
    state.best = null;
    state.candidates = [];
    detectIds();
  }

  detectIds();

  function boot() {
    if (!allowedRoute()) return;
    const delays = [500, 1200, 1800, 3000, 4500, 7000, 10000];
    delays.forEach(ms => setTimeout(() => {
      if (allowedRoute()) {
        scanPage();
        patchUI();
      }
    }, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      resetForRoute();
      boot();
    }
    patchUI();
  }, 500);

  window.__KRYZER_CREATED_AT_DEBUG__ = {
    get result() { return window.__KRYZER_CREATED_AT__ || null; },
    get candidates() { return state.candidates.slice().sort((a, b) => b.score - a.score); },
    rescan() { scanPage(); patchUI(); return this.result; }
  };
})();