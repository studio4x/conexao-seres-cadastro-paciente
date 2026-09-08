# Contrato esperado do backend — Turnstile E2E v1

Este arquivo documenta o protocolo que a v1.3.3 espera. Ele não habilita nem altera o servidor.

## Objetivo

Permitir que o Playwright utilize as chaves oficiais de TESTE do Cloudflare Turnstile sem retirar a validação real dos visitantes normais e sem enviar um segredo permanente pela rede.

## Configuração secreta do servidor

- `E2E_TURNSTILE_ENABLED=true`
- `E2E_TURNSTILE_HMAC_SECRET=<mesmo segredo do .env.e2e.local>`

Esses valores não devem estar no GitHub nem em arquivos públicos.

## Headers

Uma requisição E2E apresenta:

- `X-CS-E2E-Mode: turnstile-test-v1`
- `X-CS-E2E-Run: <run-id>`
- `X-CS-E2E-Timestamp: <unix-seconds>`
- `X-CS-E2E-Signature: v1=<hex-hmac-sha256>`

## Canonical string

A assinatura é `HMAC-SHA256(secret, canonical)` em hexadecimal, onde `canonical` é exatamente:

```text
v1
<METHOD uppercase>
<hostname lowercase>
<pathname>
<timestamp>
<run-id>
<SHA256(body utf8) hex>
```

Para `GET /api/turnstile`, o corpo é string vazia.

A implementação do servidor deve:

1. negar o modo E2E se `E2E_TURNSTILE_ENABLED` não for `true`;
2. exigir todos os headers;
3. aceitar timestamp somente dentro de uma janela de até 180 segundos;
4. recomputar a assinatura com o corpo bruto recebido;
5. comparar assinatura em tempo constante;
6. responder `403` antes de qualquer chamada ao Asaas quando houver falha;
7. não registrar segredo nem assinatura completa em logs.

Sugestão de códigos de erro JSON:

- `E2E_DISABLED`
- `E2E_AUTH_MISSING`
- `E2E_AUTH_EXPIRED`
- `E2E_AUTH_INVALID`

## GET /api/turnstile

Sem autorização E2E: comportamento atual e sitekey REAL.

Com autorização E2E válida: retornar a sitekey oficial de teste que sempre passa:

`1x00000000000000000000AA`

## POST /api/patients

Sem autorização E2E: comportamento atual; validar com `TURNSTILE_SECRET_KEY`, action `cadastro_paciente` e hostname esperado.

Com autorização E2E válida: validar o token recebido no Siteverify usando a secret oficial de teste:

`1x0000000000000000000000000000000AA`

A exceção de teste só pode ser selecionada DEPOIS da validação HMAC. O restante do endpoint permanece real: validações do formulário, deduplicação, Asaas, cobrança, notificações e n8n.

## Implementações paralelas

O projeto de referência possui backend TypeScript/Edge e backend PHP/cPanel. O contrato deve ser implementado de forma equivalente em ambos antes de considerar a v1.3.3 apta a executar testes reais.
