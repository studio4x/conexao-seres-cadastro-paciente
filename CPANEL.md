# Publicação no cPanel

Este projeto gera uma versão estática da página com os endpoints do Asaas e do CEP em PHP, adequada para uma pasta pública comum do cPanel.

## Gerar o pacote

```bash
npm run build:cpanel
```

O conteúdo pronto para publicação será criado na pasta `cpanel-dist/`. Essa pasta também é mantida no repositório para permitir o envio direto ao cPanel sem instalar o Node.js no servidor.

## Configurar e publicar

1. Dentro de `cpanel-dist/api/`, faça uma cópia de `config.example.php` com o nome `config.php`.
2. Abra `config.php` e substitua o texto de exemplo pela chave da API do Asaas.
3. Envie **o conteúdo de `cpanel-dist/`** para a pasta pública configurada para `cadastro.conexaoseres.com.br`.
4. No cPanel, confirme que o domínio usa PHP 8.1 ou superior e que as extensões `curl` e `json` estão habilitadas.
5. Aponte o DNS do subdomínio para a hospedagem e aguarde a propagação.

O arquivo `api/config.php` é ignorado pelo Git e bloqueado para acesso direto pelo Apache. A chave do Asaas permanece somente no servidor.
