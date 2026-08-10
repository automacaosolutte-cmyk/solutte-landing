# Solutte Automations Landing Page

Landing page institucional da Solutte Automations, construída com React e Vite.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Publicação

Cada push na branch `main` dispara a publicação no GitHub Pages.

## API e dados reais

O GitHub Pages hospeda apenas a interface. Os usuários, permissões, agentes,
tokens e logs são mantidos pela API em `server/`, que usa SQLite persistente.

1. Copie `server/.env.example` para `server/.env` e defina um `JWT_SECRET`
   aleatório, longo e privado.
2. No diretório `server`, execute `npm install` e `npm start`.
3. Hospede a pasta `server` em um serviço com volume persistente (por exemplo,
   Render, Fly.io ou Railway). O volume deve conter `server/data/solutte.db`.
4. Defina `VITE_API_URL` com a URL HTTPS da API durante o build da landing.
   Inclua a URL da landing em `CORS_ORIGINS` da API.

O primeiro cadastro criado no banco recebe papel `admin` e acesso ativo. Os
demais começam sem permissão administrativa e aguardam pagamento/liberação.
Somente uma administradora pode promover outro usuário a administradora.
