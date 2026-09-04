# Checklist de testes — Formulário de cadastro de paciente

Use este checklist para testar o formulário nos dois ambientes publicados:

- [ ] Sites / Cloudflare
- [ ] cPanel

Sempre que possível, execute os testes em ambiente de homologação ou Sandbox do Asaas. Não registre chaves, tokens ou dados reais neste arquivo.

## Preparação

- [ ] Abrir uma sessão anônima ou limpar os dados do site antes de cada cenário.
- [ ] Confirmar que o formulário está carregando sem erros visíveis.
- [ ] Confirmar que o Turnstile foi carregado.
- [ ] Usar dados de teste consistentes e anotar o nome/CPF usado em cada cenário.
- [ ] Confirmar que as requisições utilizam as URLs públicas `/api/patients`, `/api/cep` e `/api/turnstile`.
- [ ] No cPanel, confirmar que os arquivos publicados em `cpanel-dist/` correspondem à versão testada.

## Critérios gerais de sucesso

- [ ] O formulário apresenta mensagens amigáveis para erros.
- [ ] O botão impede envios duplicados enquanto o cadastro está sendo processado.
- [ ] O sucesso é exibido somente depois da resposta positiva do backend.
- [OK] Nenhuma chave, token do Turnstile ou resposta técnica do Asaas aparece no navegador.
- [OK] O cadastro não é duplicado quando o mesmo paciente é enviado novamente.
- [OK] O rodapé exibe a versão esperada da build.
- [OK] Formulário não é enviado sem endereço preenchido.

## Critérios específicos da tela de sucesso

Executar após um cadastro válido nos ambientes Sites / Cloudflare e cPanel:

- [ ] Confirmar que a tela de sucesso só aparece depois de uma resposta positiva do backend.
- [ ] Confirmar que o bloco “Conte-nos sobre você” e o texto “Preencha com calma. Mostraremos apenas o que for necessário em cada etapa.” não aparecem na tela de sucesso.
- [ ] Confirmar que o título exibido é exatamente “Cadastro concluído!”.
- [ ] Confirmar a mensagem “Recebemos seus dados com sucesso.”.
- [ ] Confirmar que a mensagem contém o trecho **WhatsApp e no e-mail informados no cadastro**.
- [ ] Confirmar que a mensagem informa que o **Asaas enviará pelo WhatsApp o link para pagamento da primeira sessão**.
- [ ] Confirmar que a mensagem informa a continuidade da **confirmação do agendamento** após a identificação do pagamento.
- [ ] Confirmar que a mensagem informa o envio do **contrato de prestação de serviços para leitura e assinatura** após a primeira sessão, caso haja continuidade do acompanhamento.
- [ ] Confirmar visualmente que os quatro trechos destacados acima aparecem em negrito.
- [ ] Confirmar que o botão “Preencher um novo cadastro” continua visível e funcionando.
- [ ] Clicar em “Preencher um novo cadastro” e confirmar que o formulário volta ao estado inicial, incluindo o bloco “Conte-nos sobre você”.
- [ ] Confirmar que a mensagem de sucesso não exibe novamente o texto antigo “Tudo certo!” nem a mensagem anterior de continuidade genérica.

## 1. Paciente adulto sem responsável

### 1.1 Cadastro básico

- [OK] Informar paciente com idade maior que 18 anos.
- [OK] Marcar/confirmar que não há responsável.
- [OK] Preencher WhatsApp, e-mail e endereço válidos do paciente.
- [OK] Informar complemento do paciente, por exemplo `Apto 12`.
- [OK] Enviar o formulário.

Conferir no Asaas:

- [OK] O paciente é o titular: nome, CPF, telefone, e-mail e endereço correspondem ao paciente.
- [OK] O grupo é `Adultos`.
- [OK] O campo `complement` contém o complemento do paciente.
- [OK] O campo `company` não é preenchido apenas por ser um adulto sem responsável.
- [OK] `observations` não repete os dados principais do próprio paciente.

### 1.2 Limite de idade

- [OK] Testar paciente que completa 18 anos exatamente na data do teste: deve ser tratado como adulto.
- [OK] Testar paciente que completa 18 anos no dia seguinte: deve ser tratado como menor.

## 2. Paciente adulto com responsável financeiro

