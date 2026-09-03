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
11. Envia o evento ao n8n depois de confirmar o cliente novo e a cobrança.
12. A emissão fiscal posterior permanece sob responsabilidade do Asaas e das configurações fiscais operacionais da conta.

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
- Sexo do paciente obrigatório e explícito (`female` ou `male`) para a descrição da cobrança.
- Cobrança avulsa de R$ 230,00 para a primeira sessão, com vencimento no próximo dia útil.
- Deduplicação por referência externa determinística.
- Grupos `Adultos` e `Crianças`.
- Configuração de notificações do Asaas por evento.
- Notificação best-effort ao n8n somente após cliente e cobrança novos confirmados.
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

## Limitação da automação fiscal para cobrança avulsa

A documentação pública atual do Asaas documenta `ON_PAYMENT_CONFIRMATION` e `invoiceSettings` apenas para assinaturas, no endpoint `POST /v3/subscriptions/{id}/invoiceSettings`. Não há endpoint público documentado equivalente para configurar uma cobrança avulsa criada por `POST /v3/payments` para emitir NFS-e quando paga.

Por isso, este projeto não recebe `PAYMENT_CONFIRMED` para decidir a emissão e não executa `POST /v3/invoices` após o pagamento. A API documentada para `POST /v3/invoices` cria ou agenda uma NFS-e vinculada a `payment`, mas essa alternativa deixa a decisão fiscal no backend e não corresponde à regra desta operação.

As alternativas oficiais documentadas são: usar a configuração de emissão automática da própria assinatura, quando o modelo de negócio puder ser uma assinatura; ou usar `POST /v3/invoices` para o agendamento explícito de uma NFS-e vinculada à cobrança. A configuração fiscal da conta e qualquer opção operacional disponível no painel do Asaas devem ser confirmadas fora deste repositório. O código não afirma que a emissão automática de uma cobrança avulsa foi configurada.

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
  "whatsapp": "11999999999",
  "asaasCustomerId": "cus_...",
  "externalReference": "cs-paciente-..."
}
```

`customerName` e `whatsapp` são os mesmos dados do titular usado no cliente Asaas: paciente quando o adulto não tem responsável; responsável legal/financeiro quando houver responsável ou quando a pessoa atendida for menor. Clientes já existentes ou falhas de cobrança não disparam esse evento. O n8n não espera o pagamento. A configuração fiscal automática, quando exigida pela operação, precisa estar confirmada externamente no Asaas antes de habilitar esse fluxo.

### Configuração do n8n — Sites / Cloudflare

```text
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN
```

### Configuração do n8n — cPanel

Configure os mesmos valores por variáveis de ambiente ou no arquivo privado `api/config.php`, usando as chaves `n8n_cadastro_webhook_url` e `n8n_cadastro_webhook_token`. O modelo está em `cpanel-server/api/config.example.php`.

A chamada é best-effort, com timeout curto e sem retries agressivos. URL ou token ausente não impedem o cadastro; falha HTTP, indisponibilidade ou timeout do n8n/Evolution API não transformam em erro um cliente ou cobrança já confirmados. O backend não chama a Evolution API diretamente.

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
```

### Backend — cPanel / PHP

```text
cpanel-server/api/patients.php
cpanel-server/api/cep.php
cpanel-server/api/turnstile.php
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
TURNSTILE_EXPECTED_HOSTNAME
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL
N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN
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
