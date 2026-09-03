# Publicação no cPanel

Este projeto gera uma versão estática da página com endpoints PHP para Asaas, CEP, Turnstile e deploy por webhook, adequada à hospedagem cPanel da Conexão Seres.

## Ambiente de produção

- Domínio: `https://cadastro.conexaoseres.com.br/`
- Diretório do repositório no servidor: `/home/conexaoseres/cadastro.conexaoseres.com.br`
- Branch publicada: `main`

## Gerar o pacote

```bash
npm run build:cpanel
```

O conteúdo pronto para publicação é criado em `cpanel-dist/`. A pasta é mantida no repositório para que o servidor de produção precise apenas executar `git pull`, sem Node.js ou build no cPanel.

A build copia para `cpanel-dist/api/`:

- `cep.php`
- `patients.php`
- `turnstile.php`
- `asaas-webhook.php`
- `deploy-webhook.php`
- `config.example.php`
- `.htaccess`

## Configuração privada

Dentro de `cpanel-dist/api/`, crie `config.php` com base em `config.example.php` e configure as credenciais reais do Asaas, o token do webhook Asaas, Cloudflare Turnstile e o webhook n8n.

Após criar um cliente, `api/patients.php` recupera as notificações do cliente, filtra configurações ativas e pertencentes ao próprio cliente, envia somente os eventos controlados no `PUT /v3/notifications/batch` e valida o resultado com uma nova consulta. Para configurações duplicadas do mesmo evento, o ID é selecionado junto do offset: `PAYMENT_DUEDATE_WARNING` usa `5` e `PAYMENT_OVERDUE` usa `1`. Em seguida, cria ou recupera a cobrança avulsa de R$ 230,00 da primeira sessão por `GET /v3/payments` + `POST /v3/payments`, usando `billingType=UNDEFINED`, vencimento no próximo dia útil e referência `<externalReference>-sessao-1`. Erros do Asaas ficam limitados e sanitizados no `error_log`; falhas não desfazem o cliente nem provocam um novo POST de cobrança sem reconciliação.

A configuração fiscal da conta permanece no Asaas. Como `invoiceSettings` é documentado para assinaturas, o cPanel solicita explicitamente a NFS-e da cobrança avulsa após o pagamento pelo endpoint público `POST /api/asaas/webhook`, que chama `POST /v3/invoices` vinculado ao `payment`. O webhook aceita `PAYMENT_CONFIRMED`/`CONFIRMED` e `PAYMENT_RECEIVED`/`RECEIVED` ou `RECEIVED_IN_CASH`, valida o token `asaas-access-token`, ignora eventos irrelevantes com 2xx e cobre tanto o PIX recebido quanto o recebimento em dinheiro registrado manualmente.

O processamento valida o cliente, o ID, o valor de R$ 230,00 e a referência exata da primeira sessão. Consulta `GET /v3/invoices?payment=<paymentId>` antes de criar, usa lock por hash do pagamento com `flock` no PHP e reconcilia a mesma consulta após respostas inconclusivas. Consulta ainda `/v3/fiscalInfo/` e percorre `/v3/fiscalInfo/services` com `offset` e páginas de até 100 itens. Uma única correspondência de código `04510` ou descrição completa seleciona o ID retornado; múltiplas correspondências são ambíguas e não geram nota; nenhuma correspondência usa o código municipal confirmado `04510`, sem inventar `municipalServiceId`. Falhas transitórias retornam 500 para retry; erros permanentes retornam 2xx sem retry infinito.

O endpoint tem a URL pública:

```text
https://cadastro.conexaoseres.com.br/api/asaas/webhook
```

Configure o token privado no Asaas e no `config.php`:

```php
'asaas_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_ASAAS',
```

O nome equivalente de ambiente é `ASAAS_WEBHOOK_TOKEN`. Nunca use a chave da API como token do webhook.

Os arquivos abaixo são privados e não devem ser versionados:

```text
cpanel-server/api/config.php
cpanel-dist/api/config.php
```

O Apache bloqueia acesso direto aos arquivos de configuração.

### Webhook n8n de cadastro realizado

O endpoint usado em produção é:

```text
https://webhook.studio4x.com.br/webhook/conexao-seres-cadastro-realizado
```

Configure no `config.php` privado, ou por variáveis de ambiente, as chaves:

```php
'n8n_cadastro_webhook_url' => 'https://webhook.studio4x.com.br/webhook/conexao-seres-cadastro-realizado',
'n8n_cadastro_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N',
```