- [OK] Informar paciente com idade maior que 18 anos.
- [OK] Selecionar responsável financeiro.
- [OK] Preencher dados válidos do paciente e do responsável.
- [OK] Usar datas diferentes para paciente e responsável, no formato exibido pelo campo de data.
- [OK] Informar complemento do responsável, por exemplo `Sala 4, bloco B`.
- [OK] Enviar o formulário.

Conferir no Asaas:

- [OK] O responsável financeiro é o titular do cliente.
- [OK] Nome, CPF, telefone, e-mail e endereço principais correspondem ao responsável financeiro.
- [OK] O campo `company` contém exatamente o nome do paciente.
- [OK] O campo `complement` contém exatamente o complemento do responsável financeiro.
- [OK] O grupo é `Adultos`.
- [OK] `observations` contém o nome e CPF do paciente.
- [OK] `observations` contém contato e endereço do paciente.
- [OK] A data do paciente aparece como `DD/MM/AAAA`.
- [OK] A data do responsável aparece como `DD/MM/AAAA`.
- [OK] As datas não aparecem como `AAAA-MM-DD` nas observações.

## 3. Paciente adulto com responsável legal

- [OK] Repetir o cenário anterior selecionando responsável legal.
- [OK] Usar um responsável legal diferente do responsável financeiro usado no cenário anterior.
- [OK] Informar complemento do responsável legal.
- [OK] Confirmar que o responsável legal é o titular.
- [OK] Confirmar que `company` contém o nome do paciente.
- [OK] Confirmar que `complement` contém o complemento do responsável legal.
- [OK] Confirmar grupo `Adultos` e datas em `DD/MM/AAAA` nas observações.

## 4. Paciente menor de 18 anos com responsável

- [OK] Informar paciente menor de 18 anos.
- [OK] Confirmar que o responsável é obrigatório.
- [OK] Preencher dados válidos do responsável.
- [OK] Informar complemento do responsável.
- [OK] Enviar o formulário.

Conferir no Asaas:

- [OK] O responsável é o titular do cliente.
- [OK] O campo `company` contém o nome do paciente.
- [OK] O campo `complement` contém o complemento do responsável.
- [OK] O grupo é `Crianças`.
- [OK] `observations` contém nome e CPF do paciente.
- [OK] `observations` contém a data do paciente e a data do responsável em `DD/MM/AAAA`.
- [OK] Não são exigidos contato e endereço próprios do menor, pois o formulário não os solicita nesse cenário.

## 5. Complemento e endereço

- [ ] Criar cadastro com complemento do paciente e sem responsável; conferir `complement` do paciente.
- [ ] Criar cadastro com complemento do responsável; conferir `complement` do responsável.
- [ ] Criar cadastro sem complemento; confirmar que os demais campos continuam sendo enviados corretamente.
- [ ] Informar complemento com acentos, pontuação e espaços; confirmar que o texto é preservado e que quebras de linha não são aceitas no payload.
- [ ] Testar complemento no limite permitido pelo formulário.
- [ ] Testar complemento acima do limite; confirmar mensagem de validação e ausência de envio.
- [ ] Marcar “O responsável mora no mesmo endereço” e confirmar que o complemento do paciente é copiado para o responsável.
- [ ] Com o endereço compartilhado marcado, alterar o complemento do paciente e confirmar a atualização do complemento do responsável.
- [ ] Desmarcar o endereço compartilhado, alterar o complemento do responsável e confirmar que o complemento do paciente não é alterado.
- [ ] Alterar o CEP do responsável depois de preencher o endereço; confirmar que o formulário limpa os campos dependentes conforme o comportamento esperado.

## 6. Cliente já existente no Asaas

- [ ] Reenviar um paciente já cadastrado usando o mesmo CPF e nome normalizado.
- [ ] Confirmar que o backend encontra o cliente pelo `externalReference`.
- [ ] Confirmar que nenhum segundo cliente é criado.
- [ ] Confirmar resposta HTTP `409`.
- [ ] Confirmar mensagem amigável informando que já existe cadastro com o CPF e/ou e-mail.
- [ ] Confirmar que o cliente existente não é alterado por um novo envio duplicado.

## 7. Validações de identificação e idade

