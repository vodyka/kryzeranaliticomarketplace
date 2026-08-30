# Kryzer Analítico Marketplace

Analisador de anúncio público individual do Mercado Livre.

## Rota permitida

O módulo só executa em URLs no formato:

```text
https://www.mercadolivre.com.br/.../up/MLBU...
```

Ele não injeta interface em Gestão de Anúncios, busca, página do vendedor ou outras telas.

## Instalação

Instale no Tampermonkey o arquivo:

```text
kryzer-loader.user.js
```

O loader é pequeno. O código principal fica em:

```text
src/kryzer-mercadolivre-anuncio.js
```

## Idade do anúncio

Quando o Mercado Livre expõe uma data de criação associada com segurança ao MLB/MLBU atual, o Kryzer calcula a idade do anúncio:

- menos de 90 dias: verde
- de 90 até 200 dias: amarelo
- acima de 200 dias: vermelho

Se a página não expuser uma data de criação confiável, o Kryzer mostra `Data de criação não exposta` em cinza, sem inventar uma data.

## Atualização

Ao alterar o arquivo principal, incremente a versão do `kryzer-loader.user.js` e também o parâmetro `?v=` do `@require` para evitar cache do Tampermonkey.
