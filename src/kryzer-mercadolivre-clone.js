(() => {
  'use strict';

  if (window.__KRYZER_ML_CLONE_UI__) return;
  window.__KRYZER_ML_CLONE_UI__ = true;

  const VERSION = '1.0.0';
  const STORE_KEYS = {
    origin: 'kryzer_clone_hub_origin',
    token: 'kryzer_clone_browser_token'
  };
  const state = {
    context: freshContext(),
    stores: [],
    selectedStoreId: '',
    preview: null,
    busy: false,
    modal: null,
    button: null
  };

  function freshContext() {
    const ids = routeIds();
    return {
      mlb: ids.mlb,
      mlbu: ids.mlbu,
      price: null,
      originalPrice: null,
      updatedAt: null
    };
  }

  function allowedRoute() {
    return /mercadolivre\.com\.br$|mercadolibre\.com\.br$/i.test(location.hostname)
      && /^\/.+\/up\/MLBU\d+\/?$/i.test(location.pathname);
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

  function money(value) {
    const parsed = num(value);
    return parsed === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateContext(values) {
    for (const [key, value] of Object.entries(values || {})) {
      if (value !== null && value !== undefined && value !== '') state.context[key] = value;
    }
    state.context.updatedAt = new Date().toISOString();
    refreshButton();
  }

  // Mirrors the full-price priority already used by Kryzer Analítico Marketplace.
  function extractUpp(eventData) {
    if (!eventData || typeof eventData !== 'object') return;
    const ids = routeIds();
    if (ids.mlb && eventData.item_id && String(eventData.item_id).toUpperCase() !== ids.mlb) return;
    if (ids.mlbu && eventData.user_product_id && String(eventData.user_product_id).toUpperCase() !== ids.mlbu) return;

    const pricing = eventData?.credit_view_components?.pricing || {};
    const promotion = Array.isArray(eventData?.available_promotions) ? eventData.available_promotions[0] : null;
    let price = num(eventData?.price);
    if (price === null) price = num(pricing?.actual_price);
    if (price === null && promotion) price = num(promotion?.value);
    let originalPrice = num(eventData?.original_price);
    if (originalPrice === null) originalPrice = num(pricing?.original_price);
    if (originalPrice === null && promotion) originalPrice = num(promotion?.original_value);

    updateContext({
      mlb: eventData?.item_id ? String(eventData.item_id).toUpperCase() : ids.mlb,
      mlbu: eventData?.user_product_id ? String(eventData.user_product_id).toUpperCase() : ids.mlbu,
      price,
      originalPrice
    });
  }

  function inspectMelidataBody(body) {
    if (!body || !allowedRoute()) return;
    let text = '';
    if (typeof body === 'string') text = body;
    else if (body instanceof URLSearchParams) text = body.toString();
    else {
      try { text = JSON.stringify(body); } catch { return; }
    }
    try {
      const parsed = JSON.parse(text);
      const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : [];
      for (const track of tracks) {
        const eventData = track?.event_data;
        if (track?.path === '/upp' || eventData?.page_type === 'UPP') extractUpp(eventData);
      }
    } catch {}
  }

  function hookPageSignals() {
    const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    try {
      const previousFetch = page.fetch;
      if (previousFetch && !page.__KRYZER_CLONE_FETCH__) {
        page.__KRYZER_CLONE_FETCH__ = true;
        page.fetch = function (...args) {
          try {
            const input = args[0];
            const init = args[1] || {};
            const url = typeof input === 'string' ? input : input?.url || '';
            if (/melidata\/tracks/i.test(url)) inspectMelidataBody(init?.body);
          } catch {}
          return previousFetch.apply(this, args);
        };
      }
    } catch {}

    try {
      const nav = page.navigator;
      const previousBeacon = nav?.sendBeacon?.bind(nav);
      if (previousBeacon && !page.__KRYZER_CLONE_BEACON__) {
        page.__KRYZER_CLONE_BEACON__ = true;
        nav.sendBeacon = function (url, data) {
          try { if (/melidata\/tracks/i.test(String(url || ''))) inspectMelidataBody(data); } catch {}
          return previousBeacon(url, data);
        };
      }
    } catch {}
  }

  function parseMoneyText(text) {
    const cleaned = String(text || '').replace(/[^\d,.]/g, '').trim();
    if (!cleaned) return null;
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;
    return num(normalized);
  }

  function fallbackPricesFromDom() {
    if (!allowedRoute()) return;
    const ids = routeIds();
    updateContext(ids);

    const strikeSelectors = [
      's',
      '[class*="original-price"]',
      '[class*="original_price"]',
      '[aria-label*="antes"]'
    ];
    let originalPrice = null;
    for (const selector of strikeSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const candidate = parseMoneyText(element.textContent);
        if (candidate && candidate > 0) { originalPrice = candidate; break; }
      }
      if (originalPrice !== null) break;
    }

    const metaPrice = num(document.querySelector('meta[itemprop="price"]')?.getAttribute('content'));
    let price = metaPrice;
    if (price === null) {
      const candidates = document.querySelectorAll('[class*="andes-money-amount"]');
      for (const element of candidates) {
        if (element.closest('s')) continue;
        const candidate = parseMoneyText(element.textContent);
        if (candidate && candidate > 0) { price = candidate; break; }
      }
    }
    updateContext({ price, originalPrice });
  }

  function cloneFullPrice() {
    const current = num(state.context.price);
    const original = num(state.context.originalPrice);
    if (original !== null && original > 0 && (current === null || original >= current)) return original;
    return current;
  }

  function getOrigin() {
    return String(GM_getValue(STORE_KEYS.origin, '') || '').replace(/\/$/, '');
  }

  function setOrigin(value) {
    const raw = String(value || '').trim().replace(/\/$/, '');
    if (!raw) throw new Error('Informe a URL do KryzerHub.');
    const url = new URL(raw);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('Use HTTPS para o KryzerHub (HTTP é permitido somente em localhost).');
    }
    GM_setValue(STORE_KEYS.origin, url.origin);
    return url.origin;
  }

  function api(path, options = {}) {
    const origin = getOrigin();
    if (!origin) return Promise.reject(new Error('KryzerHub ainda não configurado.'));
    const token = GM_getValue(STORE_KEYS.token, '');
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: `${origin}${path}`,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token && options.auth !== false ? { Authorization: `Bearer ${token}` } : {})
        },
        data: options.body ? JSON.stringify(options.body) : undefined,
        timeout: 45000,
        onload(response) {
          let data = {};
          try { data = JSON.parse(response.responseText || '{}'); } catch {}
          resolve({ status: response.status, ok: response.status >= 200 && response.status < 300, data });
        },
        onerror() { reject(new Error('Falha de conexão com o KryzerHub.')); },
        ontimeout() { reject(new Error('O KryzerHub demorou demais para responder.')); }
      });
    });
  }

  function ensureStyles() {
    if (document.getElementById('kryzer-clone-style')) return;
    const style = document.createElement('style');
    style.id = 'kryzer-clone-style';
    style.textContent = `
      #kryzer-clone-button{position:fixed;right:22px;bottom:22px;z-index:2147483000;border:0;border-radius:14px;background:#111827;color:#fff;padding:12px 17px;font:700 13px/1.2 Arial,sans-serif;box-shadow:0 10px 30px #0003;cursor:pointer;display:flex;align-items:center;gap:8px}
      #kryzer-clone-button:hover{background:#f97316} #kryzer-clone-button small{font-weight:500;opacity:.72}
      #kryzer-clone-overlay{position:fixed;inset:0;z-index:2147483200;background:#0f172acc;display:grid;place-items:center;padding:20px;font-family:Arial,sans-serif}
      #kryzer-clone-modal{width:min(620px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 30px 80px #0005;color:#0f172a}
      .kz-head{padding:22px 24px 17px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;gap:15px}.kz-title{font-size:20px;font-weight:800}.kz-sub{font-size:12px;color:#64748b;margin-top:4px}.kz-close{border:0;background:#f1f5f9;border-radius:9px;width:34px;height:34px;cursor:pointer}
      .kz-body{padding:22px 24px}.kz-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.kz-card{border:1px solid #e2e8f0;border-radius:13px;padding:13px}.kz-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700}.kz-value{margin-top:5px;font-size:16px;font-weight:800}.kz-muted{font-size:12px;line-height:1.5;color:#64748b}.kz-field{margin-top:16px}.kz-field label{display:block;font-size:12px;font-weight:700;margin-bottom:7px}.kz-field select,.kz-field input{width:100%;box-sizing:border-box;height:43px;border:1px solid #cbd5e1;border-radius:10px;padding:0 11px;background:#fff;color:#0f172a}
      .kz-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.kz-btn{border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer}.kz-btn:disabled{opacity:.55;cursor:not-allowed}.kz-primary{background:#f97316;color:#fff}.kz-dark{background:#111827;color:#fff}.kz-light{background:#f1f5f9;color:#334155}.kz-danger{background:#b91c1c;color:#fff}
      .kz-warning{margin-top:16px;border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:13px;padding:14px}.kz-warning strong{display:block;margin-bottom:6px}.kz-success{margin-top:16px;border:1px solid #86efac;background:#f0fdf4;color:#166534;border-radius:13px;padding:14px}.kz-error{margin-top:16px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:13px;padding:14px}.kz-code{font-family:monospace;font-size:27px;font-weight:900;letter-spacing:.12em;background:#0f172a;color:#fff;border-radius:12px;padding:16px;text-align:center;margin:14px 0}
      @media(max-width:600px){.kz-row{grid-template-columns:1fr}#kryzer-clone-button{right:12px;bottom:12px}.kz-actions{flex-direction:column}.kz-btn{width:100%}}
    `;
    document.documentElement.appendChild(style);
  }

  function closeModal() {
    state.modal?.remove();
    state.modal = null;
  }

  function showModal(bodyHtml, title = 'Clonar anúncio', subtitle = '') {
    ensureStyles();
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'kryzer-clone-overlay';
    overlay.innerHTML = `<div id="kryzer-clone-modal"><div class="kz-head"><div><div class="kz-title">${escapeHtml(title)}</div><div class="kz-sub">${escapeHtml(subtitle)}</div></div><button class="kz-close" data-kz-close>×</button></div><div class="kz-body">${bodyHtml}</div></div>`;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest?.('[data-kz-close]')) closeModal();
    });
    document.documentElement.appendChild(overlay);
    state.modal = overlay;
    return overlay;
  }

  function errorBox(message) {
    return `<div class="kz-error">${escapeHtml(message)}</div>`;
  }

  async function configureOrigin() {
    const current = getOrigin();
    const modal = showModal(`
      <p class="kz-muted">Informe a URL pública do KryzerHub. Ela fica salva somente no Tampermonkey deste navegador.</p>
      <div class="kz-field"><label>URL do KryzerHub</label><input data-kz-origin value="${escapeHtml(current)}" placeholder="https://seu-kryzerhub.com"></div>
      <div data-kz-message></div>
      <div class="kz-actions"><button class="kz-btn kz-light" data-kz-close>Cancelar</button><button class="kz-btn kz-primary" data-kz-save>Salvar e conectar</button></div>
    `, 'Conectar ao KryzerHub', `Kryzer Clone ${VERSION}`);
    return new Promise(resolve => {
      modal.querySelector('[data-kz-save]').addEventListener('click', () => {
        try {
          const origin = setOrigin(modal.querySelector('[data-kz-origin]').value);
          closeModal();
          resolve(origin);
        } catch (error) {
          modal.querySelector('[data-kz-message]').innerHTML = errorBox(error.message);
        }
      });
    });
  }

  async function pairBrowser() {
    if (!getOrigin()) await configureOrigin();
    const start = await api('/api/browser/pair/start', {
      method: 'POST', auth: false,
      body: { deviceName: `Chrome / Tampermonkey - ${navigator.platform || 'Desktop'}` }
    });
    if (!start.ok) throw new Error(start.data?.message || 'Não foi possível iniciar a conexão.');
    const pair = start.data;
    GM_openInTab(pair.verificationUrl, { active: true, insert: true, setParent: true });

    const modal = showModal(`
      <p class="kz-muted">O KryzerHub foi aberto em outra guia. Entre na sua conta e confirme este código:</p>
      <div class="kz-code">${escapeHtml(pair.displayCode)}</div>
      <div class="kz-muted">Depois de autorizar, volte para esta janela e clique abaixo.</div>
      <div data-kz-message></div>
      <div class="kz-actions"><button class="kz-btn kz-light" data-kz-close>Cancelar</button><button class="kz-btn kz-primary" data-kz-check>Já autorizei</button></div>
    `, 'Autorizar navegador', 'O token do Mercado Livre nunca será enviado ao Tampermonkey');

    return new Promise((resolve, reject) => {
      modal.querySelector('[data-kz-check]').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Verificando...';
        try {
          const complete = await api('/api/browser/pair/complete', {
            method: 'POST', auth: false,
            body: { pairId: pair.pairId, pairSecret: pair.pairSecret }
          });
          if (complete.status === 202) {
            modal.querySelector('[data-kz-message]').innerHTML = `<div class="kz-warning">A autorização ainda não foi confirmada no KryzerHub.</div>`;
            button.disabled = false;
            button.textContent = 'Já autorizei';
            return;
          }
          if (!complete.ok) throw new Error(complete.data?.message || 'Não foi possível concluir a autorização.');
          GM_setValue(STORE_KEYS.token, complete.data.token);
          closeModal();
          resolve(complete.data.token);
        } catch (error) {
          modal.querySelector('[data-kz-message]').innerHTML = errorBox(error.message);
          button.disabled = false;
          button.textContent = 'Já autorizei';
          reject(error);
        }
      });
    });
  }

  async function ensureAuth() {
    if (!getOrigin()) await configureOrigin();
    if (!GM_getValue(STORE_KEYS.token, '')) await pairBrowser();
    let response = await api('/api/browser/stores');
    if (response.status === 401) {
      GM_deleteValue(STORE_KEYS.token);
      await pairBrowser();
      response = await api('/api/browser/stores');
    }
    if (!response.ok) throw new Error(response.data?.message || 'Não foi possível carregar suas lojas.');
    state.stores = Array.isArray(response.data?.stores) ? response.data.stores : [];
    return state.stores;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'data desconhecida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  function renderCloneStart() {
    const fullPrice = cloneFullPrice();
    const options = state.stores.map(store => `<option value="${escapeHtml(store.id)}">${escapeHtml(store.name)}</option>`).join('');
    const modal = showModal(`
      <div class="kz-row">
        <div class="kz-card"><div class="kz-label">Anúncio origem</div><div class="kz-value">${escapeHtml(state.context.mlb || 'identificando...')}</div><div class="kz-muted">${escapeHtml(state.context.mlbu || '')}</div></div>
        <div class="kz-card"><div class="kz-label">Estoque inicial</div><div class="kz-value">1</div><div class="kz-muted">O KryzerHub força esse valor no clone.</div></div>
        <div class="kz-card"><div class="kz-label">Preço atual</div><div class="kz-value">${money(state.context.price)}</div></div>
        <div class="kz-card"><div class="kz-label">Preço cheio usado</div><div class="kz-value">${money(fullPrice)}</div><div class="kz-muted">originalPrice → fallback para price</div></div>
      </div>
      <div class="kz-field"><label>Publicar em</label><select data-kz-store>${options}</select></div>
      <div data-kz-message></div>
      <div class="kz-actions"><button class="kz-btn kz-light" data-kz-close>Cancelar</button><button class="kz-btn kz-primary" data-kz-preview>Pré-visualizar clone</button></div>
    `, 'Clonar anúncio', 'Somente suas contas Mercado Livre aparecem aqui');
    const select = modal.querySelector('[data-kz-store]');
    if (state.selectedStoreId && state.stores.some(store => store.id === state.selectedStoreId)) select.value = state.selectedStoreId;
    modal.querySelector('[data-kz-preview]').addEventListener('click', async event => {
      state.selectedStoreId = select.value;
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Lendo anúncio...';
      try {
        await previewClone();
      } catch (error) {
        modal.querySelector('[data-kz-message]').innerHTML = errorBox(error.message);
        button.disabled = false;
        button.textContent = 'Pré-visualizar clone';
      }
    });
  }

  async function previewClone() {
    fallbackPricesFromDom();
    if (!state.context.mlb) throw new Error('Não consegui identificar o MLB deste anúncio. Recarregue a página e tente novamente.');
    const response = await api('/api/browser/mercadolivre/clone/preview', {
      method: 'POST',
      body: {
        sourceItemId: state.context.mlb,
        sourceUserProductId: state.context.mlbu,
        targetStoreId: state.selectedStoreId,
        pagePrice: state.context.price,
        pageOriginalPrice: state.context.originalPrice
      }
    });
    if (!response.ok) throw new Error(response.data?.message || 'Não foi possível montar a prévia.');
    state.preview = response.data;
    renderPreview();
  }

  function duplicateBlock(duplicate) {
    if (!duplicate?.wasCopiedBefore) return '';
    const copy = duplicate.previousCopy || {};
    return `<div class="kz-warning"><strong>⚠ Este anúncio desse concorrente já foi copiado.</strong>
      ${copy.createdAt ? `Última cópia: <b>${escapeHtml(formatDate(copy.createdAt))}</b><br>` : ''}
      ${copy.targetStoreName ? `Loja: <b>${escapeHtml(copy.targetStoreName)}</b><br>` : ''}
      ${copy.createdItemId ? `Anúncio criado: <b>${escapeHtml(copy.createdItemId)}</b><br>` : ''}
      Você pode cancelar para evitar duplicidade ou escolher <b>Copiar novamente</b> de propósito.</div>`;
  }

  function renderPreview() {
    const preview = state.preview;
    const duplicate = preview?.duplicate;
    const warnings = Array.isArray(preview?.clone?.warnings) && preview.clone.warnings.length
      ? `<div class="kz-warning"><strong>Avisos do clone</strong>${preview.clone.warnings.map(item => `<div>• ${escapeHtml(item)}</div>`).join('')}</div>` : '';
    const modal = showModal(`
      <div class="kz-card"><div class="kz-label">${escapeHtml(preview.source.itemId)}</div><div class="kz-value">${escapeHtml(preview.source.title)}</div></div>
      <div class="kz-row" style="margin-top:12px">
        <div class="kz-card"><div class="kz-label">Destino</div><div class="kz-value">${escapeHtml(preview.targetStore.name)}</div></div>
        <div class="kz-card"><div class="kz-label">Preço / estoque</div><div class="kz-value">${money(preview.clone.price)} · 1</div></div>
        <div class="kz-card"><div class="kz-label">Fotos</div><div class="kz-value">${escapeHtml(preview.source.pictures)}</div></div>
        <div class="kz-card"><div class="kz-label">Variações</div><div class="kz-value">${escapeHtml(preview.source.variations)}</div></div>
      </div>
      ${duplicateBlock(duplicate)}${warnings}<div data-kz-message></div>
      <div class="kz-actions">
        <button class="kz-btn kz-light" data-kz-close>Cancelar</button>
        <button class="kz-btn ${duplicate?.wasCopiedBefore ? 'kz-danger' : 'kz-primary'}" data-kz-publish>${duplicate?.wasCopiedBefore ? 'Copiar novamente' : 'Criar anúncio'}</button>
      </div>
    `, 'Confirmar clone', duplicate?.wasCopiedBefore ? 'Duplicidade detectada pelo histórico do KryzerHub' : 'Revise antes de publicar');
    modal.querySelector('[data-kz-publish]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Publicando...';
      try {
        await publishClone(Boolean(duplicate?.wasCopiedBefore));
      } catch (error) {
        modal.querySelector('[data-kz-message]').innerHTML = errorBox(error.message);
        button.disabled = false;
        button.textContent = duplicate?.wasCopiedBefore ? 'Copiar novamente' : 'Criar anúncio';
      }
    });
  }

  async function publishClone(allowDuplicate) {
    let response = await api('/api/browser/mercadolivre/clone/publish', {
      method: 'POST',
      body: { draftId: state.preview.draftId, targetStoreId: state.selectedStoreId, allowDuplicate }
    });
    if (response.status === 409 && response.data?.code === 'ALREADY_CLONED' && !allowDuplicate) {
      state.preview.duplicate = {
        wasCopiedBefore: true,
        sameTargetStore: true,
        previousCopy: response.data.previousCopy,
        previousCopies: [response.data.previousCopy]
      };
      renderPreview();
      return;
    }
    if (!response.ok) throw new Error(response.data?.message || 'O Mercado Livre recusou a criação do anúncio.');
    const created = response.data;
    const link = created.permalink ? `<a href="${escapeHtml(created.permalink)}" target="_blank" rel="noopener" style="color:#166534;font-weight:800">Abrir ${escapeHtml(created.itemId)}</a>` : `<b>${escapeHtml(created.itemId)}</b>`;
    showModal(`<div class="kz-success"><strong>Clone criado com sucesso.</strong><div style="margin-top:8px">${link}</div><div style="margin-top:5px">Preço: ${money(created.price)} · Estoque: 1</div></div>
      ${created.duplicatedIntentionally ? '<div class="kz-warning">Esta foi uma cópia repetida criada intencionalmente.</div>' : ''}
      <div class="kz-actions"><button class="kz-btn kz-dark" data-kz-close>Fechar</button></div>`, 'Anúncio publicado', created.targetStore?.name || 'Mercado Livre');
  }

  async function openClone() {
    if (state.busy) return;
    state.busy = true;
    try {
      fallbackPricesFromDom();
      const stores = await ensureAuth();
      if (!stores.length) throw new Error('Sua conta KryzerHub não possui loja Mercado Livre ativa conectada.');
      if (!state.selectedStoreId) state.selectedStoreId = stores[0].id;
      renderCloneStart();
    } catch (error) {
      showModal(`${errorBox(error.message)}<div class="kz-actions"><button class="kz-btn kz-light" data-kz-settings>Configurar URL</button><button class="kz-btn kz-dark" data-kz-close>Fechar</button></div>`, 'Kryzer Clone', 'Não foi possível iniciar');
      state.modal?.querySelector('[data-kz-settings]')?.addEventListener('click', async () => { closeModal(); await configureOrigin(); });
    } finally {
      state.busy = false;
    }
  }

  function refreshButton() {
    if (!state.button) return;
    const full = cloneFullPrice();
    state.button.innerHTML = `<span>⧉ Clonar</span><small>${state.context.mlb || ''}${full ? ` · ${money(full)}` : ''}</small>`;
  }

  function mountButton() {
    if (!allowedRoute() || state.button || !document.documentElement) return;
    ensureStyles();
    const button = document.createElement('button');
    button.id = 'kryzer-clone-button';
    button.type = 'button';
    button.addEventListener('click', openClone);
    document.documentElement.appendChild(button);
    state.button = button;
    refreshButton();
  }

  function resetForRoute() {
    closeModal();
    state.context = freshContext();
    state.preview = null;
    state.selectedStoreId = '';
    fallbackPricesFromDom();
    refreshButton();
  }

  try {
    GM_registerMenuCommand('Kryzer Clone: configurar URL do Hub', configureOrigin);
    GM_registerMenuCommand('Kryzer Clone: desconectar navegador', () => {
      GM_deleteValue(STORE_KEYS.token);
      alert('Kryzer Clone desconectado deste navegador.');
    });
  } catch {}

  hookPageSignals();
  let lastHref = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      resetForRoute();
    }
    if (allowedRoute()) {
      mountButton();
      fallbackPricesFromDom();
    } else if (state.button) {
      state.button.remove();
      state.button = null;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mountButton();
  setTimeout(fallbackPricesFromDom, 1000);
  setTimeout(fallbackPricesFromDom, 3000);
})();
