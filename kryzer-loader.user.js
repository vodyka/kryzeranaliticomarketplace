// ==UserScript==
// @name         Kryzer Analítico Marketplace
// @namespace    https://github.com/vodyka/kryzeranaliticomarketplace
// @version      1.2.0
// @description  Loader do Kryzer para anúncio público individual do Mercado Livre
// @match        https://www.mercadolivre.com.br/*/up/MLBU*
// @match        https://www.mercadolibre.com.br/*/up/MLBU*
// @run-at       document-start
// @grant        none
// @require      https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/src/kryzer-created-at.js?v=1.2.0
// @require      https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/src/kryzer-mercadolivre-anuncio.js?v=1.1.0
// @updateURL    https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-loader.user.js
// @downloadURL  https://raw.githubusercontent.com/vodyka/kryzeranaliticomarketplace/main/kryzer-loader.user.js
// ==/UserScript==

// O motor de data roda primeiro para capturar rede/HTML desde document-start.
// O módulo visual principal continua separado no GitHub.
// Ambos ficam restritos à rota pública individual /up/MLBU... .