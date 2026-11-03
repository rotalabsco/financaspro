# Hospedar o FinancasPro

O app é um Next.js comum com PostgreSQL. Roda em qualquer lugar que execute Node.js 22+: VPS, Docker, ou hospedagens com "app Node.js".

## 1. Banco de dados

Qualquer PostgreSQL 15+ serve: um container próprio, um serviço gerenciado (Neon, Supabase, RDS…) ou o Postgres da sua VPS.

- `DATABASE_URL`: string que o app usa. Se o provedor tiver pooler (PgBouncer), use a string com pooler.
- `DIRECT_URL`: string direta, sem pooler, usada pelas migrations e pelo `pg_dump`. Sem pooler, é igual à `DATABASE_URL`.

## 2. Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | conexão do app |
| `DIRECT_URL` | sim | migrations e backup |
| `BETTER_AUTH_SECRET` | sim | assina os cookies de sessão. Gere com `openssl rand -base64 48` (`SESSION_SECRET`, da versão anterior, também é aceito) |
| `BETTER_AUTH_URL` | sim | endereço público do app, sem barra no fim. Sem ele, o login pode falhar com "Invalid origin" atrás de proxy |
| `APP_TIMEZONE` | não | fuso de "hoje" e "mês atual" (padrão `America/Sao_Paulo`) |
| `NEXT_PUBLIC_SOURCE_URL` | não | link "Código-fonte" do menu. Numa versão modificada oferecida a outras pessoas, a AGPL pede que aponte para o código dela |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | não | se definidos, o seed cria o usuário inicial; sem eles, use `/setup` |

## 3. Primeira instalação

```bash
npm ci
npm run build
npm run db:setup       # cria as tabelas; recusa banco que já tem dados
npm run db:seed        # categorias e contas padrão
npm start              # porta 3000 (PORT=xxxx para mudar)
```

Em seguida abra `/setup` e crie o primeiro usuário. A tela só funciona enquanto não há nenhum: faça isso logo depois do primeiro deploy (ou use `SEED_ADMIN_*`). Os outros membros da família são criados depois, com o mesmo acesso: é uma instalação por pessoa ou família.

O `npm run build` usa webpack (`next build --webpack`): o Turbopack, padrão do Next 16, falha em hospedagens compartilhadas como a Hostinger.

Rode com `NODE_ENV=production` (o `npm start` já define). Coloque o app atrás de HTTPS: o cookie de sessão é `secure` em produção e o navegador o descarta em HTTP.

## 4. Atualizar

```bash
git pull
npm ci
npm run build
npm run db:deploy      # aplica migrations novas (o build não aplica sozinho)
```

**Vindo da versão com Prisma** (banco criado antes do Drizzle): rode uma vez, antes do primeiro `db:deploy`:

```bash
npm run db:baseline    # registra que as tabelas atuais são o ponto de partida; não altera dados
```

A tabela `_prisma_migrations` pode ficar no banco: o app não a usa. Nunca rode `drizzle-kit push` contra produção — só `db:deploy`.

Antes de aplicar migrations, faça um backup (seção 5). Migrations deste projeto são aditivas: não apagam nem renomeiam colunas com dados.

Quando uma versão traz migration, aplique-a **antes** de subir o código novo: o código antigo convive com as colunas novas, mas o novo pode depender delas.

## 5. Backup

```bash
pg_dump --format=custom --no-owner "$DIRECT_URL" > financaspro-$(date +%F).dump
```

Para restaurar num banco vazio:

```bash
pg_restore --no-owner --dbname "$DIRECT_URL" financaspro-AAAA-MM-DD.dump
```

Agende o `pg_dump` (cron, systemd timer, GitHub Actions) e guarde as cópias fora do servidor.

## 6. Conferir

`GET /api/health/db` responde se o app consegue falar com o banco. Toda a API exige sessão, exceto `/api/auth/*` e `/api/health/*`.
