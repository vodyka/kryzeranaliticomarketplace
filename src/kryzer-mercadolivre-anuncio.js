(() => {
  'use strict';

  const KRYZER_VERSION = '1.1.0';
  const HOST_ID = 'kryzer-analitico-host';
  const ROUTE_RE = /^\/.+\/up\/MLBU\d+\/?$/i;

  if (window.__KRYZER_ANALITICO_MARKETPLACE__) return;
  window.__KRYZER_ANALITICO_MARKETPLACE__ = true;

  const state = {
    route: '',
    open: true,
    renderTimer: null,
    data: null
  };

  const creationKeys = [
    'created_at',
    'created_date',
    'date_created',
    'creation_date',
    'publication_date',
    'start_time'
  ];

  function allowedRoute() {
    return (
      (location.hostname === 'www.mercadolivre.com.br' ||
       location.hostname === 'www.mercadolibre.com.br') &&
      ROUTE_RE.test(location.pathname)
    );
  }

  function routeIds() {
    const href = location.href;
    const mlbu = href.match(/\/up\/(MLBU\d+)/i)?.[1] || null;
    let mlb = null;

    try {
      const filters = new URLSearchParams(location.search).get('pdp_filters') || '';
      mlb = filters.match(/item_id:(MLB\d+)/i)?.[1] || null;
    } catch {}

    if (!mlb) {
      mlb = href.match(/item_id(?::|%3A)(MLB\d+)/i)?.[1] || null;
    }

    return { mlb, mlbu };
  }

  function freshData() {
    const ids = routeIds();
    return {
      title: null,
      mlb: ids.mlb,
      mlbu: ids.mlbu,
      categoryId: null,
      rootCategoryId: null,
      domainId: null,
      listingTypeId: null,
      brand: null,

      price: null,
      originalPrice: null,
      pixDiscount: null,
      pixPrice: null,
      promotionCampaignId: null,

      quantity: null,
      hasStock: null,
      stockType: null,
      soldQuantity: null,
      picturesCount: null,
      videosQuantity: null,

      sellerId: null,
      sellerName: null,
      reputationLevel: null,
      powerSellerStatus: null,

      freeShipping: null,
      shippingMode: null,
      logisticType: null,
      buyerShippingPrice: null,
      billableWeight: null,
      shippingOptionId: null,
      deliveryMinDays: null,
      deliveryMaxDays: null,

      installments: null,
      installmentAmount: null,
      installmentsTotal: null,

      createdAt: null,
      createdAtSource: null,
      updatedAt: null,
      sourceUpp: false,
      sourceGtm: false,
      sourceSchema: false
    };
  }

  state.data = freshData();

  function merge(values) {
    if (!values) return;
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && value !== '') {
        state.data[key] = value;
      }
    }
    state.data.updatedAt = new Date().toISOString();
    scheduleRender();
  }

  function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function bool(value) {
    return value === true || value === false ? value : null;
  }

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function money(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(value));
  }

  function integer(value) {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('pt-BR').format(Number(value));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function listingLabel(value) {
    return ({
      gold_special: 'Clássico',
      gold_pro: 'Premium',
      free: 'Grátis'
    })[value] || value || '—';
  }

  function weightLabel(value) {
    const n = num(value);
    if (n === null) return '—';
    if (n >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
    return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} g`;
  }

  function deliveryLabel() {
    const min = state.data.deliveryMinDays;
    const max = state.data.deliveryMaxDays;
    if (min === null && max === null) return '—';
    if (min !== null && max !== null) {
      return min === max ? `${min} ${min === 1 ? 'dia' : 'dias'}` : `${min} a ${max} dias`;
    }
    return `${min ?? max} dias`;
  }

  function discountPercent() {
    const { price, originalPrice } = state.data;
    if (price === null || originalPrice === null || originalPrice <= 0 || price >= originalPrice) return null;
    return (1 - price / originalPrice) * 100;
  }

  function parseDate(value) {
    if (typeof value !== 'string' || value.length < 8) return null;
    const normalized = value.trim();
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getUTCFullYear();
    if (year < 2000 || year > new Date().getUTCFullYear() + 1) return null;
    return d;
  }

  function ageInfo() {
    const d = parseDate(state.data.createdAt);
    if (!d) {
      return {
        known: false,
        days: null,
        tone: 'gray',
        label: 'Data de criação não exposta',
        dateLabel: '—'
      };
    }

    const now = new Date();
    const diff = Math.max(0, now.getTime() - d.getTime());
    const days = Math.floor(diff / 86400000);

    let tone = 'green';
    if (days > 200) tone = 'red';
    else if (days >= 90) tone = 'yellow';

    return {
      known: true,
      days,
      tone,
      label: `Criado há ${days} ${days === 1 ? 'dia' : 'dias'}`,
      dateLabel: d.toLocaleDateString('pt-BR')
    };
  }

  // -----------------------------
  // Associação segura de data
  // -----------------------------

  function objectHasCurrentId(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const ids = routeIds();
    const candidates = [
      obj.id,
      obj.item_id,
      obj.itemId,
      obj.user_product_id,
      obj.userProductId,
      obj.product_id,
      obj.productId,
      obj.pid,
      obj.productID
    ].filter(Boolean).map(String);

    return Boolean(
      (ids.mlb && candidates.includes(ids.mlb)) ||
      (ids.mlbu && candidates.includes(ids.mlbu))
    );
  }

  function directCreationDate(obj) {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of creationKeys) {
      const d = parseDate(obj[key]);
      if (d) return { key, value: obj[key] };
    }
    return null;
  }

  function walkForCreation(node, depth = 0, seen = new WeakSet()) {
    if (!node || typeof node !== 'object' || depth > 12) return null;
    if (seen.has(node)) return null;
    seen.add(node);

    // Só aceita data direta num objeto que tenha ID direto do anúncio atual.
    if (objectHasCurrentId(node)) {
      const direct = directCreationDate(node);
      if (direct) return direct;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walkForCreation(item, depth + 1, seen);
        if (found) return found;
      }
      return null;
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = walkForCreation(value, depth + 1, seen);
        if (found) return found;
      }
    }

    return null;
  }

  function inspectJsonForCreation(json, source) {
    if (state.data.createdAt || !json) return;
    try {
      const found = walkForCreation(json);
      if (found) {
        merge({
          createdAt: found.value,
          createdAtSource: `${source}:${found.key}`
        });
      }
    } catch {}
  }

  function scanParseableScriptsForCreation() {
    if (state.data.createdAt || !allowedRoute()) return;

    const scripts = [...document.scripts];
    for (let i = 0; i < scripts.length; i++) {
      const raw = scripts[i].textContent?.trim();
      if (!raw || raw.length < 2 || raw.length > 5_000_000) continue;
      if (!raw.includes(state.data.mlb || '') && !raw.includes(state.data.mlbu || '')) continue;
      if (!creationKeys.some(k => raw.includes(k))) continue;

      try {
        const parsed = JSON.parse(raw);
        inspectJsonForCreation(parsed, `script-${i}`);
        if (state.data.createdAt) return;
      } catch {}
    }
  }

  // -----------------------------
  // UPP / Melidata
  // -----------------------------

  function bodyText(body) {
    if (body === null || body === undefined) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    try { return JSON.stringify(body); } catch { return String(body); }
  }

  function processMelidata(raw) {
    if (!allowedRoute()) return;
    const text = bodyText(raw);
    if (!text) return;

    let parsed;
    try { parsed = JSON.parse(text); } catch { return; }

    inspectJsonForCreation(parsed, 'melidata');

    const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : [];
    for (const track of tracks) {
      const e = track?.event_data;
      if (!e || typeof e !== 'object') continue;
      if (!(track.path === '/upp' || e.page_type === 'UPP')) continue;

      const current = routeIds();
      if (current.mlbu && e.user_product_id && String(e.user_product_id) !== current.mlbu) continue;
      if (current.mlb && e.item_id && String(e.item_id) !== current.mlb) continue;

      extractUpp(e);
    }
  }

  function extractUpp(e) {
    const pricing = e?.credit_view_components?.pricing || {};
    const promotion = Array.isArray(e?.available_promotions) ? e.available_promotions[0] : null;

    let price = num(e?.price);
    if (price === null) price = num(pricing?.actual_price);
    if (price === null && promotion) price = num(promotion?.value);

    let originalPrice = num(e?.original_price);
    if (originalPrice === null) originalPrice = num(pricing?.original_price);
    if (originalPrice === null && promotion) originalPrice = num(promotion?.original_value);

    const pixCampaign = (Array.isArray(pricing?.campaigns) ? pricing.campaigns : [])
      .find(c => String(c?.type || '').toUpperCase() === 'PIX');

    const pixDiscount = num(pixCampaign?.amount?.value);
    const pixPrice = price !== null && pixDiscount !== null && pixDiscount > 0
      ? round2(price - pixDiscount)
      : null;

    const method = Array.isArray(pricing?.recommended_methods) ? pricing.recommended_methods[0] : null;
    const shipping = e?.shipping_promise || {};
    const address = Array.isArray(shipping?.address_options) ? shipping.address_options[0] : null;

    merge({
      mlb: e?.item_id || null,
      mlbu: e?.user_product_id || null,
      categoryId: e?.category_id || null,
      domainId: e?.domain_id || null,
      listingTypeId: e?.listing_type_id || null,
      price,
      originalPrice,
      pixDiscount,
      pixPrice,
      promotionCampaignId: promotion?.campaign_id || null,
      quantity: num(e?.quantity),
      hasStock: bool(e?.has_stock),
      stockType: e?.stock_type || null,
      soldQuantity: num(e?.sold_quantity),
      picturesCount: num(e?.gallery?.pictures_count),
      videosQuantity: num(e?.reviews?.videos_quantity),
      sellerId: e?.seller_id || null,
      sellerName: e?.seller_name || null,
      reputationLevel: e?.reputation_level || null,
      powerSellerStatus: e?.power_seller_status || null,
      freeShipping: bool(e?.free_shipping),
      shippingMode: e?.shipping_mode || null,
      logisticType: e?.logistic_type || address?.logistic_type || null,
      buyerShippingPrice: num(address?.price?.amount),
      billableWeight: num(shipping?.billable_weight),
      shippingOptionId: address?.shipping_option_id || null,
      deliveryMinDays: num(address?.delivery_lower_bound?.days),
      deliveryMaxDays: num(address?.delivery_upper_bound?.days),
      installments: num(method?.installments),
      installmentAmount: num(method?.installment_amount),
      installmentsTotal: num(method?.installments_total),
      sourceUpp: true
    });
  }

  // -----------------------------
  // GTM
  // -----------------------------

  function processGtm(text) {
    if (!allowedRoute() || !text) return;
    let json;
    try { json = JSON.parse(text); } catch { return; }

    inspectJsonForCreation(json, 'gtm');

    const current = routeIds();
    if (current.mlb && json?.item_id && String(json.item_id) !== current.mlb) return;

    merge({
      mlb: json?.item_id || null,
      categoryId: json?.category_id || null,
      rootCategoryId: json?.root_category_id || null,
      domainId: json?.domain_id || null,
      sellerId: json?.seller_id || null,
      brand: json?.brand_id || null,
      sourceGtm: true
    });
  }

  // -----------------------------
  // Rede
  // -----------------------------

  const nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = async function (...args) {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === 'string' ? input : input?.url || '';

      if (allowedRoute() && /melidata\/tracks/i.test(url)) {
        processMelidata(init?.body || '');
      }

      const response = await nativeFetch.apply(this, args);

      if (allowedRoute() && (/gtm-signals/i.test(url) || /item|listing|product/i.test(url))) {
        try {
          response.clone().text().then(text => {
            if (/gtm-signals/i.test(url)) processGtm(text);
            try {
              const json = JSON.parse(text);
              inspectJsonForCreation(json, `fetch:${url}`);
            } catch {}
          }).catch(() => {});
        } catch {}
      }

      return response;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__kryzerMeta = { method: String(method || 'GET'), url: String(url || '') };
    return nativeOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__kryzerMeta || {};

    if (allowedRoute() && /melidata\/tracks/i.test(meta.url || '')) {
      processMelidata(body);
    }

    this.addEventListener('load', function () {
      if (!allowedRoute()) return;
      let text = '';
      try {
        if (!this.responseType || this.responseType === 'text') text = this.responseText || '';
        else if (this.responseType === 'json') text = JSON.stringify(this.response);
      } catch {}
      if (!text) return;

      if (/gtm-signals/i.test(meta.url || '')) processGtm(text);

      if (/gtm-signals|item|listing|product/i.test(meta.url || '')) {
        try {
          inspectJsonForCreation(JSON.parse(text), `xhr:${meta.url}`);
        } catch {}
      }
    });

    return nativeSend.call(this, body);
  };

  // -----------------------------
  // DOM / Schema
  // -----------------------------

  function scanPage() {
    if (!allowedRoute()) return;

    const current = routeIds();
    const title = document.querySelector('.ui-pdp-title')?.textContent?.trim() || null;

    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const script of scripts) {
      let parsed;
      try { parsed = JSON.parse(script.textContent); } catch { continue; }
      inspectJsonForCreation(parsed, 'json-ld');

      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of candidates) {
        if (!obj || typeof obj !== 'object' || !/product/i.test(String(obj['@type'] || ''))) continue;
        const productId = obj.productID || obj.sku || null;
        if (current.mlbu && productId && String(productId) !== current.mlbu) continue;

        const brand = typeof obj.brand === 'string' ? obj.brand : obj.brand?.name || null;
        merge({
          title: title || obj.name || null,
          brand,
          sourceSchema: true
        });
      }
    }

    if (title) merge({ title });
    scanParseableScriptsForCreation();
  }

  // -----------------------------
  // Score
  // -----------------------------

  function score() {
    const d = state.data;
    let total = 0;

    total += d.picturesCount >= 6 ? 20 : d.picturesCount >= 4 ? 15 : d.picturesCount >= 2 ? 8 : 0;
    total += d.videosQuantity > 0 ? 15 : 0;
    total += d.freeShipping === true ? 15 : 0;
    total += d.quantity >= 10 ? 15 : d.quantity >= 5 ? 10 : d.quantity > 0 ? 5 : 0;
    total += d.price !== null && d.originalPrice !== null && d.price < d.originalPrice ? 10 : 0;
    total += String(d.reputationLevel || '').includes('5_green') ? 15 : String(d.reputationLevel || '').includes('4_') ? 10 : d.reputationLevel ? 6 : 0;
    total += d.deliveryMaxDays !== null ? (d.deliveryMaxDays <= 2 ? 10 : d.deliveryMaxDays <= 4 ? 7 : d.deliveryMaxDays <= 7 ? 4 : 0) : 0;

    return Math.min(100, total);
  }

  // -----------------------------
  // UI
  // -----------------------------

  function row(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="k-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function ensureUI() {
    if (!allowedRoute() || !document.body) return;
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host{all:initial}
        *{box-sizing:border-box}
        #btn{position:fixed;right:20px;bottom:20px;z-index:2147483600;border:0;border-radius:12px;background:#111;color:#fff;padding:10px 14px;font:700 13px Arial;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.22)}
        #btn b{display:inline-grid;place-items:center;width:26px;height:26px;margin-right:7px;border-radius:7px;background:#ff6a00}
        #panel{position:fixed;right:20px;bottom:70px;z-index:2147483599;width:390px;max-width:calc(100vw - 28px);max-height:calc(100vh - 95px);overflow:auto;background:#fff;border:1px solid #e7e7e7;border-radius:16px;box-shadow:0 18px 55px rgba(0,0,0,.22);font-family:Arial,sans-serif;color:#222}
        .head{position:sticky;top:0;background:#fff;border-bottom:1px solid #eee;padding:14px 15px;display:flex;justify-content:space-between;align-items:center;z-index:2}
        .brand{font-weight:900;letter-spacing:.4px}.sub{font-size:10px;color:#888;margin-top:2px}.close{border:1px solid #e5e5e5;background:#fff;border-radius:8px;width:30px;height:30px;cursor:pointer}
        .body{padding:13px}.title{font-size:11px;line-height:1.4;color:#666;margin-bottom:10px}.card{border:1px solid #ededed;border-radius:12px;padding:12px;margin-bottom:10px}.label{font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#777;font-weight:800;margin-bottom:8px}.price{font-size:29px;font-weight:900}.old{font-size:11px;color:#999;text-decoration:line-through;margin-top:5px}.pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.pill{padding:5px 7px;border-radius:7px;background:#f2f2f2;font-size:10px;font-weight:700}.pill.green{background:#e8f7ed;color:#13853a}.pill.orange{background:#fff0e5;color:#d95300}
        .age{display:flex;align-items:center;gap:12px}.ageDot{width:14px;height:14px;border-radius:50%;flex:0 0 auto}.ageDot.green{background:#00a650}.ageDot.yellow{background:#f2c037}.ageDot.red{background:#e5484d}.ageDot.gray{background:#a9a9a9}.ageMain{font-size:17px;font-weight:900}.ageSub{font-size:10px;color:#777;margin-top:3px}.ageBox.green{background:#eefaf2;border-color:#bee9ca}.ageBox.yellow{background:#fff9e8;border-color:#f1dea4}.ageBox.red{background:#fff0f0;border-color:#f2bcbc}.ageBox.gray{background:#f6f6f6}
        .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.metric{background:#f7f7f7;border-radius:9px;padding:9px 4px;text-align:center}.metric b{display:block;font-size:16px}.metric span{font-size:9px;color:#777}.k-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f1f1f1;font-size:10px}.k-row:last-child{border-bottom:0}.k-row span{color:#777}.k-row strong{text-align:right;word-break:break-word}.score{font-size:25px;font-weight:900;color:#ff6a00}.note{font-size:9px;color:#999;line-height:1.4;margin-top:6px}details{border:1px solid #eee;border-radius:12px;margin-bottom:10px;overflow:hidden}summary{padding:11px 12px;background:#fafafa;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;cursor:pointer}.detail{padding:10px 12px}
        @media(max-width:600px){#panel{right:8px;bottom:65px;width:calc(100vw - 16px)}#btn{right:8px;bottom:10px}}
      </style>
      <button id="btn"><b>K</b>Analisar anúncio</button>
      <section id="panel">
        <div class="head"><div><div class="brand">KRYZER</div><div class="sub">Inteligência do anúncio</div></div><button class="close" id="close">×</button></div>
        <div class="body" id="content">Carregando…</div>
      </section>
    `;

    root.getElementById('btn').addEventListener('click', () => {
      state.open = !state.open;
      root.getElementById('panel').style.display = state.open ? 'block' : 'none';
    });

    root.getElementById('close').addEventListener('click', () => {
      state.open = false;
      root.getElementById('panel').style.display = 'none';
    });

    render();
  }

  function render() {
    if (!allowedRoute()) {
      destroyUI();
      return;
    }

    const host = document.getElementById(HOST_ID);
    const root = host?.shadowRoot;
    const content = root?.getElementById('content');
    if (!content) return;

    const d = state.data;
    const age = ageInfo();
    const discount = discountPercent();

    content.innerHTML = `
      ${d.title ? `<div class="title">${escapeHtml(d.title)}</div>` : ''}

      <div class="card ageBox ${age.tone}">
        <div class="label">Idade do anúncio</div>
        <div class="age">
          <span class="ageDot ${age.tone}"></span>
          <div>
            <div class="ageMain">${escapeHtml(age.label)}</div>
            <div class="ageSub">${age.known ? `Publicado em ${escapeHtml(age.dateLabel)}` : 'O Mercado Livre não expôs uma data de criação associada com segurança neste anúncio.'}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="label">Preço • ${escapeHtml(listingLabel(d.listingTypeId))}</div>
        <div class="price">${money(d.price)}</div>
        ${d.originalPrice !== null && d.price !== null && d.originalPrice > d.price ? `<div class="old">${money(d.originalPrice)}</div>` : ''}
        <div class="pills">
          ${discount !== null ? `<span class="pill orange">${discount.toFixed(1).replace('.', ',')}% OFF</span>` : ''}
          ${d.pixPrice !== null ? `<span class="pill green">Pix ${money(d.pixPrice)}</span>` : ''}
          ${d.freeShipping === true ? '<span class="pill green">Frete grátis</span>' : ''}
        </div>
      </div>

      <div class="card">
        <div class="label">Visão rápida</div>
        <div class="metrics">
          <div class="metric"><b>${integer(d.quantity)}</b><span>Estoque</span></div>
          <div class="metric"><b>${integer(d.soldQuantity)}</b><span>Vendidos</span></div>
          <div class="metric"><b>${integer(d.picturesCount)}</b><span>Fotos</span></div>
          <div class="metric"><b>${integer(d.videosQuantity)}</b><span>Vídeos</span></div>
        </div>
      </div>

      <div class="card">
        <div class="label">Logística</div>
        ${row('Frete grátis', d.freeShipping === null ? null : d.freeShipping ? 'Sim' : 'Não')}
        ${row('Comprador paga', d.buyerShippingPrice !== null ? money(d.buyerShippingPrice) : null)}
        ${row('Peso faturável', d.billableWeight !== null ? weightLabel(d.billableWeight) : null)}
        ${row('Prazo', d.deliveryMinDays !== null || d.deliveryMaxDays !== null ? deliveryLabel() : null)}
        ${row('Modalidade', d.shippingMode)}
        ${row('Logística', d.logisticType)}
      </div>

      <div class="card">
        <div class="label">Vendedor</div>
        ${row('Nome', d.sellerName)}
        ${row('Seller ID', d.sellerId)}
        ${row('Reputação', d.reputationLevel)}
        ${row('Nível', d.powerSellerStatus)}
      </div>

      <div class="card">
        <div class="label">Score Kryzer</div>
        <div class="score">${score()}/100</div>
        <div class="note">Pontuação própria Kryzer. A idade do anúncio não altera o score nesta versão.</div>
      </div>

      <div class="card">
        <div class="label">Pagamento e promoção</div>
        ${row('Preço promocional', d.price !== null ? money(d.price) : null)}
        ${row('Preço original', d.originalPrice !== null ? money(d.originalPrice) : null)}
        ${row('Pix', d.pixPrice !== null ? money(d.pixPrice) : null)}
        ${row('Parcelamento', d.installments !== null && d.installmentAmount !== null ? `${d.installments}x de ${money(d.installmentAmount)}` : null)}
        ${row('Total parcelado', d.installmentsTotal !== null ? money(d.installmentsTotal) : null)}
        ${row('Campanha', d.promotionCampaignId)}
      </div>

      <details>
        <summary>Dados técnicos</summary>
        <div class="detail">
          ${row('MLB', d.mlb)}
          ${row('MLBU', d.mlbu)}
          ${row('Categoria', d.categoryId)}
          ${row('Categoria raiz', d.rootCategoryId)}
          ${row('Domínio', d.domainId)}
          ${row('Tipo do anúncio', d.listingTypeId)}
          ${row('Marca', d.brand)}
          ${row('Shipping option', d.shippingOptionId)}
          ${row('Fonte da criação', d.createdAtSource)}
          ${row('Versão Kryzer', KRYZER_VERSION)}
        </div>
      </details>
    `;
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(render, 80);
  }

  function destroyUI() {
    document.getElementById(HOST_ID)?.remove();
  }

  function handleRoute() {
    const current = location.href;
    if (current === state.route) return;
    state.route = current;

    if (!allowedRoute()) {
      destroyUI();
      return;
    }

    state.data = freshData();

    const boot = () => {
      if (!allowedRoute()) return;
      ensureUI();
      scanPage();
    };

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  }

  window.__KRYZER_ANALITICO__ = {
    get data() { return { ...state.data, age: ageInfo(), score: score() }; },
    refresh() { scanPage(); render(); return this.data; },
    route() { return { allowed: allowedRoute(), url: location.href, ids: routeIds() }; },
    age() { const a = ageInfo(); console.table([a]); return a; },
    destroy() { destroyUI(); }
  };

  handleRoute();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      handleRoute();
      ensureUI();
      scanPage();
      let count = 0;
      const timer = setInterval(() => {
        if (!allowedRoute() || ++count > 12) return clearInterval(timer);
        scanPage();
        render();
      }, 700);
    }, { once: true });
  } else {
    ensureUI();
    scanPage();
  }

  setInterval(handleRoute, 500);
})();
