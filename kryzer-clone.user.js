// ==UserScript==
// @name         Kryzer Clone Mercado Livre
// @namespace    https://github.com/vodyka/kryzeranaliticomarketplace
// @version      1.0.0
// @description  Clona anúncio público do Mercado Livre para uma conta autorizada no KryzerHub
// @match        https://www.mercadolivre.com.br/*/up/MLBU*
// @match        https://www.mercadolibre.com.br/*/up/MLBU*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @connect      *
// @require      https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/src/kryzer-mercadolivre-clone.js?v=1.0.0
// @updateURL    https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-clone.user.js
// @downloadURL  https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-clone.user.js
// ==/UserScript==

// O clone usa somente um token Kryzer escopado/revogável no Tampermonkey.
// Access token, refresh token e client secret do Mercado Livre permanecem no KryzerHub.