- [OK] CPF do paciente inválido.
- [OK] CPF do responsável inválido.
- [OK] CPF composto apenas por dígitos repetidos.
- [OK] Data do paciente inválida ou inexistente.
- [OK] Data do paciente futura.
- [OK] Data do responsável futura.
- [OK] Responsável com menos de 18 anos.
- [OK] Adulto sem responsável com dados de contato inválidos.
- [OK] Menor sem responsável.
- [OK] Nome do paciente muito curto.
- [OK] Nome do responsável vazio ou muito curto.

Para cada caso inválido:

- [ ] A mensagem aparece no campo correto.
- [ ] O envio ao backend não ocorre.
- [ ] Nenhum cliente é criado ou atualizado no Asaas.

## 8. Validações de contato e endereço

- [OK] WhatsApp do paciente com DDD válido.
- [OK] WhatsApp do responsável com DDD válido.
- [OK] WhatsApp com DDD inexistente.
- [OK] WhatsApp sem o nono dígito.
- [OK] E-mail válido.
- [OK] E-mail inválido.
- [OK] E-mail com pontos consecutivos.
- [OK] CEP válido do paciente.
- [OK] CEP válido do responsável.
- [OK] CEP inexistente ou não localizado.
- [ ] Endereço incompleto após a consulta do CEP.
- [OK] Número do endereço vazio.
- [OK] Estado com mais ou menos de duas letras.

Conferir que:

- [OK] O CEP válido preenche os campos esperados.
- [OK] O CEP inválido apresenta erro amigável.
- [OK] O usuário pode revisar e editar os dados preenchidos pelo CEP.
- [OK] O backend rejeita dados inválidos mesmo que a validação do frontend seja contornada.

## 9. Consentimento, segurança e abuso

- [OK] Tentar enviar sem marcar o consentimento.
- [OK] Tentar enviar sem token do Turnstile.
- [OK] Tentar enviar com token expirado ou inválido.
- [OK] Testar o honeypot `website` preenchido.
- [OK] Testar payload acima do tamanho máximo permitido.
- [OK] Fazer requisição com método diferente de `POST` diretamente na API.
- [OK] Confirmar os status HTTP esperados para validação, configuração ausente e método não permitido.
- [OK] Confirmar que nenhuma resposta expõe a chave do Asaas, segredo do Turnstile ou detalhes internos.

### 9.1 Autorização para registro e uso de imagens e vídeos

Executar estes cenários nos ambientes Sites / Cloudflare e cPanel:

- [ ] Confirmar que a seção “Sobre o atendimento” exibe “Registro e uso de imagens e vídeos”.
- [ ] Confirmar que existem exatamente as opções “Autorizo” e “Não autorizo”, em seleção única.
- [ ] Confirmar que os radios são navegáveis por teclado, possuem foco visível e têm labels associados.
- [ ] Tentar enviar sem selecionar nenhuma opção; confirmar erro visual no campo e ausência de requisição de cadastro.
- [ ] Selecionar “Autorizo” em um paciente adulto sem responsável e concluir o cadastro.
- [ ] Selecionar “Não autorizo” em um paciente adulto sem responsável e concluir o cadastro.
- [ ] Selecionar “Autorizo” em um paciente menor com responsável e concluir o cadastro.
- [ ] Selecionar “Não autorizo” em um paciente menor com responsável e concluir o cadastro.

Conferir o payload enviado ao backend:

- [ ] “Autorizo” envia exatamente `mediaConsent: "AUTHORIZED"`.
- [ ] “Não autorizo” envia exatamente `mediaConsent: "NOT_AUTHORIZED"`.
- [ ] O texto completo do TCLE não é enviado no payload nem nas observações do Asaas.

### 9.2 Modal do consentimento

- [ ] No desktop, confirmar o link “Saiba mais”.
- [ ] No mobile, confirmar o link “Saiba mais sobre esta autorização”.
- [ ] Abrir o modal e confirmar o título `Autorização para registro e uso de imagens e vídeos`.
- [ ] Confirmar que o modal possui botão “Fechar”, foco acessível e fechamento por `ESC`.
- [ ] Em viewport móvel reduzida, confirmar que o modal não ultrapassa a tela e permite rolagem interna.
- [ ] Com paciente adulto (18 anos ou mais), confirmar o texto integral da autorização adulta.
- [ ] Com paciente menor de 18 anos, confirmar o texto integral destinado ao responsável legal.
- [ ] Alterar a data de nascimento de adulto para menor e reabrir o modal; confirmar que o texto muda para a versão de menor.
- [ ] Alterar a data de nascimento de menor para adulto e reabrir o modal; confirmar que o texto muda para a versão adulta.
- [ ] Após alterar a idade, confirmar que `mediaConsent` continua selecionado e não é apagado.

