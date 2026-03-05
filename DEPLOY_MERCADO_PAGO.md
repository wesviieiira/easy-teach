# Guia de Deploy e Configuração: Easy Teach + Mercado Pago

Este documento é o passo a passo solicitado para quando você decidir colocar o site no ar (em produção) e começar a aceitar pagamentos reais pelo Mercado Pago.

## Passo 1: Obter Credenciais de Produção no Mercado Pago

O sistema foi preparado para rodar tanto em modo *Sandbox* (testes) quanto em *Produção*. Para aceitar pagamentos reais, siga os passos:

1. Acesse o **[Painel de Desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel)** e faça login com a conta que irá receber os pagamentos do curso.
2. Na aba **Aplicações** (Criar Aplicação), crie uma nova aplicação chamando-a de "Easy Teach Checkout".
3. Preencha os detalhes (URL do seu site, se já tiver).
4. Dentro da aplicação criada, vá em **Credenciais de Produção**.
5. Copie o seu **Access Token** de produção (ele geralmente começa com `APP_USR-...`).
   > *Dica de Segurança: Nunca compartilhe esse token. Ele é a chave do seu cofre.*

## Passo 2: Configurar o Backend

No seu servidor de produção, você deverá configurar as Variáveis de Ambiente. Se estiver usando `.env`, altere o arquivo:

```env
# .env na Produção
PORT=3000
NODE_ENV=production
JWT_SECRET=umasenhamuitoseguraecomplexa123!@#
MP_ACCESS_TOKEN=APP_USR-seu-token-real-de-producao
```

**Importante:**
- Altere `JWT_SECRET` para uma string aleatória (isso dificulta ataques aos logins de alunos).
- Ao colocar um token que não começa com `TEST-`, o backend (`server.js`) irá automaticamente se comunicar com os servidores reais do Mercado Pago.

## Passo 3: Configurar as URLs (Webhooks e Callbacks) no server.js

Atualmente, no arquivo `server.js`, os retornos após o pagamento apontam para `http://localhost:3000`. O Mercado Pago precisa enviar o cliente e o status do pagamento para a sua **URL real** na internet.

Abra o `server.js` na linha ~438 e ajuste a rota de pagamento `/api/payment/create`:

```javascript
// ONDE ESTÁ ASSIM:
back_urls: {
  success: `http://localhost:${PORT}/login.html?payment=success`,
  failure: `http://localhost:${PORT}/index.html?payment=failure`,
  pending: `http://localhost:${PORT}/index.html?payment=pending`
},
auto_return: 'approved',
notification_url: `http://localhost:${PORT}/api/payment/webhook`

// MUDE PARA O SEU DOMÍNIO, POR EXEMPLO:
back_urls: {
  success: `https://www.seusite.com.br/login.html?payment=success`,
  failure: `https://www.seusite.com.br/index.html?payment=failure`,
  pending: `https://www.seusite.com.br/index.html?payment=pending`
},
auto_return: 'approved',
notification_url: `https://api.seusite.com.br/api/payment/webhook` // A URL do seu servidor backend
```

## Passo 4: Hospedagem dos Arquivos

O projeto está dividido entre **Frontend** estático e **Backend** Node.js.

### Opção 1: VPS (DigitalOcean, AWS, Linode, Hostinger)
Você pode rodar tudo em um único servidor VPS (Linux Ubuntu).
1. Instale Node.js.
2. Clone o projeto para o servidor.
3. Rode `npm install` na pasta `backend`.
4. Use o **PM2** (`npm install -g pm2`) para manter o Node rodando: `pm2 start server.js --name "easyteach"`.
5. Por padrão, o Express já serve sua pasta `frontend`. Configure o Nginx como Proxy Reverso apontando a porta 80/443 (HTTP/HTTPS) para a porta `3000` do Node.

### Opção 2: Serverless / Cloud Providers (Vercel/Netlify + Render/Railway)
- **Frontend:** Pode ser hospedado de graça na Vercel, Netlify ou Cloudflare Pages (basta arrastar a pasta `frontend`).
- **Backend:** Hospede o `server.js` (pasta `backend`) no Render.com, Railway ou Heroku.
- *Lembre-se*: Se separar frond e back, vá no arquivo `frontend/js/app.js` e altere a variável `API_URL` para o link do seu backend hospedado!

## Passo 5: Vídeos e Hospedagem (YouTube Unlisted)

Como discutido na fase de planejamento:
1. Suba seus vídeos no YouTube e marque-os como **Não Listado** (Unlisted).
2. Na página do vídeo, vá em *Compartilhar -> Incorporar* e pegue a URL de embed (ex: `https://www.youtube.com/embed/XXXXX`).
3. Cadastre essa URL no painel admin ao criar a aula.

Caso decida migrar para VIMEO no futuro, não será necessário refazer o frontend, bastando cadastrar a URL correspondente (ex: `https://player.vimeo.com/video/XXXXX`).

***
🚀 **Pronto!** O seu projeto está planejado desde o dia zero para escalar. Boa sorte nas vendas!
