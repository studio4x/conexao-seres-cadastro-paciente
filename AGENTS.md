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
- Os dados da pessoa atendida devem ser preservados em `observations`.
- As observações incluem os dados de contato e endereço da pessoa atendida, pois esses campos existem para adultos.
- A data de nascimento do responsável também é registrada nas observações.
- Grupo: `Adultos`.

### 3. Pessoa atendida menor de 18 anos

- Um responsável é obrigatório.
- O responsável é o titular do cliente no Asaas.
- O nome da pessoa atendida deve ser enviado no campo `company`.
- Os dados de identificação da pessoa atendida devem ser enviados em `observations`.
- A data de nascimento do responsável também deve ser registrada em `observations`.
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
- preservar o retorno de sucesso do formulário;
- atualizar o grupo `Adultos` ou `Crianças` quando aplicável;
- tentar reaplicar a configuração de notificações.

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

Regras obrigatórias:

### Proibição de encerrar sem build

- **É proibido encerrar uma tarefa que tenha alterado código sem executar uma build bem-sucedida.**
- Alterações apenas documentais (`README.md`, `AGENTS.md`, `CPANEL.md` e outros arquivos sem efeito no código executável) não exigem nova build, salvo se a própria tarefa pedir validação por build.
- Se a build falhar, a tarefa **não deve ser apresentada como concluída**. O agente deve corrigir a falha quando ela estiver dentro do escopo ou informar claramente que a entrega ficou bloqueada pela build.
- Não é permitido substituir a build por apenas `lint`, testes parciais, análise estática ou inspeção manual. Essas verificações podem complementar a build, mas não a substituem.
- A build deve ser executada **depois da última alteração de código**. Uma build feita antes de modificações posteriores não satisfaz esta regra.
- O agente deve confirmar o valor final de `BUILD_VERSION` em `components/layout/AppVersion.tsx` após a build.
- A resposta final deve declarar explicitamente a build resultante no formato `Build vX.Y.Z`.

- toda build local incrementa automaticamente o último número da versão (`patch`);
- exemplo: `1.0.7` passa para `1.0.8`;
- `npm run build:dev`, `npm run build` e `npm run build:cpanel` executam o bump antes da compilação;
- em ambiente de CI, quando `CI=true` ou `CI=1`, o bump é ignorado por padrão para evitar incremento duplo ou alterações efêmeras que não existem no Git;
- para forçar o incremento em CI, use `CONEXAO_SERES_BUMP_IN_CI=1`;
- não crie outra fonte paralela de versão;
- não hardcode a versão diretamente em `app/page.tsx`;
- alterações no componente ou script de versionamento devem preservar a compatibilidade tanto com a build Sites/Vinext quanto com a build Vite do cPanel;
- ao concluir qualquer tarefa com mudança de código, execute uma build apropriada e informe na resposta final o `Build vX.Y.Z` resultante.

Comandos de build versionados:

```bash
npm run build:dev
npm run build
npm run build:cpanel
```

`npm test` chama `npm run build`; portanto, em ambiente local ele também provoca um incremento de build. Isso é esperado porque houve uma compilação local.

## Build e artefatos do cPanel

O script:

```bash
npm run build:cpanel
```

usa `vite.cpanel.config.ts`, gera o frontend estático e copia os arquivos de `cpanel-server/` para `cpanel-dist/`.

Consequências:

- alterações diretas em `cpanel-dist/` podem ser sobrescritas;
- alterações de PHP devem ser feitas primeiro em `cpanel-server/`;
- alterações de frontend devem ser feitas na fonte compartilhada;
- antes de entregar arquivos para publicação no cPanel, regenere `cpanel-dist/`.

Como `cpanel-dist/` é mantido no repositório para permitir publicação direta, uma tarefa que altere a versão destinada ao cPanel deve incluir a build regenerada quando aplicável.

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

Escolha as verificações compatíveis com a alteração feita, mas não entregue código sem validar o caminho afetado.