### 9.3 Validação server-side do consentimento

Enviar requisições controladas diretamente para `/api/patients` em ambos os ambientes:

- [ ] Omitir `mediaConsent`; confirmar rejeição HTTP `400`.
- [ ] Enviar `mediaConsent` como `null`; confirmar rejeição HTTP `400`.
- [ ] Enviar `mediaConsent` como `true`; confirmar rejeição HTTP `400`.
- [ ] Enviar `mediaConsent` como `false`; confirmar rejeição HTTP `400`.
- [ ] Enviar `mediaConsent` como número; confirmar rejeição HTTP `400`.
- [ ] Enviar string arbitrária, por exemplo `"AUTHORIZED_TEXT"`; confirmar rejeição HTTP `400`.
- [ ] Confirmar que somente `AUTHORIZED` e `NOT_AUTHORIZED` são aceitos.
- [ ] Confirmar que TypeScript/Sites e PHP/cPanel aplicam a mesma whitelist e não dependem apenas da validação do frontend.

### 9.4 Observações do Asaas e preservação das regras

Para os quatro cenários — adulto autorizado, adulto não autorizado, menor autorizado e menor não autorizado — conferir:

- [ ] Com `AUTHORIZED`, `observations` contém exatamente uma linha `Autorização de imagens e vídeos: Autorizado`.
- [ ] Com `NOT_AUTHORIZED`, `observations` contém exatamente uma linha `Autorização de imagens e vídeos: Não autorizado`.
- [ ] As observações anteriores continuam preservadas: pessoa atendida, CPF, datas, responsável, contato, endereço, tipo de atendimento, forma de ingresso e modalidade.
- [ ] Adulto sem responsável continua sem duplicar seus próprios dados pessoais nas observações.
- [ ] Menor continua com o responsável como titular e o paciente no campo `company`.
- [ ] A linha de consentimento não contém o texto completo do TCLE.
- [ ] O valor da primeira sessão continua em R$ 230,00.
- [ ] `billingType`, vencimento, `externalReference`, NFS-e, impostos e notificações permanecem inalterados.
- [ ] O payload e o momento do webhook n8n permanecem inalterados e não incluem `mediaConsent`.

## 10. Falhas de integração e recuperação

Em ambiente controlado, simular ou observar os seguintes casos:

- [ ] Asaas indisponível ou com timeout durante a consulta.
- [ ] Asaas retornando erro de autenticação/autorização.
- [ ] Asaas rejeitando a criação por erro de validação.
- [ ] Cliente criado no Asaas, mas configuração de notificações falhando em seguida.
- [ ] Resposta inconclusiva após o envio; consultar o Asaas antes de tentar novamente.
- [ ] Recarregar a página após erro e confirmar que o formulário pode ser reenviado com segurança.

## 11. Notificações do Asaas

Após um cadastro novo ou atualização de cliente existente:

- [OK] Eventos de criação, alteração, vencimento, atraso, confirmação e lembretes mantêm WhatsApp do cliente ativo.
- [OK] `SEND_LINHA_DIGITAVEL` mantém WhatsApp do cliente desativado.
- [OK] E-mail, SMS e ligação para o cliente permanecem desativados conforme a regra.
- [OK] E-mail e SMS para o provedor permanecem desativados conforme a regra.
- [OK] O aviso antes do vencimento usa `scheduleOffset = 5`.
- [OK] O lembrete após o vencimento usa `scheduleOffset = 1`.

## Resultado da rodada

- Ambiente testado: ______________________________
- Data/hora: ____________________________________
- Build exibida: _________________________________
- Responsável pelo teste: ________________________
- Resultado: [ ] Aprovado  [ ] Aprovado com ressalvas  [ ] Reprovado
- Evidências/links: ______________________________
- Falhas encontradas: ____________________________
- Observações: ___________________________________