Os nomes equivalentes de ambiente são `N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL` e `N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN`. O backend envia `asaas_customer_created` somente depois que um novo cliente recebe `customerId` válido e a cobrança da primeira sessão está pronta, usando o nome e WhatsApp do titular. Cliente existente ou cobrança ausente não dispara a mensagem; o n8n não espera pagamento nem NFS-e.

O envio usa cURL, Bearer token e timeout curto depois que a resposta pode ser finalizada com `fastcgi_finish_request()`. Se esse recurso não estiver disponível, a chamada continua sendo best-effort; qualquer falha do n8n ou da Evolution API é registrada no servidor e não invalida nem recria o cliente Asaas.

## Deploy automático por webhook do GitHub

A atualização principal de produção é feita por webhook HTTPS do GitHub.

Depois de um `push` na branch `main`, o GitHub envia um `POST` assinado para:

```text
https://cadastro.conexaoseres.com.br/api/deploy-webhook.php
```

O endpoint versionado tem sua fonte em:

```text
cpanel-server/api/deploy-webhook.php
```

e é incluído em `cpanel-dist/api/deploy-webhook.php` por `npm run build:cpanel`.

O webhook valida:

- método `POST`;
- assinatura HMAC SHA-256 enviada em `X-Hub-Signature-256`;
- evento `push`;
- repositório `studio4x/conexao-seres-cadastro-paciente`;
- branch `refs/heads/main`;
- lock para impedir dois deploys simultâneos.

Depois da validação, executa no próprio servidor:

```bash
/usr/bin/git -C /home/conexaoseres/cadastro.conexaoseres.com.br pull --ff-only origin main
```

Não use `reset --hard` como mecanismo normal de deploy.

### Segredo do webhook

O segredo compartilhado com o GitHub fica fora da pasta pública e fora do repositório:

```text
/home/conexaoseres/.github-deploy-secret
```

Permissão recomendada:

```bash
chmod 600 /home/conexaoseres/.github-deploy-secret
```

No GitHub, o mesmo valor deve estar configurado em:

`Settings > Webhooks > webhook de produção > Secret`

Nunca copie esse valor para `README.md`, `AGENTS.md`, código, commits ou issues.

### Log e lock

O endpoint utiliza:

```text
/home/conexaoseres/github-deploy.log
/home/conexaoseres/.github-deploy.lock
```

Para consultar as últimas execuções no Terminal do cPanel:

```bash
tail -n 20 /home/conexaoseres/github-deploy.log
```

Para conferir o commit atualmente publicado:

```bash
git -C /home/conexaoseres/cadastro.conexaoseres.com.br log -1 --oneline
```

E o estado do repositório:

```bash
git -C /home/conexaoseres/cadastro.conexaoseres.com.br status -sb
```

## Cron de contingência

O cron que executa `git pull` pode permanecer habilitado apenas como fallback, em uma frequência mais baixa, por exemplo a cada 30 ou 60 minutos:

```bash
/usr/bin/git -C /home/conexaoseres/cadastro.conexaoseres.com.br pull --ff-only origin main >/dev/null
```

O webhook é o mecanismo primário de atualização imediata. O cron existe apenas para recuperar uma eventual entrega perdida pelo webhook.

## Arquivos de log do cPanel

Arquivos chamados `error_log` são gerados pelo servidor e não fazem parte do projeto. Eles são ignorados pelo Git e não devem ser commitados.

## Fluxo recomendado de publicação

1. Faça a alteração na fonte correta.
2. Execute as validações relevantes.
3. Execute `npm run build:cpanel`.
4. Confirme o novo `Build vX.Y.Z`.
5. Confirme que `cpanel-dist/` contém os artefatos atualizados.
6. Faça commit e push em `main`.
7. O GitHub dispara o webhook imediatamente.
8. O cPanel executa `git pull --ff-only origin main`.
9. Confirme o deploy pelo log e pelo commit publicado.

## Requisitos do servidor

- PHP 8.1 ou superior;
- extensões `curl` e `json`;
- função PHP `exec` disponível para o webhook de deploy;
- Apache com `mod_rewrite`;
- HTTPS válido;
- saída HTTPS para Asaas, Cloudflare Turnstile e serviço de CEP;
- repositório Git em `/home/conexaoseres/cadastro.conexaoseres.com.br`.

## Cloudflare Turnstile

No painel do Cloudflare Turnstile, autorize:

```text
cadastro.conexaoseres.com.br
```

O arquivo `api/config.php` deve conter as chaves corretas e permanecer somente no servidor.
