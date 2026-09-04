# Cadastro de Paciente — Conexão Seres

Formulário web de cadastro de pacientes da **Conexão Seres**, integrado ao **Asaas**, com validação de dados, consulta automática de CEP, proteção por **Cloudflare Turnstile**, versionamento automático de build e publicação em **cPanel + PHP**.

## Repositório

- [studio4x/conexao-seres-cadastro-paciente](https://github.com/studio4x/conexao-seres-cadastro-paciente)
- Branch principal: `main`

## Ambiente publicado

- `https://cadastro.conexaoseres.com.br/`

## Visão geral

O fluxo principal é:

1. A pessoa informa os dados de quem receberá o atendimento.
2. O sistema calcula a idade pela data de nascimento.
3. Menores de 18 anos exigem responsável.
4. Adultos podem ser cadastrados diretamente ou com responsável legal/financeiro.
5. CPF, WhatsApp, e-mail, CEP e endereço são validados.
6. O Cloudflare Turnstile protege o envio.
7. O backend procura um cadastro existente no Asaas por `externalReference`.
8. Quando necessário, cria um novo cliente segundo as regras da clínica.
9. Depois de confirmar um novo `customerId`, configura as notificações do cliente no Asaas.
10. Para cliente novo, cria ou recupera de forma idempotente a cobrança avulsa da primeira sessão.
11. Envia o evento ao n8n depois de confirmar o cliente novo e a cobrança, sem esperar pagamento ou nota fiscal.
12. Recebe `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED` e solicita explicitamente a NFS-e da primeira sessão.

## Principais recursos

- React + TypeScript.
- Validação de CPF brasileiro.
- Validação de WhatsApp com DDD brasileiro.
- Validação de e-mail e endereço.
- Consulta automática de CEP.
- Regras específicas para adultos, menores e responsáveis.
- Cloudflare Turnstile.
- Honeypot contra bots.
- Integração com Asaas.
- Sexo do paciente obrigatório e explícito (`female`, `male` ou `non_binary`) para a descrição da cobrança.
- Cobrança avulsa de R$ 230,00 para a primeira sessão, com vencimento no próximo dia útil.
- Deduplicação por referência externa determinística.
- Grupos `Adultos` e `Crianças`.
- Configuração de notificações do Asaas por evento.
- Notificação best-effort ao n8n somente após cliente e cobrança novos confirmados.
- Webhook fiscal idempotente para solicitar NFS-e após o pagamento da primeira sessão.
- Build estática para cPanel.
- Build versionada no rodapé.
- Deploy automático do cPanel por webhook HTTPS do GitHub.

## Regras de negócio

### Adulto sem responsável

O próprio paciente é o titular do cliente no Asaas.

- usa os dados do paciente como dados principais;
- não repete esses mesmos dados em `observations`;
- grupo `Adultos`.

### Adulto com responsável

O responsável passa a ser o titular do cliente no Asaas.

- o campo `company` recebe o nome da pessoa atendida;
- os dados da pessoa atendida ficam em `observations`;
- contato e endereço do paciente são preservados nas observações;
- as datas de nascimento da pessoa atendida e do responsável são registradas em `DD/MM/AAAA`;
- grupo `Adultos`.

### Menor de 18 anos

O responsável é obrigatório e é o titular do cliente no Asaas.

- `company`: nome da pessoa atendida;
- `observations`: identificação da pessoa atendida e datas de nascimento no formato `DD/MM/AAAA`;
- grupo `Crianças`.

Como o formulário não solicita contato e endereço próprios do menor, esses dados não são exigidos nesse cenário.

## Sobre o atendimento

O formulário também registra, em códigos estáveis, as informações combinadas para o atendimento:

- `serviceType`: `ADULT_NEURO_REHAB`, `ADULT_PSYCHOANALYSIS_INTEGRATED`, `ADULT_SENSORY_STIMULATION` ou `UNDEFINED` para adultos; `CHILD_OT`, `CHILD_NEURO_REHAB`, `CHILD_SENSORY_INTEGRATION` ou `UNDEFINED` para menores;
- `entryType`: `FULL_ASSESSMENT`, `DIRECT_START` ou `UNDEFINED`, somente para menores;
- `attendanceMode`: `IN_PERSON`, `ONLINE` ou `UNDEFINED`, somente para adultos.

Os backends validam os códigos conforme a idade calculada a partir da data de nascimento e acrescentam os labels correspondentes às `observations` do cliente novo no Asaas. Esses campos são informativos nesta fase e não alteram a cobrança da primeira sessão, que permanece em R$ 230,00, nem NFS-e, notificações, webhooks ou integrações existentes.

## Deduplicação no Asaas

A referência externa segue o formato:

```text
cs-paciente-<hash>
```

O hash deriva de:

```text
CPF da pessoa atendida + nome normalizado da pessoa atendida
```

Quando o `externalReference` já existe:

- não cria outro cliente;
- retorna `409` com uma mensagem amigável informando que já existe cadastro com o CPF e/ou e-mail;
- não altera o cliente existente por meio de um novo envio duplicado.

## Notificações do Asaas

O sistema configura as notificações do cliente por evento.

Nos eventos controlados:

- WhatsApp permanece ativo nos avisos previstos pela regra de negócio;
- e-mail, SMS e ligação permanecem desativados;
- aviso antes do vencimento usa `scheduleOffset = 5`;
- lembrete após vencimento usa `scheduleOffset = 1`;
- `SEND_LINHA_DIGITAVEL` permanece com WhatsApp desativado.

Falha ao configurar notificações não invalida um cliente que já tenha sido criado com sucesso.

Após recuperar as configurações do cliente, o backend envia ao `PUT /v3/notifications/batch` somente notificações ativas, pertencentes ao cliente e dos eventos controlados pela aplicação. Notificações marcadas como `deleted` ou associadas a outro cliente são ignoradas. Quando há mais de uma configuração para o mesmo evento, o ID é escolhido junto com o `scheduleOffset`; o aviso antes do vencimento recebe `5` e o aviso após o vencimento recebe `1`. Depois do lote, o backend consulta novamente as notificações para validar os canais e offsets aplicados. Falhas do lote ou da validação são registradas com a resposta Asaas limitada e sanitizada, sem expor credenciais ao navegador.

## Cobrança da primeira sessão

Somente depois de criar um cliente novo, os dois backends consultam `GET /v3/payments` pelo cliente e pela referência externa determinística `<externalReference>-sessao-1`. Se não houver cobrança, fazem um único `POST /v3/payments` com:

```json
{
  "billingType": "UNDEFINED",
  "value": 230.0,
  "dueDate": "próximo dia útil em America/Sao_Paulo",
  "externalReference": "cs-paciente-<hash>-sessao-1"
}
```

`UNDEFINED` mantém a escolha do meio de pagamento com o cliente. A descrição usa sempre o nome, CPF formatado e sexo da pessoa atendida, mesmo quando o responsável é o titular no Asaas. O vencimento considera segunda a quinta-feira como +1 dia e sexta, sábado e domingo como a segunda-feira seguinte; feriados não são consultados.

Se a criação responder com erro, timeout ou payload inconclusivo, o backend faz apenas uma reconciliação pela mesma referência e não repete o `POST`. Cliente existente continua retornando `409` e não cria cobrança.

## Automação fiscal da cobrança avulsa

A cobrança inicial é criada por `POST /v3/payments`; a configuração de emissão automática documentada pelo Asaas com `invoiceSettings` é própria de assinaturas. Por isso, a integração mantém a configuração fiscal da conta no Asaas e, depois do pagamento, solicita a NFS-e explicitamente por `POST /v3/invoices`, vinculada ao `payment`. A cobrança avulsa não tenta inventar uma configuração `invoiceSettings` própria.

O endpoint público `POST /api/asaas/webhook` aceita somente o token privado configurado no cabeçalho `asaas-access-token` e processa `PAYMENT_CONFIRMED` com status `CONFIRMED` e `PAYMENT_RECEIVED` com status `RECEIVED` ou `RECEIVED_IN_CASH`. O segundo status cobre o recebimento em dinheiro registrado manualmente; a documentação do Asaas confirma que esse fluxo gera `PAYMENT_RECEIVED` e usa `billingType = RECEIVED_IN_CASH`. PIX continua coberto quando chega como `RECEIVED`, conforme a [documentação de eventos de cobrança do Asaas](https://docs.asaas.com/docs/webhook-para-cobrancas) e a [confirmação de recebimento em dinheiro](https://docs.asaas.com/reference/confirmar-recebimento-em-dinheiro).

Antes de emitir, o backend valida o pagamento da primeira sessão por ID, cliente, valor de R$ 230,00 e referência exata `cs-paciente-<24 hex>-sessao-1`. Consulta `GET /v3/invoices?payment=<paymentId>` antes do POST e reconcilia novamente se a resposta da criação for inconclusiva. O PHP serializa concorrências com lock por pagamento; no runtime Edge, a consulta idempotente ao Asaas é a fonte compartilhada de reconciliação.

Para o serviço, consulta `GET /v3/fiscalInfo/` e percorre `GET /v3/fiscalInfo/services` em páginas de até 100 itens usando `offset`, até `hasMore=false` ou o fim indicado por `totalCount`. Primeiro procura código municipal `04510`; sem código, aceita somente a descrição que contenha `04510`, `4.08` e `Terapia Ocupacional`. Uma única correspondência usa o `municipalServiceId` retornado pelo Asaas. Duas ou mais correspondências não geram nota; nenhuma correspondência usa o código municipal confirmado `04510` e `municipalServiceName` padrão, sem inventar ID. O payload usa valor R$ 230,00, deduções zero, descrição padrão, `updatePayment=false`, `retainIss=false`, ISS de 2%, demais retenções zeradas e `effectiveDate` derivada do pagamento ou da data atual de São Paulo. A API de [agendamento de nota fiscal](https://docs.asaas.com/reference/agendar-nota-fiscal), [listagem por pagamento](https://docs.asaas.com/reference/listar-notas-fiscais), [informações fiscais](https://docs.asaas.com/reference/recuperar-informacoes-fiscais) e [serviços municipais](https://docs.asaas.com/reference/listar-servicos-municipais) orienta esses endpoints e campos.

Erros de autenticação, configuração fiscal ausente, serviço inválido ou payload rejeitado são encerrados sem retry infinito. Timeout, falha de conexão, `408`, `425`, `429` e `5xx` retornam erro para o Asaas tentar novamente; após POST inconclusivo, uma nova consulta por pagamento ocorre antes de qualquer novo processamento. O código não expõe chaves nem resposta bruta ao navegador. A [documentação de webhooks do Asaas](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint) também recomenda autenticação, resposta 2xx para eventos ignorados e tolerância a entregas duplicadas.

## Integração com n8n e WhatsApp

Depois que um cliente novo e a cobrança da primeira sessão estão prontos, o backend tenta fazer um `POST` para:

```text
https://webhook.studio4x.com.br/webhook/conexao-seres-cadastro-realizado
```

A URL pode ser substituída pela configuração do ambiente. O webhook recebe JSON com:

```json
{
  "eventType": "asaas_customer_created",
  "customerName": "Nome do titular no Asaas",
  "customerEmail": "email-do-titular@dominio.com",
  "whatsapp": "11999999999",
  "asaasCustomerId": "cus_...",
  "externalReference": "cs-paciente-..."
}
```

`customerName`, `customerEmail` e `whatsapp` são os mesmos dados do titular usado no cliente Asaas: paciente quando o adulto não tem responsável; responsável legal/financeiro quando houver responsável ou quando a pessoa atendida for menor. Clientes já existentes ou falhas de cobrança não disparam esse evento. O n8n é independente do webhook fiscal e não espera pagamento nem NFS-e.

### Configuração do n8n — Sites / Cloudflare

```text
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN
```

### Configuração do n8n — cPanel

Configure os mesmos valores por variáveis de ambiente ou no arquivo privado `api/config.php`, usando as chaves `n8n_cadastro_webhook_url` e `n8n_cadastro_webhook_token`. O modelo está em `cpanel-server/api/config.example.php`.

A chamada é best-effort, com timeout curto e sem retries agressivos. URL ou token ausente não impedem o cadastro; falha HTTP, indisponibilidade ou timeout do n8n/Evolution API não transformam em erro um cliente ou cobrança já confirmados. O backend não chama a Evolution API diretamente.

### Webhook n8n de primeira sessão paga

O webhook do Asaas também encaminha, de forma best-effort, a cobrança válida da primeira sessão quando recebe `PAYMENT_CONFIRMED` com status `CONFIRMED` ou `PAYMENT_RECEIVED` com status `RECEIVED`/`RECEIVED_IN_CASH`. O encaminhamento usa os dois eventos possíveis, sempre inclui `paymentId` para deduplicação no n8n e não depende da emissão da NFS-e. O cliente é consultado no Asaas por `GET /v3/customers/{customerId}` e `customer.name` é usado como `customerName`.

O payload também inclui `customerWhatsapp`, obtido da mesma consulta do cliente, priorizando `mobilePhone` e usando `phone` quando o celular estiver vazio. Se ambos não existirem, o campo é enviado como string vazia. Também inclui `invoiceNumber` e `invoiceUrl`, obtidos primeiro do objeto `payment` recebido no evento. Se algum deles estiver ausente, o backend consulta `GET /v3/payments/{paymentId}` e usa os valores retornados pelo Asaas, sem construir ou modificar a URL. Os campos opcionais não impedem o n8n nem o processamento fiscal; a normalização e geração de `wa.me` ficam no n8n.

Configure:

```text
N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_URL
N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_TOKEN
```

O POST envia `Authorization: Bearer <token>` e `Content-Type: application/json`, com timeout curto. A ausência, erro ou timeout do n8n apenas gera log técnico sanitizado e não altera o processamento fiscal.

Exemplo de payload (valores fictícios):

```json
{
  "eventType": "asaas_first_session_paid",
  "asaasEventId": "evt_exemplo_123",
  "asaasEvent": "PAYMENT_CONFIRMED",
  "paymentId": "pay_exemplo_123",
  "asaasCustomerId": "cus_exemplo_123",
  "customerName": "Nome Fictício",
  "customerWhatsapp": "11999999999",
  "invoiceNumber": "00001234",
  "invoiceUrl": "https://www.asaas.com/i/exemplo123",
  "value": 230,
  "billingType": "PIX",
  "status": "CONFIRMED",
  "paymentDate": "2026-09-03",
  "externalReference": "cs-paciente-0123456789abcdef01234567-sessao-1"
}
```

No cPanel, use no `config.php` privado as chaves `n8n_pagamento_webhook_url` e `n8n_pagamento_webhook_token` do modelo em `cpanel-server/api/config.example.php`. O workflow n8n não faz parte deste repositório.

## Arquitetura

O projeto compartilha o frontend entre dois ambientes.

### Frontend

```text
app/page.tsx
app/globals.css
components/cadastro-form.tsx
components/turnstile-widget.tsx
components/layout/AppVersion.tsx
components/ui/
```

A versão cPanel reutiliza a mesma interface através de:

```text
cpanel-src/index.html
cpanel-src/main.tsx
```

### Backend — ChatGPT Sites / Cloudflare

```text
app/api/patients/route.ts
app/api/cep/route.ts
app/api/turnstile/route.ts
app/api/asaas/webhook/route.ts
```

### Backend — cPanel / PHP

```text
cpanel-server/api/patients.php
cpanel-server/api/cep.php
cpanel-server/api/turnstile.php
cpanel-server/api/asaas-webhook.php
cpanel-server/api/deploy-webhook.php
cpanel-server/api/config.example.php
cpanel-server/.htaccess
cpanel-server/api/.htaccess
```

As regras funcionais do cadastro existem em TypeScript e PHP. Mudanças em validação, responsável, payload do Asaas, `company`, `observations`, `externalReference`, grupos, notificações ou disparo do evento n8n devem revisar os dois backends.

## Estrutura principal

```text
.
├── app/
├── components/
│   └── layout/AppVersion.tsx
├── cpanel-src/
├── cpanel-server/
│   └── api/
│       ├── cep.php
│       ├── patients.php
│       ├── turnstile.php
│       ├── deploy-webhook.php
│       └── config.example.php
├── cpanel-dist/
├── scripts/
├── tests/
├── public/
├── AGENTS.md
├── CPANEL.md
├── README.md
├── package.json
├── vite.config.ts
└── vite.cpanel.config.ts
```

## Pré-requisitos

### Desenvolvimento

- Node.js `>= 22.13.0`
- npm
- Bash compatível com os scripts do projeto

### cPanel

- PHP 8.1+
- `curl` e JSON
- `exec` disponível para o webhook de deploy
- Apache com `mod_rewrite`
- HTTPS válido
- Git instalado

## Instalação local

```bash
git clone https://github.com/studio4x/conexao-seres-cadastro-paciente.git
cd conexao-seres-cadastro-paciente
npm ci
npm run dev
```

## Variáveis de ambiente — Sites / Cloudflare

Obrigatórias:

```text
ASAAS_API_KEY
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

Opcionais:

```text
ASAAS_API_URL
ASAAS_WEBHOOK_TOKEN
TURNSTILE_EXPECTED_HOSTNAME
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN
N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_URL
N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_TOKEN
```

Nunca exponha `ASAAS_API_KEY` ou `TURNSTILE_SECRET_KEY` no frontend.

## Configuração privada do cPanel

Modelo:

```text
cpanel-server/api/config.example.php
```

Arquivo real:

```text
cpanel-server/api/config.php
```

ou na distribuição:

```text
cpanel-dist/api/config.php
```

Esses `config.php` reais são ignorados pelo Git e não devem ser commitados.

## Cloudflare Turnstile

A action utilizada é:

```text
cadastro_paciente
```

O domínio de produção deve estar autorizado no Cloudflare:

```text
cadastro.conexaoseres.com.br
```

## Regra obrigatória de versão de build

O rodapé exibe:

```text
Build vX.Y.Z
```

Fonte de verdade:

```text
components/layout/AppVersion.tsx
```

Incremento automático:

```text
scripts/bump-build.mjs
```

Comandos versionados:

```bash
npm run build:dev
npm run build
npm run build:cpanel
```

Cada build local incrementa o patch, por exemplo:

```text
1.0.7 -> 1.0.8
```

Em `CI=true` ou `CI=1`, o bump é ignorado por padrão. Para forçar:

```bash
CONEXAO_SERES_BUMP_IN_CI=1 npm run build:cpanel
```

Qualquer tarefa com alteração de código deve terminar com uma build bem-sucedida executada depois da última alteração. A resposta final do agente deve informar `Build vX.Y.Z`.

## Build para cPanel

```bash
npm run build:cpanel
```

A build gera `cpanel-dist/` e copia os endpoints PHP, inclusive:

```text
cpanel-dist/api/deploy-webhook.php
cpanel-dist/api/asaas-webhook.php
```

Não use `cpanel-dist/` como fonte principal. Modifique `cpanel-server/`, `cpanel-src/` ou o frontend compartilhado e gere novamente.

## Deploy automático do cPanel

A produção não depende mais de SSH externo nem de um GitHub Actions de deploy.

O mecanismo primário é um **webhook HTTPS do GitHub**.

Após cada `push` em `main`, o GitHub chama:

```text
https://cadastro.conexaoseres.com.br/api/deploy-webhook.php
```

O endpoint:

1. aceita apenas `POST`;
2. valida `X-Hub-Signature-256` com HMAC SHA-256;
3. aceita o evento `ping` para teste;
4. para deploy, aceita apenas evento `push`;
5. exige o repositório `studio4x/conexao-seres-cadastro-paciente`;
6. exige `refs/heads/main`;
7. usa lock para impedir deploys concorrentes;
8. executa:

```bash
/usr/bin/git -C /home/conexaoseres/cadastro.conexaoseres.com.br pull --ff-only origin main
```

### Segredo do webhook

Fica somente no servidor:

```text
/home/conexaoseres/.github-deploy-secret
```

O mesmo valor é configurado no campo `Secret` do webhook no GitHub. Nunca deve ser versionado.

### Log do deploy

```text
/home/conexaoseres/github-deploy.log
```

Consulta:

```bash
tail -n 20 /home/conexaoseres/github-deploy.log
```

### Cron de contingência

O cron pode permanecer apenas como fallback, preferencialmente em frequência menor:

```bash
/usr/bin/git -C /home/conexaoseres/cadastro.conexaoseres.com.br pull --ff-only origin main >/dev/null
```

O webhook é o mecanismo primário e normalmente atualiza o cPanel segundos após o push.

## Arquivos gerados pelo servidor

Arquivos chamados `error_log` não fazem parte do projeto e são ignorados pelo Git.

## Scripts

```bash
npm run dev
npm run build:dev
npm run build
npm run build:cpanel
npm test
npm run lint
npm run db:generate
```

## Checklist de entrega

- [ ] Nenhum segredo foi adicionado ao Git.
- [ ] Os dois backends foram revisados quando a regra é compartilhada.
- [ ] A build foi executada depois da última alteração de código.
- [ ] `Build vX.Y.Z` foi confirmado.
- [ ] `cpanel-dist/` foi regenerado quando aplicável.
- [ ] O webhook de produção respondeu com sucesso ao push.
- [ ] O commit publicado no cPanel corresponde a `origin/main`.
- [ ] O formulário e integração com Asaas foram testados quando aplicável.

## Documentação adicional

- [`AGENTS.md`](AGENTS.md): regras obrigatórias para agentes.
- [`CPANEL.md`](CPANEL.md): operação e publicação no cPanel.
