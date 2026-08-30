// ==UserScript==
// @name         Kryzer Clone Mercado Livre
// @namespace    https://github.com/vodyka/kryzeranaliticomarketplace
// @version      1.0.5
// @description  Clona anúncio público do Mercado Livre para uma conta autorizada no KryzerHub
// @match        https://mercadolivre.com.br/*/up/MLBU*
// @match        https://www.mercadolivre.com.br/*/up/MLBU*
// @match        https://mercadolibre.com.br/*/up/MLBU*
// @match        https://www.mercadolibre.com.br/*/up/MLBU*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @connect      *
// @updateURL    https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-clone.user.js
// @downloadURL  https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-clone.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.0.5';
  const KEYS = {
    origin: 'kryzer_clone_hub_origin',
    token: 'kryzer_clone_browser_token'
  };
  const state = {
    stores: [],
    selectedStoreId: '',
    preview: null,
    button: null,
    modal: null,
    busy: false,
    lastHref: location.href
  };

  function allowedRoute() {
    return /(^|\.)mercadolivre\.com\.br$|(^|\.)mercadolibre\.com\.br$/i.test(location.hostname)
      && /\/up\/MLBU\d+\/?$/i.test(location.pathname);
  }

  function routeIds() {
    const href = String(location.href || '');
    const mlbu = href.match(/\bMLBU\d+\b/i)?.[0]?.toUpperCase() || null;
    let mlb = null;
    try {
      const filters = new URLSearchParams(location.search).get('pdp_filters') || '';
      mlb = filters.match(/item_id:(MLB\d+)/i)?.[1]?.toUpperCase() || null;
    } catch {}
    if (!mlb) mlb = href.match(/(?:wid=|item_id(?:%3A|:))(MLB\d+)/i)?.[1]?.toUpperCase() || null;
    if (!mlb) {
      const values = href.match(/\bMLB\d+\b/ig);
      if (values?.length) mlb = values[values.length - 1].toUpperCase();
    }
    return { mlb, mlbu };
  }

  function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseMoneyText(text) {
    let cleaned = String(text || '').replace(/[^\d,.]/g, '').trim();
    if (!cleaned) return null;
    if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    return num(cleaned);
  }

  function readPricesFromDom() {
    let originalPrice = null;
    for (const selector of ['s', '[class*="original-price"]', '[class*="original_price"]', '[aria-label*="antes"]']) {
      const elements = document.querySelectorAll(selector);
      for (let i = 0; i < Math.min(elements.length, 20); i += 1) {
        const candidate = parseMoneyText(elements[i].textContent);
        if (candidate && candidate > 0) { originalPrice = candidate; break; }
      }
      if (originalPrice !== null) break;
    }

    let price = num(document.querySelector('meta[itemprop="price"]')?.getAttribute('content'));
    if (price === null) {
      const candidates = document.querySelectorAll('[class*="andes-money-amount"]');
      for (let i = 0; i < Math.min(candidates.length, 30); i += 1) {
        if (candidates[i].closest('s')) continue;
        const candidate = parseMoneyText(candidates[i].textContent);
        if (candidate && candidate > 0) { price = candidate; break; }
      }
    }
    const fullPrice = originalPrice !== null && originalPrice > 0 && (price === null || originalPrice >= price)
      ? originalPrice : price;
    return { price, originalPrice, fullPrice };
  }

  function money(value) {
    const parsed = num(value);
    return parsed === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed);
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function normalizeLabel(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function jsonLdProduct() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        const list = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ? parsed['@graph'] : [parsed];
        const product = list.find(item => item && (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product'))));
        if (product) return product;
      } catch {}
    }
    return {};
  }

  function collectPictures(product) {
    const urls = [];
    const add = value => {
      if (!value) return;
      for (const raw of Array.isArray(value) ? value : [value]) {
        const candidate = String(raw || '').trim();
        if (!candidate) continue;
        try {
          const url = new URL(candidate, location.href);
          if (url.protocol !== 'https:' || !/(^|\.)mlstatic\.com$/i.test(url.hostname)) continue;
          const normalized = url.toString();
          if (!urls.includes(normalized)) urls.push(normalized);
        } catch {}
      }
    };

    add(product?.image);
    const selectors = [
      '.ui-pdp-gallery img',
      '[class*="ui-pdp-gallery"] img',
      '[class*="gallery"] img',
      '[class*="picture"] img'
    ];
    for (const selector of selectors) {
      for (const img of document.querySelectorAll(selector)) {
        add(img.currentSrc || img.src);
        const srcset = String(img.getAttribute('srcset') || '').split(',').map(part => part.trim().split(/\s+/)[0]);
        add(srcset);
        if (urls.length >= 12) break;
      }
      if (urls.length >= 12) break;
    }

    if (!urls.length) {
      for (const img of document.querySelectorAll('img')) {
        const src = img.currentSrc || img.src || '';
        if (/D_NQ_NP/i.test(src)) add(src);
        if (urls.length >= 12) break;
      }
    }
    return urls.slice(0, 12);
  }

  function readDescription() {
    for (const selector of ['.ui-pdp-description__content', '[class*="ui-pdp-description"]', '#description', '[id*="description"]']) {
      const node = document.querySelector(selector);
      const text = String(node?.innerText || node?.textContent || '').trim();
      if (text.length >= 20) return text.slice(0, 50000);
    }
    return '';
  }

  function extractScriptMeta(ids) {
    const result = { categoryId: '', listingTypeId: '', familyName: '' };
    const needles = [ids.mlb, ids.mlbu].filter(Boolean);
    for (const script of document.scripts) {
      const text = script.textContent || '';
      if (!text || text.length > 3500000 || !needles.some(id => text.includes(id))) continue;
      const category = text.match(/["']category_id["']\s*[:=]\s*["'](MLB\d+)["']/i)
        || text.match(/["']categoryId["']\s*[:=]\s*["'](MLB\d+)["']/i);
      if (category && !result.categoryId) result.categoryId = category[1].toUpperCase();
      const listing = text.match(/["']listing_type_id["']\s*[:=]\s*["']([a-z_]+)["']/i);
      if (listing && !result.listingTypeId) result.listingTypeId = listing[1];
      const family = text.match(/["']family_name["']\s*[:=]\s*["']([^"']{2,200})["']/i);
      if (family && !result.familyName) result.familyName = family[1];
      if (result.categoryId && result.listingTypeId) break;
    }
    return result;
  }

  function findMatchingAnalytics(ids) {
    const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const roots = [];
    try { if (Array.isArray(page.dataLayer)) roots.push(...page.dataLayer); } catch {}
    try { if (page.__PRELOADED_STATE__) roots.push(page.__PRELOADED_STATE__); } catch {}

    let best = null;
    let bestScore = 0;
    const seen = new WeakSet();
    function walk(value, depth = 0) {
      if (!value || typeof value !== 'object' || depth > 9 || seen.has(value)) return;
      seen.add(value);
      if (!Array.isArray(value)) {
        const itemId = String(value.item_id || value.itemId || value.id || '').toUpperCase();
        const userProductId = String(value.user_product_id || value.userProductId || value.product_id || '').toUpperCase();
        let score = 0;
        if (ids.mlb && itemId === ids.mlb) score += 10;
        if (ids.mlbu && userProductId === ids.mlbu) score += 8;
        if (score > bestScore) { best = value; bestScore = score; }
      }
      if (Array.isArray(value)) value.slice(0, 100).forEach(v => walk(v, depth + 1));
      else Object.values(value).slice(0, 120).forEach(v => walk(v, depth + 1));
    }
    roots.slice(0, 200).forEach(root => walk(root));
    return best || {};
  }

  function scrapeAttributes(product) {
    const byId = new Map();
    const put = (id, value) => {
      const text = String(value || '').trim();
      if (!id || !text || text.length > 500) return;
      byId.set(id, { id, value_name: text });
    };

    const brand = typeof product?.brand === 'string' ? product.brand : product?.brand?.name;
    put('BRAND', brand);
    put('MODEL', product?.model);
    put('PART_NUMBER', product?.mpn);
    put('GTIN', product?.gtin13 || product?.gtin14 || product?.gtin12 || product?.gtin8);

    const map = {
      'marca': 'BRAND',
      'modelo': 'MODEL',
      'numero de peca': 'PART_NUMBER',
      'numero da peca': 'PART_NUMBER',
      'codigo da peca': 'PART_NUMBER',
      'codigo oem': 'OEM',
      'gtin': 'GTIN',
      'ean': 'GTIN'
    };
    for (const row of document.querySelectorAll('tr')) {
      const cells = [...row.querySelectorAll('th,td')].map(cell => String(cell.textContent || '').trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const id = map[normalizeLabel(cells[0])];
      if (id) put(id, cells[1]);
    }
    return [...byId.values()];
  }

  function buildSourceSnapshot() {
    const ids = routeIds();
    const product = jsonLdProduct();
    const analytics = findMatchingAnalytics(ids);
    const scriptMeta = extractScriptMeta(ids);
    const title = String(document.querySelector('h1')?.textContent || product?.name || analytics?.title || '').trim();
    const categoryId = String(
      analytics?.category_id || analytics?.categoryId || analytics?.category?.id || scriptMeta.categoryId || ''
    ).toUpperCase();
    const listingTypeId = String(analytics?.listing_type_id || analytics?.listingTypeId || scriptMeta.listingTypeId || 'gold_special');
    const pictures = collectPictures(product);
    const attributes = scrapeAttributes(product);

    return {
      title,
      categoryId,
      listingTypeId,
      condition: 'new',
      pictures,
      attributes,
      saleTerms: [],
      description: readDescription(),
      familyName: scriptMeta.familyName || '',
      userProductId: ids.mlbu || ''
    };
  }

  function ensureStyles() {
    if (document.getElementById('kryzer-clone-style')) return;
    const style = document.createElement('style');
    style.id = 'kryzer-clone-style';
    style.textContent = `
      #kryzer-clone-button{position:fixed;right:22px;bottom:82px;z-index:2147483000;border:0;border-radius:13px;background:#111827;color:#fff;padding:12px 16px;font:700 13px/1.2 Arial,sans-serif;box-shadow:0 8px 28px #0003;cursor:pointer;display:flex;align-items:center;gap:8px}#kryzer-clone-button:hover{background:#f97316}#kryzer-clone-button small{font-weight:500;opacity:.72}
      #kryzer-clone-overlay{position:fixed;inset:0;z-index:2147483200;background:#0f172acc;display:grid;place-items:center;padding:20px;font-family:Arial,sans-serif}#kryzer-clone-modal{width:min(650px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 30px 80px #0005;color:#0f172a}
      .kzc-head{padding:22px 24px 17px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:15px}.kzc-title{font-size:20px;font-weight:800}.kzc-sub{font-size:12px;color:#64748b;margin-top:4px}.kzc-close{border:0;background:#f1f5f9;border-radius:9px;width:34px;height:34px;cursor:pointer}.kzc-body{padding:22px 24px}.kzc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.kzc-card{border:1px solid #e2e8f0;border-radius:13px;padding:13px}.kzc-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700}.kzc-value{margin-top:5px;font-size:16px;font-weight:800}.kzc-muted{font-size:12px;line-height:1.5;color:#64748b}.kzc-field{margin-top:16px}.kzc-field label{display:block;font-size:12px;font-weight:700;margin-bottom:7px}.kzc-field select,.kzc-field input{width:100%;box-sizing:border-box;height:43px;border:1px solid #cbd5e1;border-radius:10px;padding:0 11px;background:#fff;color:#0f172a}.kzc-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.kzc-btn{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer}.kzc-btn:disabled{opacity:.55;cursor:not-allowed}.kzc-primary{background:#f97316;color:#fff}.kzc-dark{background:#111827;color:#fff}.kzc-light{background:#f1f5f9;color:#334155}.kzc-danger{background:#b91c1c;color:#fff}.kzc-warning{margin-top:16px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:13px;padding:14px;line-height:1.5}.kzc-error{margin-top:16px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:13px;padding:14px;line-height:1.5}.kzc-success{margin-top:16px;border:1px solid #86efac;background:#f0fdf4;color:#166534;border-radius:13px;padding:14px}.kzc-code{font-family:monospace;font-size:27px;font-weight:900;letter-spacing:.12em;background:#0f172a;color:#fff;border-radius:12px;padding:16px;text-align:center;margin:14px 0}@media(max-width:600px){.kzc-grid{grid-template-columns:1fr}#kryzer-clone-button{right:12px;bottom:82px}.kzc-actions{flex-direction:column}.kzc-btn{width:100%}}
    `;
    document.documentElement.appendChild(style);
  }

  function closeModal() { state.modal?.remove(); state.modal = null; }
  function modal(html, title = 'Clonar anúncio', subtitle = '') {
    ensureStyles(); closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'kryzer-clone-overlay';
    overlay.innerHTML = `<div id="kryzer-clone-modal"><div class="kzc-head"><div><div class="kzc-title">${esc(title)}</div><div class="kzc-sub">${esc(subtitle)}</div></div><button class="kzc-close" data-close>×</button></div><div class="kzc-body">${html}</div></div>`;
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest?.('[data-close]')) closeModal(); });
    document.documentElement.appendChild(overlay); state.modal = overlay; return overlay;
  }
  function errorBox(message) { return `<div class="kzc-error">${esc(message)}</div>`; }

  function getOrigin() { return String(GM_getValue(KEYS.origin, '') || '').replace(/\/$/, ''); }
  function saveOrigin(raw) {
    const value = String(raw || '').trim().replace(/\/$/, '');
    if (!value) throw new Error('Informe a URL pública do KryzerHub.');
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS para o KryzerHub.');
    GM_setValue(KEYS.origin, url.origin); return url.origin;
  }

  function request(path, options = {}) {
    const origin = getOrigin();
    if (!origin) return Promise.reject(new Error('KryzerHub ainda não configurado.'));
    const token = GM_getValue(KEYS.token, '');
    return new Promise((resolve, reject) => GM_xmlhttpRequest({
      method: options.method || 'GET', url: `${origin}${path}`,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token && options.auth !== false ? { Authorization: `Bearer ${token}` } : {}) },
      data: options.body ? JSON.stringify(options.body) : undefined, timeout: 45000,
      onload(response) { let data = {}; try { data = JSON.parse(response.responseText || '{}'); } catch {} resolve({ status: response.status, ok: response.status >= 200 && response.status < 300, data }); },
      onerror() { reject(new Error('Falha de conexão com o KryzerHub.')); }, ontimeout() { reject(new Error('O KryzerHub demorou demais para responder.')); }
    }));
  }

  async function configureOrigin() {
    const box = modal(`<p class="kzc-muted">Informe a URL pública do KryzerHub.</p><div class="kzc-field"><label>URL do KryzerHub</label><input data-origin value="${esc(getOrigin())}" placeholder="https://app.kryzerdigital.com.br"></div><div data-message></div><div class="kzc-actions"><button class="kzc-btn kzc-light" data-close>Cancelar</button><button class="kzc-btn kzc-primary" data-save>Salvar e conectar</button></div>`, 'Conectar ao KryzerHub', `Kryzer Clone ${VERSION}`);
    return new Promise(resolve => box.querySelector('[data-save]').addEventListener('click', () => {
      try { const origin = saveOrigin(box.querySelector('[data-origin]').value); closeModal(); resolve(origin); }
      catch (error) { box.querySelector('[data-message]').innerHTML = errorBox(error.message); }
    }));
  }

  async function pairBrowser() {
    if (!getOrigin()) await configureOrigin();
    const start = await request('/api/browser/pair/start', { method: 'POST', auth: false, body: { deviceName: `Chrome / Tampermonkey - ${navigator.platform || 'Desktop'}` } });
    if (!start.ok) throw new Error(start.data?.message || 'Não foi possível iniciar a conexão.');
    const pair = start.data; GM_openInTab(pair.verificationUrl, { active: true, insert: true, setParent: true });
    const box = modal(`<p class="kzc-muted">O KryzerHub abriu em outra guia. Entre na sua conta e autorize este navegador.</p><div class="kzc-code">${esc(pair.displayCode)}</div><div class="kzc-muted">Depois volte e clique em <b>Já autorizei</b>.</div><div data-message></div><div class="kzc-actions"><button class="kzc-btn kzc-light" data-close>Cancelar</button><button class="kzc-btn kzc-primary" data-check>Já autorizei</button></div>`, 'Autorizar navegador', 'Tokens do Mercado Livre continuam somente no KryzerHub');
    return new Promise((resolve, reject) => box.querySelector('[data-check]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true; button.textContent = 'Verificando...';
      try {
        const complete = await request('/api/browser/pair/complete', { method: 'POST', auth: false, body: { pairId: pair.pairId, pairSecret: pair.pairSecret } });
        if (complete.status === 202) { box.querySelector('[data-message]').innerHTML = '<div class="kzc-warning">A autorização ainda não foi confirmada no KryzerHub.</div>'; button.disabled = false; button.textContent = 'Já autorizei'; return; }
        if (!complete.ok) throw new Error(complete.data?.message || 'Não foi possível concluir a autorização.');
        GM_setValue(KEYS.token, complete.data.token); closeModal(); resolve(complete.data.token);
      } catch (error) { box.querySelector('[data-message]').innerHTML = errorBox(error.message); button.disabled = false; button.textContent = 'Já autorizei'; reject(error); }
    }));
  }

  async function ensureAuth() {
    if (!getOrigin()) await configureOrigin();
    if (!GM_getValue(KEYS.token, '')) await pairBrowser();
    let response = await request('/api/browser/stores');
    if (response.status === 401) { GM_deleteValue(KEYS.token); await pairBrowser(); response = await request('/api/browser/stores'); }
    if (!response.ok) throw new Error(response.data?.message || 'Não foi possível carregar suas lojas.');
    state.stores = Array.isArray(response.data?.stores) ? response.data.stores : [];
    return state.stores;
  }

  function formatDate(value) {
    const d = new Date(value); return Number.isNaN(d.getTime()) ? 'data desconhecida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  }

  function renderStart() {
    const ids = routeIds(), prices = readPricesFromDom(), snapshot = buildSourceSnapshot();
    const options = state.stores.map(store => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join('');
    const diagnostics = snapshot.categoryId && snapshot.pictures.length
      ? `<div class="kzc-success">Página capturada: categoria <b>${esc(snapshot.categoryId)}</b> · ${snapshot.pictures.length} foto(s) · ${snapshot.attributes.length} atributo(s).</div>`
      : `<div class="kzc-warning">Ainda faltam dados da página: categoria ${snapshot.categoryId ? 'OK' : 'não encontrada'} · fotos ${snapshot.pictures.length}. Se necessário, role até as fotos e tente novamente.</div>`;
    const box = modal(`<div class="kzc-grid"><div class="kzc-card"><div class="kzc-label">Anúncio origem</div><div class="kzc-value">${esc(ids.mlb || '—')}</div><div class="kzc-muted">${esc(ids.mlbu || '')}</div></div><div class="kzc-card"><div class="kzc-label">Estoque inicial</div><div class="kzc-value">1</div><div class="kzc-muted">Forçado pelo KryzerHub.</div></div><div class="kzc-card"><div class="kzc-label">Preço atual</div><div class="kzc-value">${money(prices.price)}</div></div><div class="kzc-card"><div class="kzc-label">Preço cheio usado</div><div class="kzc-value">${money(prices.fullPrice)}</div><div class="kzc-muted">Preço riscado/original → fallback atual</div></div></div>${diagnostics}<div class="kzc-field"><label>Publicar em</label><select data-store>${options}</select></div><div data-message></div><div class="kzc-actions"><button class="kzc-btn kzc-light" data-close>Cancelar</button><button class="kzc-btn kzc-primary" data-preview>Pré-visualizar clone</button></div>`, 'Clonar anúncio', 'A origem é capturada da própria página pública');
    const select = box.querySelector('[data-store]');
    if (state.selectedStoreId && state.stores.some(s => s.id === state.selectedStoreId)) select.value = state.selectedStoreId;
    box.querySelector('[data-preview]').addEventListener('click', async event => {
      state.selectedStoreId = select.value; const btn = event.currentTarget; btn.disabled = true; btn.textContent = 'Capturando página...';
      try { await previewClone(); } catch (error) { box.querySelector('[data-message]').innerHTML = errorBox(error.message); btn.disabled = false; btn.textContent = 'Pré-visualizar clone'; }
    });
  }

  async function previewClone() {
    const ids = routeIds(), prices = readPricesFromDom(), snapshot = buildSourceSnapshot();
    if (!ids.mlb) throw new Error('Não consegui identificar o MLB deste anúncio.');
    if (!snapshot.title) throw new Error('Não consegui identificar o título da página.');
    if (!snapshot.categoryId) throw new Error('Não consegui identificar a categoria do anúncio nesta página. Recarregue e aguarde o Analisar anúncio terminar de carregar.');
    if (!snapshot.pictures.length) throw new Error('Não consegui localizar as fotos do produto nesta página.');
    const response = await request('/api/browser/mercadolivre/clone/preview', { method: 'POST', body: { sourceItemId: ids.mlb, sourceUserProductId: ids.mlbu, targetStoreId: state.selectedStoreId, pagePrice: prices.price, pageOriginalPrice: prices.originalPrice, sourceSnapshot: snapshot } });
    if (!response.ok) throw new Error(response.data?.message || 'Não foi possível montar a prévia.');
    state.preview = response.data; renderPreview();
  }

  function duplicateBlock(duplicate) {
    if (!duplicate?.wasCopiedBefore) return '';
    const copy = duplicate.previousCopy || {};
    return `<div class="kzc-warning"><b>⚠ Este anúncio desse concorrente já foi copiado.</b><br>${copy.createdAt ? `Última cópia: <b>${esc(formatDate(copy.createdAt))}</b><br>` : ''}${copy.targetStoreName ? `Loja: <b>${esc(copy.targetStoreName)}</b><br>` : ''}${copy.createdItemId ? `Criado: <b>${esc(copy.createdItemId)}</b><br>` : ''}Você pode cancelar ou copiar novamente de propósito.</div>`;
  }

  function renderPreview() {
    const p = state.preview, d = p?.duplicate;
    const warnings = Array.isArray(p?.clone?.warnings) && p.clone.warnings.length ? `<div class="kzc-warning"><b>Avisos</b><br>${p.clone.warnings.map(x => `• ${esc(x)}`).join('<br>')}</div>` : '';
    const box = modal(`<div class="kzc-card"><div class="kzc-label">${esc(p.source.itemId)}</div><div class="kzc-value">${esc(p.source.title)}</div><div class="kzc-muted">Categoria ${esc(p.source.categoryId || '—')} · origem ${esc(p.sourceMode || '—')}</div></div><div class="kzc-grid" style="margin-top:12px"><div class="kzc-card"><div class="kzc-label">Destino</div><div class="kzc-value">${esc(p.targetStore.name)}</div></div><div class="kzc-card"><div class="kzc-label">Preço / estoque</div><div class="kzc-value">${money(p.clone.price)} · 1</div></div><div class="kzc-card"><div class="kzc-label">Fotos</div><div class="kzc-value">${esc(p.source.pictures)}</div></div><div class="kzc-card"><div class="kzc-label">Atributos</div><div class="kzc-value">${esc(p.source.attributes ?? 0)}</div></div></div>${duplicateBlock(d)}${warnings}<div data-message></div><div class="kzc-actions"><button class="kzc-btn kzc-light" data-close>Cancelar</button><button class="kzc-btn ${d?.wasCopiedBefore ? 'kzc-danger' : 'kzc-primary'}" data-publish>${d?.wasCopiedBefore ? 'Copiar novamente' : 'Criar anúncio'}</button></div>`, 'Confirmar clone', d?.wasCopiedBefore ? 'Duplicidade detectada pelo KryzerHub' : 'Revise antes de publicar');
    box.querySelector('[data-publish]').addEventListener('click', async event => {
      const btn = event.currentTarget; btn.disabled = true; btn.textContent = 'Publicando...';
      try { await publishClone(Boolean(d?.wasCopiedBefore)); } catch (error) { box.querySelector('[data-message]').innerHTML = errorBox(error.message); btn.disabled = false; btn.textContent = d?.wasCopiedBefore ? 'Copiar novamente' : 'Criar anúncio'; }
    });
  }

  async function publishClone(allowDuplicate) {
    const response = await request('/api/browser/mercadolivre/clone/publish', { method: 'POST', body: { draftId: state.preview.draftId, targetStoreId: state.selectedStoreId, allowDuplicate } });
    if (response.status === 409 && response.data?.code === 'ALREADY_CLONED' && !allowDuplicate) { state.preview.duplicate = { wasCopiedBefore: true, sameTargetStore: true, previousCopy: response.data.previousCopy, previousCopies: [response.data.previousCopy] }; renderPreview(); return; }
    if (!response.ok) throw new Error(response.data?.message || 'O Mercado Livre recusou a criação do anúncio.');
    const created = response.data; const link = created.permalink ? `<a href="${esc(created.permalink)}" target="_blank" rel="noopener" style="color:#166534;font-weight:800">Abrir ${esc(created.itemId)}</a>` : `<b>${esc(created.itemId)}</b>`;
    modal(`<div class="kzc-success"><b>Clone criado com sucesso.</b><div style="margin-top:8px">${link}</div><div style="margin-top:5px">Preço: ${money(created.price)} · Estoque: 1</div></div>${created.duplicatedIntentionally ? '<div class="kzc-warning">Cópia repetida criada intencionalmente.</div>' : ''}<div class="kzc-actions"><button class="kzc-btn kzc-dark" data-close>Fechar</button></div>`, 'Anúncio publicado', created.targetStore?.name || 'Mercado Livre');
  }

  async function openClone() {
    if (state.busy) return; state.busy = true;
    try { const stores = await ensureAuth(); if (!stores.length) throw new Error('Sua conta KryzerHub não possui loja Mercado Livre ativa conectada.'); if (!state.selectedStoreId) state.selectedStoreId = stores[0].id; renderStart(); }
    catch (error) { const box = modal(`${errorBox(error.message)}<div class="kzc-actions"><button class="kzc-btn kzc-light" data-settings>Configurar URL</button><button class="kzc-btn kzc-dark" data-close>Fechar</button></div>`, 'Kryzer Clone', 'Não foi possível iniciar'); box.querySelector('[data-settings]')?.addEventListener('click', async () => { closeModal(); await configureOrigin(); }); }
    finally { state.busy = false; }
  }

  function mountButton() {
    if (!allowedRoute()) { state.button?.remove(); state.button = null; return; }
    if (state.button?.isConnected) return;
    ensureStyles(); const ids = routeIds();
    const btn = document.createElement('button'); btn.id = 'kryzer-clone-button'; btn.type = 'button'; btn.innerHTML = `<span>⧉ Clonar</span><small>${esc(ids.mlb || '')}</small>`; btn.addEventListener('click', openClone); document.documentElement.appendChild(btn); state.button = btn;
  }

  try {
    GM_registerMenuCommand('Kryzer Clone: configurar URL do Hub', configureOrigin);
    GM_registerMenuCommand('Kryzer Clone: desconectar navegador', () => { GM_deleteValue(KEYS.token); alert('Kryzer Clone desconectado deste navegador.'); });
  } catch {}

  mountButton();
  setInterval(() => {
    if (location.href !== state.lastHref) { state.lastHref = location.href; closeModal(); state.preview = null; state.selectedStoreId = ''; }
    mountButton();
  }, 1500);
})();
