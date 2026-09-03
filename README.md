# Cadastro de Paciente — Conexão Seres

Formulário web de cadastro de pacientes da **Conexão Seres**, integrado ao **Asaas**, com validação de dados, consulta automática de CEP, proteção por **Cloudflare Turnstile** e regras específicas para pacientes adultos, menores de idade e responsáveis legais ou financeiros.

O projeto mantém uma implementação compatível com **ChatGPT Sites / Cloudflare** e uma versão preparada para publicação em hospedagem tradicional com **cPanel + PHP**.

## Repositório

- [studio4x/conexao-seres-cadastro-paciente](https://github.com/studio4x/conexao-seres-cadastro-paciente)

## Ambiente publicado

- Cadastro: [https://cadastro.conexaoseres.com.br/](https://cadastro.conexaoseres.com.br/)

## Visão geral

O fluxo principal do sistema é:

1. A pessoa informa os dados de quem receberá o atendimento.
2. O sistema calcula a idade a partir da data de nascimento.
3. Para menores de 18 anos, um responsável é obrigatório.
4. Para adultos, é possível cadastrar diretamente o próprio paciente ou adicionar um responsável legal/financeiro.
5. CPF, WhatsApp, e-mail, CEP e endereço são validados antes do envio.
6. O Cloudflare Turnstile valida a requisição antes do backend acessar o Asaas.
7. O backend verifica se aquele paciente já possui cadastro relacionado no Asaas.
8. Quando necessário, um novo cliente é criado e configurado de acordo com as regras de negócio da clínica.

## Principais recursos

- Formulário responsivo em React.
- Validação de CPF brasileiro.
- Validação de WhatsApp com DDD brasileiro.
- Validação de e-mail.
- Cálculo automático de idade.
- Regras condicionais para pacientes menores e maiores de idade.
- Cadastro opcional de responsável legal ou financeiro para adultos.
- Consulta automática de endereço por CEP.
- Opção para copiar o endereço do paciente para o responsável.
- Proteção contra automação e abuso com Cloudflare Turnstile.
- Campo honeypot adicional contra bots.
- Integração com a API do Asaas.
- Prevenção de cadastros duplicados por referência externa determinística.
- Classificação automática dos clientes nos grupos `Adultos` ou `Crianças`.
- Configuração das notificações do cliente por evento, com WhatsApp ativo e os demais canais desativados conforme a regra de negócio.
- Build específica para publicação em cPanel sem necessidade de Node.js no servidor de produção.

## Regras de negócio do cadastro

### Paciente maior de 18 anos sem responsável

O próprio paciente é cadastrado como cliente no Asaas.

São usados como dados principais do cliente:

- nome;
- CPF;
- e-mail;
- WhatsApp;
- CEP;
- endereço.

Como os dados do paciente já são os dados principais do cliente, eles **não são repetidos no campo de observações**.

O cliente recebe o grupo:

```text
Adultos
```

### Paciente maior de 18 anos com responsável

Quando o adulto informa um responsável legal ou financeiro, o **responsável passa a ser o titular do cliente cadastrado no Asaas**.

O campo `company` recebe o nome da pessoa que será atendida.

Os dados da pessoa que receberá o atendimento são preservados no campo de observações, incluindo:

- nome;
- CPF;
- data de nascimento;
- contato;
- endereço.

As datas de nascimento da pessoa atendida e do responsável são registradas nas observações no formato `DD/MM/AAAA`.

O cliente continua pertencendo ao grupo:

```text
Adultos
```

### Paciente menor de 18 anos

Para pacientes menores de idade, o responsável é obrigatório.

No Asaas:

- o **cliente** é criado com os dados do responsável;
- o campo `company` recebe o nome da pessoa que será atendida;
- o campo `observations` recebe os dados de identificação da pessoa atendida;
- as datas de nascimento da pessoa atendida e do responsável são registradas nas observações no formato `DD/MM/AAAA`;
- o cliente recebe o grupo `Crianças`.

Como o formulário não solicita contato e endereço próprios do menor, esses dados não são adicionados às observações nesse cenário.

## Prevenção de duplicidade no Asaas

Antes de criar um novo cliente, o backend gera uma referência externa no formato:

```text
cs-paciente-<hash>
```

O hash é derivado do **CPF da pessoa atendida + nome normalizado da pessoa atendida**.

Essa referência é enviada ao Asaas como `externalReference` e consultada antes da criação de um novo cliente.

Quando um cadastro já existe:

- um novo cliente não é criado;
- o grupo `Adultos` ou `Crianças` é atualizado quando necessário;
- as configurações de notificação são aplicadas novamente.

> A referência identifica a pessoa atendida, e não necessariamente o titular financeiro cadastrado no Asaas.

## Notificações do Asaas

Depois da criação ou identificação do cliente, o sistema consulta as notificações existentes no Asaas e aplica a configuração por evento.

Para o cliente, a configuração é:

- WhatsApp ativo em criação de cobrança, alteração de cobrança, aviso no dia do vencimento, atraso, confirmação de pagamento e lembrete após o vencimento;
- e-mail, SMS e ligação automática desativados nesses eventos;
- linha digitável com e-mail e SMS desativados;
- aviso antes do vencimento configurado para 5 dias antes, com WhatsApp ativo e demais canais desativados;
- lembrete de cobrança vencida configurado para 1 dia após o vencimento, com WhatsApp ativo e demais canais desativados.

Falhas na configuração das notificações são registradas no servidor, mas não desfazem um cliente que já tenha sido criado com sucesso no Asaas.

## Arquitetura

O projeto possui um frontend compartilhado e dois backends equivalentes para ambientes diferentes.

### Frontend compartilhado

Os principais arquivos são:

- `app/page.tsx`: página principal.
- `app/globals.css`: estilos globais.
- `components/cadastro-form.tsx`: formulário, validações e fluxo de envio.
- `components/turnstile-widget.tsx`: integração do frontend com o Cloudflare Turnstile.
- `components/ui/`: componentes reutilizáveis de interface.

A versão cPanel reutiliza o mesmo frontend através de:

- `cpanel-src/index.html`
- `cpanel-src/main.tsx`

`cpanel-src/main.tsx` importa diretamente a página principal e os estilos do projeto, evitando manter uma segunda cópia do formulário.

### Backend para ChatGPT Sites / Cloudflare

Endpoints principais:

- `app/api/patients/route.ts`: validação e integração com o Asaas.
- `app/api/cep/route.ts`: consulta de CEP.
- `app/api/turnstile/route.ts`: entrega da chave pública do Turnstile ao frontend.

Essa implementação usa runtime Edge e variáveis disponibilizadas pelo ambiente Cloudflare.

### Backend para cPanel / PHP

Arquivos-fonte:

- `cpanel-server/api/patients.php`
- `cpanel-server/api/cep.php`
- `cpanel-server/api/turnstile.php`
- `cpanel-server/api/config.example.php`
- `cpanel-server/.htaccess`
- `cpanel-server/api/.htaccess`

O `.htaccess` mantém os endpoints públicos com o mesmo formato utilizado pelo frontend:

```text
/api/patients
/api/cep
/api/turnstile
```

Internamente, no cPanel, essas URLs são encaminhadas para os respectivos arquivos PHP.

### Regra importante de manutenção

As regras de negócio do backend existem em duas implementações:

```text
app/api/patients/route.ts
cpanel-server/api/patients.php
```

Qualquer alteração funcional na integração com o Asaas, validações server-side, responsáveis, observações, grupos, deduplicação ou notificações deve ser analisada nas **duas implementações**, para que o comportamento do ChatGPT Sites e do cPanel permaneça sincronizado.

## Estrutura principal

```text
.
├── app/
│   ├── api/
│   │   ├── cep/route.ts
│   │   ├── patients/route.ts
│   │   └── turnstile/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── cadastro-form.tsx
│   ├── turnstile-widget.tsx
│   └── ui/
├── cpanel-src/
│   ├── index.html
│   └── main.tsx
├── cpanel-server/
│   ├── .htaccess
│   └── api/
│       ├── .htaccess
│       ├── cep.php
│       ├── config.example.php
│       ├── patients.php
│       └── turnstile.php
├── cpanel-dist/
├── scripts/
├── tests/
├── public/
├── CPANEL.md
├── package.json
├── vite.config.ts
└── vite.cpanel.config.ts
```

## Pré-requisitos

### Desenvolvimento

- Node.js `>= 22.13.0`
- npm
- ambiente compatível com os scripts Bash do projeto

Os scripts de build utilizados pelo projeto foram preparados para Linux e dependem de ferramentas como `bash`, `flock` e GNU `timeout`.

### Hospedagem cPanel

- PHP 8.1 ou superior;
- extensão PHP `curl` habilitada;
- suporte a JSON no PHP;
- Apache com `mod_rewrite`;
- HTTPS configurado no domínio;
- acesso de saída HTTPS para Asaas, Cloudflare Turnstile e serviço de CEP.

## Instalação local

Clone o repositório:

```bash
git clone https://github.com/studio4x/conexao-seres-cadastro-paciente.git
cd conexao-seres-cadastro-paciente
```

Instale as dependências:

```bash
npm ci
```

Configure as variáveis necessárias no ambiente local e inicie:

```bash
npm run dev
```

## Variáveis de ambiente — ChatGPT Sites / Cloudflare

### Obrigatórias

```bash
ASAAS_API_KEY=...
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
```

### Opcionais

```bash
ASAAS_API_URL=https://api.asaas.com/v3
TURNSTILE_EXPECTED_HOSTNAME=cadastro.conexaoseres.com.br
```

### Descrição

- `ASAAS_API_KEY`: chave privada utilizada pelo backend para acessar a API do Asaas.
- `ASAAS_API_URL`: URL base da API; por padrão é `https://api.asaas.com/v3`.
- `TURNSTILE_SITE_KEY`: chave pública utilizada para renderizar o widget.
- `TURNSTILE_SECRET_KEY`: chave privada utilizada pelo backend para validar o token.
- `TURNSTILE_EXPECTED_HOSTNAME`: quando definida, exige que o hostname retornado pelo Turnstile seja exatamente o esperado.

Nunca exponha `ASAAS_API_KEY` ou `TURNSTILE_SECRET_KEY` no frontend ou no repositório.

## Configuração — cPanel

A versão PHP pode usar variáveis de ambiente do servidor ou um arquivo privado `config.php`.

O modelo está em:

```text
cpanel-server/api/config.example.php
```

Para publicação manual, copie para:

```text
api/config.php
```

E configure:

```php
return [
    'asaas_api_key' => '...',
    'asaas_api_url' => 'https://api.asaas.com/v3',
    'turnstile_site_key' => '...',
    'turnstile_secret_key' => '...',
    'turnstile_expected_hostname' => 'cadastro.conexaoseres.com.br',
];
```

`config.php` contém segredos e **não deve ser versionado**.

O `.gitignore` já exclui:

```text
cpanel-server/api/config.php
cpanel-dist/api/config.php
```

## Cloudflare Turnstile

O widget usa a ação:

```text
cadastro_paciente
```

O backend somente aceita tokens válidos para essa ação.

No painel do Cloudflare Turnstile, certifique-se de que o domínio publicado esteja autorizado, especialmente:

```text
cadastro.conexaoseres.com.br
```

Quando `TURNSTILE_EXPECTED_HOSTNAME` estiver configurado, o hostname retornado pelo Cloudflare também precisa corresponder ao valor definido.

## Versionamento automático de build

O site exibe no rodapé uma versão no formato:

```text
Build vX.Y.Z
```

A fonte de verdade da versão é:

```text
components/layout/AppVersion.tsx
```

O arquivo exporta `BUILD_VERSION`, utilizado pelo componente `AppVersion` que é renderizado em `app/page.tsx`. Como a versão cPanel reutiliza `app/page.tsx`, o mesmo número aparece nos dois ambientes.

O incremento automático é feito por:

```text
scripts/bump-build.mjs
```

Por padrão, cada build local incrementa o último número (`patch`):

```text
1.0.7 -> 1.0.8
```

Os scripts versionados são:

```bash
npm run build:dev
npm run build
npm run build:cpanel
```

Todos executam o bump antes da compilação.

### Comportamento em CI

Quando `CI=true` ou `CI=1`, o bump é ignorado por padrão. Isso evita que uma pipeline gere uma versão diferente apenas dentro do ambiente efêmero de CI ou que a mesma entrega seja incrementada duas vezes.

Para forçar o bump em CI:

```bash
CONEXAO_SERES_BUMP_IN_CI=1 npm run build
```

Após uma alteração de código, a versão atual em `components/layout/AppVersion.tsx` deve fazer parte do commit junto com a mudança correspondente. Agentes que trabalham neste repositório devem informar explicitamente a build resultante ao concluir a tarefa.

## Scripts disponíveis

### Desenvolvimento

```bash
npm run dev
```

Inicia o ambiente de desenvolvimento com Vite/Vinext.

### Build de desenvolvimento

```bash
npm run build:dev
```

Executa o bump automático da versão e gera uma build validada usando o mesmo pipeline principal.

### Build principal

```bash
npm run build
```

Executa o bump automático da versão e gera/valida a build destinada ao ambiente principal do projeto.

### Build para cPanel

```bash
npm run build:cpanel
```

Gera o frontend estático e reúne os arquivos PHP necessários dentro de:

```text
cpanel-dist/
```

A build faz, entre outras etapas:

1. build do frontend com `vite.cpanel.config.ts`;
2. criação de `cpanel-dist/api/`;
3. cópia dos `.htaccess`;
4. cópia de `cep.php`;
5. cópia de `patients.php`;
6. cópia de `turnstile.php`;
7. cópia de `config.example.php`.

Por isso, **não use `cpanel-dist/` como fonte de verdade para alterações manuais**. Modifique `cpanel-server/`, `cpanel-src/` ou o frontend compartilhado e gere novamente a build.

### Testes

```bash
npm test
```

O script executa a build e os testes definidos em `tests/*.test.mjs`.

### Lint

```bash
npm run lint
```

Executa o ESLint ignorando artefatos de build relevantes.

### Drizzle

```bash
npm run db:generate
```

Gera migrations quando houver alterações no schema do Drizzle. O projeto atual não depende desse banco para o fluxo principal de cadastro no Asaas.

## Publicação no cPanel

Para gerar os arquivos de produção:

```bash
npm run build:cpanel
```

Depois:

1. Acesse `cpanel-dist/`.
2. Crie `api/config.php` com base em `api/config.example.php` ou configure as variáveis de ambiente diretamente no servidor.
3. Preencha as credenciais reais apenas no ambiente de produção.
4. Envie **o conteúdo de `cpanel-dist/`** para a pasta pública do subdomínio.
5. Confirme PHP 8.1+ e extensão `curl`.
6. Confirme que o Turnstile autoriza o domínio publicado.
7. Teste `/api/turnstile`, a busca de CEP e um cadastro completo.
8. Confirme no Asaas se o cliente foi criado com titular, grupo, empresa, observações e notificações esperados.

Consulte também:

- [`CPANEL.md`](CPANEL.md)

## Fluxo das APIs

### `GET /api/turnstile`

Retorna ao frontend apenas a chave pública do Cloudflare Turnstile.

A chave secreta nunca deve ser retornada ao navegador.

### `GET /api/cep?cep=00000000`

Consulta o CEP e devolve os campos usados para preencher o endereço no formulário.

### `POST /api/patients`

Responsável por:

1. limitar o tamanho da requisição;
2. validar o JSON recebido;
3. validar os campos obrigatórios;
4. validar CPF, idade, WhatsApp, e-mail e endereço;
5. validar consentimento e honeypot;
6. validar o token do Turnstile;
7. carregar a credencial do Asaas;
8. gerar o `externalReference`;
9. consultar cliente existente;
10. atualizar grupo/notificações quando já existe;
11. montar o titular correto;
12. criar um cliente quando necessário;
13. configurar notificações.

## Segurança

### Segredos

Nunca faça commit de:

- chave da API do Asaas;
- chave secreta do Turnstile;
- `config.php` de produção;
- arquivos `.env` reais;
- tokens ou credenciais de teste que tenham acesso a dados reais.

### Validação duplicada

A validação existente no navegador melhora a experiência do usuário, mas **não substitui a validação server-side**.

Mudanças em regras críticas devem continuar sendo validadas no backend mesmo que já sejam verificadas no React.

### Proteções existentes

O fluxo atualmente possui:

- validação server-side;
- limite de tamanho da requisição;
- honeypot `website`;
- Cloudflare Turnstile;
- verificação da ação do Turnstile;
- verificação opcional de hostname;
- timeouts nas chamadas externas;
- mensagens de erro genéricas para não expor detalhes internos ou credenciais.

## Checklist após alterações

Antes de publicar uma alteração funcional, confira:

- [ ] O frontend continua validando corretamente os campos.
- [ ] A validação server-side continua equivalente.
- [ ] `app/api/patients/route.ts` e `cpanel-server/api/patients.php` permanecem sincronizados nas regras de negócio.
- [ ] Nenhum segredo foi adicionado ao Git.
- [ ] Uma build versionada (`npm run build:dev` ou `npm run build`) conclui sem erros.
- [ ] `components/layout/AppVersion.tsx` contém a nova versão gerada.
- [ ] O rodapé exibe `Build vX.Y.Z`.
- [ ] `npm run lint` conclui sem erros quando aplicável.
- [ ] `npm test` foi executado quando a mudança afeta comportamento coberto pelos testes.
- [ ] `npm run build:cpanel` foi executado quando a entrega afeta o site do cPanel.
- [ ] `cpanel-dist/` representa a versão que será publicada.
- [ ] O Turnstile funciona no domínio de destino.
- [ ] O cadastro foi testado sem responsável, quando aplicável.
- [ ] O cadastro foi testado com responsável.
- [ ] O fluxo de menor de idade foi testado.
- [ ] O resultado final foi conferido no Asaas.

## Observações para desenvolvimento

- Preserve a estrutura atual sempre que possível.
- O frontend é compartilhado entre os dois ambientes; evite criar versões paralelas desnecessárias.
- Não altere arquivos gerados em `cpanel-dist/` como solução definitiva.
- Ao alterar regras de cadastro, avalie primeiro o impacto sobre pacientes adultos, menores e responsáveis.
- Ao alterar o payload do Asaas, confira tanto a criação de novos clientes quanto o fluxo de clientes já existentes.
- Evite mudar a geração de `externalReference` sem planejar a compatibilidade com cadastros existentes.
- Não remova as proteções do Turnstile apenas para contornar problemas de ambiente; corrija as chaves, hostname ou configuração do servidor.

## Tecnologias principais

- React 19
- Next.js 16
- TypeScript
- Vite
- Vinext
- Cloudflare Workers
- Tailwind CSS
- Zod
- PHP 8.1+
- Cloudflare Turnstile
- API Asaas

## Documentação adicional

- [`AGENTS.md`](AGENTS.md): regras para agentes e automações que modificam o repositório.
- [`CPANEL.md`](CPANEL.md): instruções resumidas de publicação no cPanel.
