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
- [ ] Nenhuma chave, token do Turnstile ou resposta técnica do Asaas aparece no navegador.
- [ ] O cadastro não é duplicado quando o mesmo paciente é enviado novamente.
- [OK] O rodapé exibe a versão esperada da build.
- [OK] Formulário não é enviado sem endereço preenchido.

## 1. Paciente adulto sem responsável

### 1.1 Cadastro básico

- [OK] Informar paciente com idade maior que 18 anos.
- [OK] Marcar/confirmar que não há responsável.
- [] Preencher WhatsApp, e-mail e endereço válidos do paciente.
- [ ] Informar complemento do paciente, por exemplo `Apto 12`.
- [ ] Enviar o formulário.

Conferir no Asaas:

- [ ] O paciente é o titular: nome, CPF, telefone, e-mail e endereço correspondem ao paciente.
- [ ] O grupo é `Adultos`.
- [ ] O campo `complement` contém o complemento do paciente.
- [ ] O campo `company` não é preenchido apenas por ser um adulto sem responsável.
- [ ] `observations` não repete os dados principais do próprio paciente.

### 1.2 Limite de idade

- [ ] Testar paciente que completa 18 anos exatamente na data do teste: deve ser tratado como adulto.
- [ ] Testar paciente que completa 18 anos no dia seguinte: deve ser tratado como menor.

## 2. Paciente adulto com responsável financeiro

- [ ] Informar paciente com idade maior que 18 anos.
- [ ] Selecionar responsável financeiro.
- [ ] Preencher dados válidos do paciente e do responsável.
- [ ] Usar datas diferentes para paciente e responsável, no formato exibido pelo campo de data.
- [ ] Informar complemento do responsável, por exemplo `Sala 4, bloco B`.
- [ ] Enviar o formulário.

Conferir no Asaas:

- [ ] O responsável financeiro é o titular do cliente.
- [ ] Nome, CPF, telefone, e-mail e endereço principais correspondem ao responsável financeiro.
- [ ] O campo `company` contém exatamente o nome do paciente.
- [ ] O campo `complement` contém exatamente o complemento do responsável financeiro.
- [ ] O grupo é `Adultos`.
- [ ] `observations` contém o nome e CPF do paciente.
- [ ] `observations` contém contato e endereço do paciente.
- [ ] A data do paciente aparece como `DD/MM/AAAA`.
- [ ] A data do responsável aparece como `DD/MM/AAAA`.
- [ ] As datas não aparecem como `AAAA-MM-DD` nas observações.

## 3. Paciente adulto com responsável legal

- [ ] Repetir o cenário anterior selecionando responsável legal.
- [ ] Usar um responsável legal diferente do responsável financeiro usado no cenário anterior.
- [ ] Informar complemento do responsável legal.
- [ ] Confirmar que o responsável legal é o titular.
- [ ] Confirmar que `company` contém o nome do paciente.
- [ ] Confirmar que `complement` contém o complemento do responsável legal.
- [ ] Confirmar grupo `Adultos` e datas em `DD/MM/AAAA` nas observações.

## 4. Paciente menor de 18 anos com responsável

- [ ] Informar paciente menor de 18 anos.
- [ ] Confirmar que o responsável é obrigatório.
- [ ] Preencher dados válidos do responsável.
- [ ] Informar complemento do responsável.
- [ ] Enviar o formulário.

Conferir no Asaas:

- [ ] O responsável é o titular do cliente.
- [ ] O campo `company` contém o nome do paciente.
- [ ] O campo `complement` contém o complemento do responsável.
- [ ] O grupo é `Crianças`.
- [ ] `observations` contém nome e CPF do paciente.
- [ ] `observations` contém a data do paciente e a data do responsável em `DD/MM/AAAA`.
- [ ] Não são exigidos contato e endereço próprios do menor, pois o formulário não os solicita nesse cenário.

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

- [ ] CPF do paciente inválido.
- [ ] CPF do responsável inválido.
- [ ] CPF composto apenas por dígitos repetidos.
- [ ] Data do paciente inválida ou inexistente.
- [ ] Data do paciente futura.
- [ ] Data do responsável futura.
- [ ] Responsável com menos de 18 anos.
- [ ] Adulto sem responsável com dados de contato inválidos.
- [ ] Menor sem responsável.
- [ ] Nome do paciente muito curto.
- [ ] Nome do responsável vazio ou muito curto.

Para cada caso inválido:

- [ ] A mensagem aparece no campo correto.
- [ ] O envio ao backend não ocorre.
- [ ] Nenhum cliente é criado ou atualizado no Asaas.

## 8. Validações de contato e endereço

- [ ] WhatsApp do paciente com DDD válido.
- [ ] WhatsApp do responsável com DDD válido.
- [ ] WhatsApp com DDD inexistente.
- [ ] WhatsApp sem o nono dígito.
- [ ] E-mail válido.
- [ ] E-mail inválido.
- [ ] E-mail com pontos consecutivos.
- [ ] CEP válido do paciente.
- [ ] CEP válido do responsável.
- [ ] CEP inexistente ou não localizado.
- [ ] Endereço incompleto após a consulta do CEP.
- [ ] Número do endereço vazio.
- [ ] Estado com mais ou menos de duas letras.

Conferir que:

- [ ] O CEP válido preenche os campos esperados.
- [ ] O CEP inválido apresenta erro amigável.
- [ ] O usuário pode revisar e editar os dados preenchidos pelo CEP.
- [ ] O backend rejeita dados inválidos mesmo que a validação do frontend seja contornada.

## 9. Consentimento, segurança e abuso

- [ ] Tentar enviar sem marcar o consentimento.
- [ ] Tentar enviar sem token do Turnstile.
- [ ] Tentar enviar com token expirado ou inválido.
- [ ] Testar o honeypot `website` preenchido.
- [ ] Testar payload acima do tamanho máximo permitido.
- [ ] Fazer requisição com método diferente de `POST` diretamente na API.
- [ ] Confirmar os status HTTP esperados para validação, configuração ausente e método não permitido.
- [ ] Confirmar que nenhuma resposta expõe a chave do Asaas, segredo do Turnstile ou detalhes internos.

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

- [ ] Eventos de criação, alteração, vencimento, atraso, confirmação e lembretes mantêm WhatsApp do cliente ativo.
- [ ] `SEND_LINHA_DIGITAVEL` mantém WhatsApp do cliente desativado.
- [ ] E-mail, SMS e ligação para o cliente permanecem desativados conforme a regra.
- [ ] E-mail e SMS para o provedor permanecem desativados conforme a regra.
- [ ] O aviso antes do vencimento usa `scheduleOffset = 5`.
- [ ] O lembrete após o vencimento usa `scheduleOffset = 1`.

## Resultado da rodada

- Ambiente testado: ______________________________
- Data/hora: ____________________________________
- Build exibida: _________________________________
- Responsável pelo teste: ________________________
- Resultado: [ ] Aprovado  [ ] Aprovado com ressalvas  [ ] Reprovado
- Evidências/links: ______________________________
- Falhas encontradas: ____________________________
- Observações: ___________________________________