### Builds principais

```bash
npm run build:dev
npm run build
```

Ambos executam o bump automático antes da compilação. Use o comando compatível com o fluxo da tarefa e confirme a versão resultante em `components/layout/AppVersion.tsx`.

### Lint

```bash
npm run lint
```

### Testes

```bash
npm test
```

### Build cPanel

Quando a alteração afetar a versão publicada no cPanel:

```bash
npm run build:cpanel
```

Depois da build, confirme que os arquivos esperados existem em `cpanel-dist/`.

## Checklist funcional recomendado

Para mudanças no formulário ou integração com o Asaas, valide sempre que relevante:

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
13. Campo `company` para menor.
14. Conteúdo de `observations`.
15. Configuração de notificações por WhatsApp.

Quando houver acesso somente ao código e não ao ambiente externo, deixe explícito quais verificações de integração não puderam ser executadas.

## Tratamento de erros

- Não retorne ao navegador respostas brutas da API do Asaas contendo detalhes internos desnecessários.
- Registre detalhes técnicos no servidor quando forem úteis para diagnóstico.
- Preserve mensagens amigáveis para o usuário.
- Diferencie erros de validação, configuração, autenticação externa, timeout e indisponibilidade quando isso puder ser feito sem expor segredos.
- Considere que um cliente pode ter sido criado no Asaas antes de uma etapa secundária falhar; não introduza retries que possam criar duplicidades.

## Mudanças no payload do Asaas

Antes de modificar o payload, revise o efeito sobre:

- titular do cliente;
- CPF/CNPJ;
- e-mail;
- telefone;
- endereço;
- `company`;
- `observations`;
- `externalReference`;
- `groupName`;
- `notificationDisabled`.

Não presuma que uma propriedade aceita em criação tenha exatamente o mesmo comportamento em atualização. Quando uma alteração depender do comportamento atual da API do Asaas, consulte a documentação oficial antes de implementá-la.

## Dependências e arquitetura

- Evite adicionar dependências para tarefas simples que podem ser resolvidas com a stack existente.
- Preserve React/TypeScript no frontend compartilhado.
- Preserve a compatibilidade do frontend com a build Vite usada pelo cPanel.
- Não introduza APIs exclusivas do runtime Next.js em componentes que também são importados pela build cPanel.
- Código específico de servidor deve permanecer separado dos componentes reutilizados pelo Vite.

## Arquivos gerados e arquivos privados

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
```

Consulte `.gitignore` antes de adicionar novos arquivos temporários ou sensíveis.

## Documentação

Quando uma mudança alterar:

- processo de instalação;
- variáveis de ambiente;
- estrutura de diretórios;
- regras de negócio;
- integração com Asaas;
- Turnstile;
- processo de build;
- processo de deploy;

atualize também `README.md` e/ou `CPANEL.md` quando necessário.

## Fechamento da tarefa

Antes de encerrar:

1. Revise o diff.
2. Confirme que nenhum segredo foi adicionado.
3. **Se houve qualquer alteração de código, execute uma build bem-sucedida depois da última modificação. É proibido encerrar a tarefa sem isso.**
4. Confirme o `Build vX.Y.Z` resultante em `components/layout/AppVersion.tsx`.
5. Execute as demais validações relevantes, como lint e testes.
6. Regenere `cpanel-dist/` quando aplicável.
7. Execute `git status`.
8. Garanta que somente arquivos intencionais façam parte da entrega.
9. Faça commit com mensagem descritiva.
10. Faça push para o destino definido para a tarefa.
11. Informe de forma objetiva o que foi alterado, quais verificações foram executadas e o número da build gerada.


## Resposta final do agente

Quando houver alteração de código, a resposta final deve informar no mínimo:

- resumo do que foi alterado;
- validações/builds executadas;
- número atual da build, no formato `Build vX.Y.Z`;
- estado do commit/push quando a tarefa incluir escrita no repositório.
