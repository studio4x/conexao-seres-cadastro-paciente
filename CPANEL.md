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

Após criar um cliente, `api/patients.php` recupera as notificações do cliente, filtra configurações ativas e pertencentes ao próprio cliente, envia somente os eventos controlados no `PUT /v3/notifications/batch` e valida o resultado com uma nova consulta. Para configurações duplicadas do mesmo evento, o ID é selecionado junto do offset: `PAYMENT_DUEDATE_WARNING` usa `5` e `PAYMENT_OVERDUE` usa `1`. Em seguida, cria ou recupera a cobrança avulsa de R$ 230,00 da primeira sessão por `GET /v3/payments` + `POST /v3/payments`, usando `billingType=UNDEFINED`, vencimento no próximo dia útil e referência `<externalReference>-sessao-1`. Erros do Asaas ficam limitados e sanitizados no `error_log`, incluindo status e até três pares `code`/`description` quando a API os fornece; falhas não desfazem o cliente nem provocam um novo POST de cobrança sem reconciliação.

O formulário envia também `serviceType`, `entryType` e `attendanceMode`. O PHP valida esses códigos conforme a idade da pessoa atendida, grava os labels nas observações do novo cliente e mantém `entryType` exclusivo para menores e `attendanceMode` exclusivo para adultos. Para adulto sem responsável, as observações contêm somente os dados do atendimento; para adulto com responsável e menor, preservam também a identificação da pessoa atendida. Esses campos são informativos nesta fase e não alteram a cobrança de R$ 230,00 nem a emissão da NFS-e.

O formulário envia ainda `mediaConsent` com `AUTHORIZED` ou `NOT_AUTHORIZED`. Esse campo registra a autorização de uso de imagens e vídeos e não altera a cobrança ou o atendimento.

O formulário envia também `firstSessionDate` em `DD/MM/AAAA`, `firstSessionTime` em `HH:MM` e `firstSessionMode` com `IN_PERSON` ou `ONLINE`. O PHP valida a data atual ou futura em `America/Sao_Paulo`, registra esses dados nas observações do cliente e não altera a cobrança ou o atendimento. Na modalidade presencial, a interface exibe discretamente o endereço `Rua Petrobrás, 683 – Vila Antonieta, São Paulo/SP – CEP 03474-060`; na modalidade online, exibe `Online via Google Meet` e orienta sobre o envio do link pelo WhatsApp. Eles ficam preparados para a futura confirmação de agendamento via WhatsApp.

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

Os nomes equivalentes de ambiente são `N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL` e `N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN`. O backend envia `asaas_customer_created` somente depois que um novo cliente recebe `customerId` válido e a cobrança da primeira sessão está pronta, usando nome, e-mail e WhatsApp do titular. Cliente existente ou cobrança ausente não dispara a mensagem; o n8n não espera pagamento nem NFS-e.

O envio usa cURL, Bearer token e timeout curto depois que a resposta pode ser finalizada com `fastcgi_finish_request()`. Se esse recurso não estiver disponível, a chamada continua sendo best-effort; qualquer falha do n8n ou da Evolution API é registrada no servidor e não invalida nem recria o cliente Asaas.

### Webhook n8n de primeira sessão paga

O endpoint `api/asaas-webhook.php` encaminha ao n8n as cobranças válidas da primeira sessão nos eventos `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`, respeitando os status já validados pelo webhook fiscal. O payload inclui `paymentId` para que o workflow faça a deduplicação por cobrança. O nome e o telefone são consultados diretamente no Asaas por `GET /v3/customers/{customerId}`; `customerName` continua sendo o nome do titular e `customerWhatsapp` prioriza `mobilePhone` e usa `phone` quando necessário, permanecendo vazio se ambos faltarem. A mesma resposta do cliente é usada para extrair de `observations` `patientName`, `firstSessionDate`, `firstSessionTime` e `firstSessionMode` pelas linhas estritas da primeira sessão, aceitando `Online via Google Meet` e o rótulo legado `Online`. Quando a linha de pessoa atendida não existe, `patientName` usa `customerName`; linha inválida e dados ausentes ou alterados resultam em strings vazias sem bloquear o pagamento ou a NFS-e. Não é feita uma segunda consulta de cliente. Também são enviados `invoiceNumber` e `invoiceUrl`, primeiro aproveitando os campos do evento e, se algum faltar, consultando `GET /v3/payments/{paymentId}`. A URL nunca é construída manualmente; campos ausentes permanecem como strings vazias sem interromper o n8n ou a NFS-e.

No `config.php` privado, configure:

```php
'n8n_pagamento_webhook_url' => 'COLE_AQUI_A_URL_DO_WEBHOOK_N8N_DE_PAGAMENTO',
'n8n_pagamento_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N_DE_PAGAMENTO',
```

As variáveis equivalentes são `N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_URL` e `N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_TOKEN`. O POST usa Bearer token, JSON e timeout de 3 segundos. URL/token ausentes, erro HTTP, indisponibilidade ou timeout são best-effort: o log contém somente dados técnicos mínimos e o processamento da NFS-e continua independente. Não configure workflow n8n neste repositório.

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
O erro de criação de cliente pode ser investigado no `error_log` da instalação publicada, procurando por linhas no formato `Asaas customer creation failed. HTTP 400. Errors: [{"code":"...","description":"..."}]`. Respostas sem erros estruturados usam o fallback sanitizado `Response: ...`, e falhas de transporte usam `Transport error: ...`. Esses registros não incluem payload completo, credenciais ou dados pessoais.

## Fluxo recomendado de publicação

1. Faça a alteração na fonte correta.
2. Execute as validações relevantes. Quando PHP estiver disponível, execute `php -l` para os arquivos PHP da fonte e de `cpanel-dist`; a publicação cPanel não deve ser considerada validada sem a verificação de sintaxe do artefato gerado.
3. Execute `npm run build:cpanel`.
4. Confirme o novo `Build vX.Y.Z`.
5. Confirme que `cpanel-dist/` contém os artefatos atualizados.
6. Faça commit e push em `main`.
7. O GitHub dispara o webhook imediatamente.
8. O cPanel executa `git pull --ff-only origin main`.
9. Confirme o deploy pelo log e pelo commit publicado.

O workflow `PHP syntax` no GitHub Actions executa esse lint com PHP 8.3 em cada push e pull request para `main`, cobrindo `patients.php` e `asaas-webhook.php` tanto na fonte quanto no artefato gerado. Ele complementa a verificação local, mas não confirma sozinho o deploy no servidor cPanel.

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
