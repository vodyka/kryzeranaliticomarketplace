// ==UserScript==
// @name         Kryzer Clone Mercado Livre
// @namespace    https://github.com/vodyka/kryzeranaliticomarketplace
// @version      1.0.3
// @description  Clona anúncio público do Mercado Livre para uma conta autorizada no KryzerHub
// @match        https://mercadolivre.com.br/*/up/MLBU*
// @match        https://www.mercadolivre.com.br/*/up/MLBU*
// @match        https://mercadolibre.com.br/*/up/MLBU*
// @match        https://www.mercadolibre.com.br/*/up/MLBU*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @connect      raw.githubusercontent.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-clone.user.js
// @downloadURL  https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-clone.user.js
// ==/UserScript==

(() => {
  'use strict';

  const SOURCE_URL = 'https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/src/kryzer-mercadolivre-clone.js';

  function showStatus(text, kind = 'loading') {
    const mount = () => {
      let badge = document.getElementById('kryzer-clone-bootstrap-status');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'kryzer-clone-bootstrap-status';
        Object.assign(badge.style, {
          position: 'fixed',
          right: '22px',
          bottom: '142px',
          zIndex: '2147483647',
          padding: '8px 11px',
          borderRadius: '9px',
          font: '700 12px Arial,sans-serif',
          boxShadow: '0 6px 20px #0003',
          pointerEvents: 'none'
        });
        (document.documentElement || document.body).appendChild(badge);
      }
      badge.textContent = text;
      badge.style.background = kind === 'error' ? '#b91c1c' : kind === 'success' ? '#166534' : '#111827';
      badge.style.color = '#fff';
      return badge;
    };

    if (document.documentElement) return mount();
    document.addEventListener('DOMContentLoaded', mount, { once: true });
    return null;
  }

  showStatus('K Clone carregando…');

  GM_xmlhttpRequest({
    method: 'GET',
    url: `${SOURCE_URL}?v=1.0.3&t=${Date.now()}`,
    headers: { Accept: 'text/plain' },
    timeout: 30000,
    onload(response) {
      if (response.status < 200 || response.status >= 300 || !response.responseText) {
        showStatus(`K Clone erro HTTP ${response.status}`, 'error');
        console.error('[Kryzer Clone] Falha ao carregar código:', response.status, response.responseText);
        return;
      }

      try {
        // Executa dentro do sandbox do Tampermonkey, onde GM_* e unsafeWindow estão disponíveis.
        (0, eval)(`${response.responseText}\n//# sourceURL=kryzer-mercadolivre-clone.runtime.js`);
        showStatus('K Clone pronto', 'success');

        let attempts = 0;
        const timer = setInterval(() => {
          attempts += 1;
          const button = document.getElementById('kryzer-clone-button');
          if (button) {
            button.style.bottom = '82px';
            document.getElementById('kryzer-clone-bootstrap-status')?.remove();
            clearInterval(timer);
          } else if (attempts >= 20) {
            showStatus('K Clone carregou, mas botão não montou', 'error');
            clearInterval(timer);
          }
        }, 500);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showStatus(`K Clone erro: ${message.slice(0, 80)}`, 'error');
        console.error('[Kryzer Clone] Erro ao executar código:', error);
      }
    },
    onerror(error) {
      showStatus('K Clone sem acesso ao código', 'error');
      console.error('[Kryzer Clone] Erro de rede:', error);
    },
    ontimeout() {
      showStatus('K Clone timeout ao carregar', 'error');
      console.error('[Kryzer Clone] Timeout ao carregar o código.');
    }
  });
})();
