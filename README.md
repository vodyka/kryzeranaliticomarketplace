# Kryzer Analítico Marketplace

Analisador de anúncio público individual do Mercado Livre, com módulo opcional de clone integrado ao KryzerHub.

## Rota permitida

Os módulos só executam em URLs no formato:

```text
https://www.mercadolivre.com.br/.../up/MLBU...
```

Eles não injetam interface em Gestão de Anúncios, busca, página do vendedor ou outras telas.

## Instalação do analisador

Instale no Tampermonkey:

```text
kryzer-loader.user.js
```

O loader é pequeno. O código principal fica em:

```text
src/kryzer-mercadolivre-anuncio.js
```

## Clone integrado ao KryzerHub

Para habilitar o clone, instale também:

```text
kryzer-clone.user.js
```

O módulo principal fica em:

```text
src/kryzer-mercadolivre-clone.js
```

Fluxo:

1. abra um anúncio público `/up/MLBU...`;
2. clique em **Clonar**;
3. na primeira utilização, informe a URL pública do KryzerHub e autorize o navegador;
4. o KryzerHub devolve somente as contas Mercado Livre ativas do usuário autenticado;
5. escolha a loja e abra a prévia;
6. o preço inicial usa `originalPrice` quando disponível e válido, com fallback para `price`;
7. estoque inicial é sempre `1` (em anúncio com variações, `1` por variação);
8. antes da publicação o KryzerHub consulta o histórico pelo `source_item_id`;
9. se o anúncio já tiver sido copiado, a interface mostra a cópia anterior e exige a ação explícita **Copiar novamente**.

### Segurança

O Tampermonkey nunca recebe `access_token`, `refresh_token` ou `client_secret` do Mercado Livre. Ele guarda somente um token Kryzer escopado e revogável, emitido após pareamento com uma sessão autenticada do KryzerHub.

A validação de propriedade da loja e a proteção contra clone duplicado também são executadas no backend. Portanto, alterar `targetStoreId` pelo DevTools não permite publicar em uma conta pertencente a outro usuário.

### URL do KryzerHub

A URL pública é configurada uma vez pelo próprio painel do clone e fica no armazenamento privado do Tampermonkey. Também pode ser alterada pelo menu:

```text
Kryzer Clone: configurar URL do Hub
```

Enquanto o domínio definitivo não estiver fixado no loader, o `@connect *` é necessário para permitir a URL configurável. Depois de estabilizar o domínio de produção, substitua por um `@connect` específico.

## Idade do anúncio

Quando o Mercado Livre expõe uma data de criação associada com segurança ao MLB/MLBU atual, o Kryzer calcula a idade do anúncio:

- menos de 90 dias: verde
- de 90 até 200 dias: amarelo
- acima de 200 dias: vermelho

Se a página não expuser uma data de criação confiável, o Kryzer mostra `Data de criação não exposta` em cinza, sem inventar uma data.

## Atualização

Ao alterar um módulo, incremente a versão do loader correspondente e também o parâmetro `?v=` do respectivo `@require` para evitar cache do Tampermonkey.
