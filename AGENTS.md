# Instruções para Agentes

Este arquivo define as regras de trabalho para agentes de IA, automações e assistentes que alterem o repositório **Cadastro de Paciente — Conexão Seres**.

## Repositório oficial

- [studio4x/conexao-seres-cadastro-paciente](https://github.com/studio4x/conexao-seres-cadastro-paciente)
- Branch principal: `main`

## Objetivo do projeto

O projeto mantém o formulário público de cadastro de pacientes da Conexão Seres, integrado ao Asaas e protegido por Cloudflare Turnstile.

Existem dois ambientes de execução que devem permanecer funcionalmente equivalentes:

1. ChatGPT Sites / Cloudflare, com backend TypeScript.
2. cPanel, com frontend estático e backend PHP.

## Regras obrigatórias

- Qualquer alteração em código exige concluir a tarefa com uma nova build local válida.
- O rodapé deve exibir `Build vX.Y.Z` e a versão deve ser atualizada automaticamente a cada build local.
- A fonte de verdade da versão é [`components/layout/AppVersion.tsx`](components/layout/AppVersion.tsx).
- Não altere manualmente a versão para substituir o fluxo automático, salvo manutenção explícita do mecanismo de versionamento.
- A resposta final de qualquer tarefa que altere código deve informar explicitamente o número atual do build gerado.
- Preserve as mudanças existentes do usuário.
- Não recrie o projeto do zero quando a tarefa puder ser resolvida alterando a implementação atual.
- Não faça refatorações amplas, renomeações ou mudanças estruturais fora do escopo sem necessidade explícita.
- Não misture arquivos não relacionados à tarefa.
- Não remova funcionalidades existentes para simplificar uma correção.
- Nunca inclua chaves, tokens, senhas ou outras credenciais no Git.
- Nunca faça commit de `cpanel-server/api/config.php` ou `cpanel-dist/api/config.php`.
- Nunca exponha `ASAAS_API_KEY` ou `TURNSTILE_SECRET_KEY` no frontend.
- A validação no frontend não substitui a validação no backend.
- Mudanças em regras críticas devem ser aplicadas e validadas server-side.
- Antes de concluir uma tarefa, confirme o estado do repositório com `git status`.
- Quando a tarefa envolver alteração no repositório e o usuário não determinar outro fluxo, finalize com commit e push da entrega concluída.
- Para entregas finais do projeto principal, use `main`, salvo instrução explícita para usar branch ou pull request.

## Fonte de verdade por área

### Frontend

A implementação principal do formulário está em:

```text
components/cadastro-form.tsx
```

Outros arquivos importantes:

```text
app/page.tsx
app/globals.css
components/turnstile-widget.tsx
components/ui/
```

A versão cPanel reutiliza esse frontend através de:

```text
cpanel-src/main.tsx
```

Não mantenha uma segunda cópia manual do formulário para cPanel.

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

### Build do cPanel

```text
cpanel-dist/
```

é um artefato gerado para publicação e não deve ser tratado como fonte de verdade.

Para reconstruí-lo:

```bash
npm run build:cpanel
```

## Regra crítica: manter os dois backends sincronizados

A lógica principal de cadastro existe em duas implementações:

```text
app/api/patients/route.ts
cpanel-server/api/patients.php
```

Sempre que uma tarefa alterar qualquer uma destas áreas, revise as duas versões:

- validação de campos;
- cálculo de idade;
- regras de responsável;
- criação do cliente no Asaas;
- escolha do titular;
- `company`;
- `observations`;
- `externalReference`;
- grupos `Adultos` e `Crianças`;
- busca de cliente existente;
- configuração de notificações;
- mensagens e status HTTP;
- Turnstile;
- timeouts e tratamento de falhas.

Não conclua uma alteração funcional modificando apenas um backend quando a mesma regra também for usada pelo outro ambiente.

## Regras de negócio que devem ser preservadas

### 1. Pessoa atendida maior de 18 anos sem responsável

- O próprio paciente é o titular do cliente no Asaas.
- Nome, CPF, contato e endereço do paciente são usados diretamente no cadastro principal.
- Não repetir esses mesmos dados em `observations`.
- Grupo: `Adultos`.

### 2. Pessoa atendida maior de 18 anos com responsável

- O responsável legal ou financeiro passa a ser o titular do cliente no Asaas.
- O nome da pessoa atendida deve ser enviado no campo `company`.
- Os dados da pessoa atendida devem ser preservados em `observations`.
- As observações incluem os dados de contato e endereço da pessoa atendida, pois esses campos existem para adultos.
- As datas de nascimento da pessoa atendida e do responsável são registradas nas observações no formato `DD/MM/AAAA`.
- Grupo: `Adultos`.

### 3. Pessoa atendida menor de 18 anos

- Um responsável é obrigatório.
- O responsável é o titular do cliente no Asaas.
- O nome da pessoa atendida deve ser enviado no campo `company`.
- Os dados de identificação da pessoa atendida devem ser enviados em `observations`.
- As datas de nascimento da pessoa atendida e do responsável devem ser registradas em `observations` no formato `DD/MM/AAAA`.
- Grupo: `Crianças`.
- Não exigir contato ou endereço próprios do menor enquanto o formulário não solicitar esses dados.

## Identificação e deduplicação no Asaas

O sistema não usa apenas o CPF do titular para decidir se o cadastro já existe.

A referência é baseada na pessoa atendida:

```text
externalReference = cs-paciente-<hash>
```

O hash deriva de:

```text
CPF da pessoa atendida + nome normalizado da pessoa atendida
```

Preserve essa regra salvo solicitação explícita para migrar a estratégia de deduplicação.

Alterar a geração do `externalReference` pode fazer cadastros já existentes deixarem de ser encontrados e causar duplicidades no Asaas. Qualquer mudança nessa lógica exige considerar compatibilidade/migração.

## Clientes existentes

Quando o `externalReference` já existe no Asaas:

- não criar outro cliente;
- retornar `409` com uma mensagem amigável informando que já existe cadastro com o CPF e/ou e-mail;
- não atualizar o cliente nem reaplicar notificações por meio de um novo envio duplicado.

Mudanças no fluxo de criação também devem considerar o fluxo de cliente já existente.

## Notificações do Asaas

O comportamento atual configura as notificações do cliente por evento, com WhatsApp ativo nos avisos de cobrança e os demais canais desativados conforme a regra de negócio.

Para o cliente, a configuração deve manter `whatsappEnabledForCustomer = true` em criação, alteração, vencimento, atraso, confirmação e lembretes de cobrança. Para `SEND_LINHA_DIGITAVEL`, o WhatsApp também deve permanecer desativado.

Nos eventos controlados, deve desabilitar para o cliente:

```text
emailEnabledForCustomer = false
smsEnabledForCustomer = false
phoneCallEnabledForCustomer = false
```

O aviso antes do vencimento deve usar `scheduleOffset = 5`, e o lembrete após o vencimento deve usar `scheduleOffset = 1`.

Também são desabilitadas as opções de e-mail/SMS para o provedor presentes no payload atual.

A falha dessa configuração não deve apagar ou invalidar um cliente que já tenha sido criado com sucesso.

## Cloudflare Turnstile

O frontend obtém a chave pública em:

```text
GET /api/turnstile
```

A ação utilizada pelo widget é:

```text
cadastro_paciente
```

Os backends validam essa mesma ação.

Quando configurado, `TURNSTILE_EXPECTED_HOSTNAME` também deve ser conferido.

Não desabilite o Turnstile para resolver erros de produção. Verifique primeiro:

- `TURNSTILE_SITE_KEY`;
- `TURNSTILE_SECRET_KEY`;
- domínio autorizado no Cloudflare;
- `TURNSTILE_EXPECTED_HOSTNAME`;
- action `cadastro_paciente`;
- acesso HTTPS do servidor ao endpoint de verificação do Cloudflare.

## Segurança e segredos

### Variáveis do ambiente Sites / Cloudflare

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
```

### cPanel

O arquivo de exemplo é:

```text
cpanel-server/api/config.example.php
```

O arquivo real é:

```text
cpanel-server/api/config.php
```

ou, após a build:

```text
cpanel-dist/api/config.php
```

Os arquivos `config.php` reais são privados e estão ignorados pelo Git.

Ao criar exemplos, use somente placeholders.

## Validações existentes

Antes de alterar ou remover validações, considere que o projeto atualmente verifica:

- CPF;
- data de nascimento;
- idade mínima do responsável;
- WhatsApp com DDD brasileiro;
- e-mail;
- CEP;
- endereço;
- consentimento;
- honeypot `website`;
- tamanho máximo do request;
- token do Turnstile.

As regras relevantes aparecem no frontend e no backend.

Evite divergência entre mensagens amigáveis do frontend e critérios efetivamente aceitos pelo servidor.

## CEP

O frontend usa:

```text
/api/cep
```

Existem implementações correspondentes para Sites e cPanel.

Ao alterar formato de resposta, tratamento de erro ou provedor de CEP, revise:

```text
components/cadastro-form.tsx
app/api/cep/route.ts
cpanel-server/api/cep.php
```

## Rotas públicas no cPanel

O frontend deve continuar usando URLs limpas:

```text
/api/cep
/api/turnstile
/api/patients
```

O mapeamento para PHP é responsabilidade dos arquivos `.htaccess`.

Não altere o frontend para chamar diretamente `patients.php`, `cep.php` ou `turnstile.php` sem uma necessidade arquitetural explícita.

## Regra obrigatória de versão de build

O projeto possui versão de build visível no rodapé no formato:

```text
Build vX.Y.Z
```

A fonte de verdade é:

```text
components/layout/AppVersion.tsx
```

A constante versionada é:

```ts
export const BUILD_VERSION = "X.Y.Z";
```

O incremento automático é executado por:

```text
scripts/bump-build.mjs
```

### Proibição de encerrar sem build

- **É proibido encerrar uma tarefa que tenha alterado código sem executar uma build bem-sucedida.**
- Alterações apenas documentais não exigem nova build, salvo solicitação específica.
- Se a build falhar, a tarefa não deve ser apresentada como concluída.
- `lint`, testes parciais, análise estática ou inspeção manual não substituem a build.
- A build deve ser executada depois da última alteração de código.
- O agente deve confirmar `BUILD_VERSION` após a build.
- A resposta final deve declarar `Build vX.Y.Z`.
- Toda build local incrementa automaticamente o patch.
- `npm run build:dev`, `npm run build` e `npm run build:cpanel` executam o bump antes da compilação.
- Em `CI=true` ou `CI=1`, o bump é ignorado por padrão.
- Para forçar incremento em CI, use `CONEXAO_SERES_BUMP_IN_CI=1`.
- Não crie outra fonte paralela de versão.
- Não hardcode a versão diretamente em `app/page.tsx`.

Comandos de build versionados:

```bash
npm run build:dev
npm run build
npm run build:cpanel
```

`npm test` chama `npm run build`; em ambiente local ele também provoca incremento de build.

## Build e artefatos do cPanel

```bash
npm run build:cpanel
```

usa `vite.cpanel.config.ts`, gera o frontend estático e copia os arquivos de `cpanel-server/` para `cpanel-dist/`, incluindo `deploy-webhook.php`.

Consequências:

- não edite `cpanel-dist/` como fonte principal;
- alterações de PHP devem começar em `cpanel-server/`;
- alterações de frontend devem começar na fonte compartilhada;
- antes de entregar uma versão para o cPanel, regenere `cpanel-dist/`.

## Deploy automático do cPanel

O mecanismo primário de publicação do cPanel é um **webhook HTTPS do GitHub**, e não SSH externo.

Endpoint público:

```text
https://cadastro.conexaoseres.com.br/api/deploy-webhook.php
```

Fonte versionada:

```text
cpanel-server/api/deploy-webhook.php
```

Artefato publicado:

```text
cpanel-dist/api/deploy-webhook.php
```

Após cada `push` na branch `main`, o GitHub envia um `POST` assinado. O endpoint deve:

- validar `X-Hub-Signature-256` com HMAC SHA-256;
- aceitar `ping` somente para teste;
- aceitar deploy somente em evento `push`;
- exigir `studio4x/conexao-seres-cadastro-paciente`;
- exigir `refs/heads/main`;
- usar lock para evitar deploys simultâneos;
- executar somente:

```bash
/usr/bin/git -C /home/conexaoseres/cadastro.conexaoseres.com.br pull --ff-only origin main
```

Não substitua `pull --ff-only` por `reset --hard` sem autorização explícita.

O segredo do webhook existe apenas no servidor em:

```text
/home/conexaoseres/.github-deploy-secret
```

Nunca leia, imprima, copie para resposta, commit ou log o conteúdo desse arquivo.

Logs do deploy:

```text
/home/conexaoseres/github-deploy.log
```

Lock:

```text
/home/conexaoseres/.github-deploy.lock
```

O cron que executa `git pull` pode existir como fallback em frequência menor, mas o webhook é o mecanismo primário de atualização imediata.

Ao concluir um push destinado à produção, quando houver acesso à evidência do deploy, confirme que o cPanel avançou para o commit de `origin/main`. Não afirme que produção foi atualizada se apenas o push ao GitHub foi confirmado.

## Execução local

Pré-requisito:

```text
Node.js >= 22.13.0
```

Instalação:

```bash
npm ci
```

Desenvolvimento:

```bash
npm run dev
```

## Validação antes de concluir

### Builds principais

```bash
npm run build:dev
npm run build
```

### Lint

```bash
npm run lint
```

### Testes

```bash
npm test
```

### Build cPanel

```bash
npm run build:cpanel
```

Depois da build, confirme que os arquivos esperados existem em `cpanel-dist/`, inclusive `api/deploy-webhook.php`.

## Checklist funcional recomendado

Para mudanças no formulário ou integração com o Asaas, valide quando relevante:

1. Adulto sem responsável.
2. Adulto com responsável.
3. Menor com responsável.
4. CPF inválido.
5. WhatsApp inválido.
6. E-mail inválido.
7. CEP válido e inválido.
8. Responsável menor de 18 anos.
9. Turnstile ausente, expirado ou inválido.
10. Cliente novo no Asaas.
11. Cliente já existente pelo `externalReference`.
12. Grupo `Adultos`/`Crianças`.
13. Campo `company` com o nome da pessoa atendida sempre que houver responsável.
14. Conteúdo de `observations`.
15. Configuração de notificações por WhatsApp.

## Tratamento de erros

- Não retorne respostas brutas do Asaas ao navegador com detalhes internos desnecessários.
- Registre detalhes técnicos no servidor quando úteis.
- Preserve mensagens amigáveis ao usuário.
- Considere que um cliente pode ter sido criado antes de uma etapa secundária falhar; não introduza retries que possam duplicar clientes.

## Dependências e arquitetura

- Evite dependências desnecessárias.
- Preserve React/TypeScript no frontend compartilhado.
- Preserve compatibilidade com Vite/cPanel.
- Não introduza APIs exclusivas do Next.js em componentes reutilizados pelo Vite.

## Arquivos gerados e privados

### Não editar como fonte principal

```text
cpanel-dist/
```

### Não versionar

```text
.env*
cpanel-server/api/config.php
cpanel-dist/api/config.php
node_modules/
.next/
dist/
.wrangler/
.sites-runtime/
error_log
```

## Documentação

Quando uma mudança alterar instalação, ambiente, arquitetura, regra de negócio, Asaas, Turnstile, build ou deploy, atualize também `README.md` e/ou `CPANEL.md`.

## Fechamento da tarefa

Antes de encerrar:

1. Revise o diff.
2. Confirme que nenhum segredo foi adicionado.
3. **Se houve qualquer alteração de código, execute uma build bem-sucedida depois da última modificação. É proibido encerrar a tarefa sem isso.**
4. Confirme o `Build vX.Y.Z`.
5. Execute validações adicionais relevantes.
6. Regenere `cpanel-dist/` quando aplicável.
7. Execute `git status` quando houver acesso local ao repositório.
8. Garanta que somente arquivos intencionais façam parte da entrega.
9. Faça commit com mensagem descritiva.
10. Faça push para o destino definido.
11. Quando aplicável, confirme o deploy via webhook.
12. Informe o que mudou, validações, build e estado de commit/push/deploy.

## Resposta final do agente

Quando houver alteração de código, a resposta final deve informar no mínimo:

- resumo do que foi alterado;
- validações/builds executadas;
- número atual da build, no formato `Build vX.Y.Z`;
- estado do commit/push;
- estado do deploy quando a tarefa envolver publicação no cPanel.
