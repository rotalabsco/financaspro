# FinancasPro

Controle financeiro pessoal e familiar com ciclo **Previsto × Realizado**. Substitui a planilha: prevê o mês seguinte (recorrentes e parcelas), registra o que foi pago e fecha o mês com o saldo do banco.

**Seus dados ficam com você.** O FinancasPro roda no seu próprio computador, com banco local: nada vai para a nuvem e ninguém de fora tem acesso. Quem quiser acessar online pode hospedar num servidor próprio. Uma instalação atende uma pessoa ou uma família, e todos os usuários de uma instalação veem os mesmos dados.

## O que faz

- **Mês a mês:** lançamentos previstos e realizados, conciliação (pagamento) e fechamento com saldo bancário.
- **Recorrentes e parcelas:** séries que se repetem sozinhas nos meses seguintes, com contador de parcelas (inclusive financiamentos longos) e antecipação.
- **Receitas** separadas das despesas, com saldo projetado do mês.
- **Cartões de crédito:** projeção da fatura por cartão, parcelas que terminam e o orçamento que isso libera mês a mês.
- **Contas bancárias e cofres** (reservas com depósito mensal).
- **Investimentos e IRPF:** posição e preço médio para a declaração.
- **Resumo anual** por categoria e média histórica.
- **Importação** de histórico por CSV.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Recharts · Drizzle ORM · PostgreSQL · Better Auth.

## Como usar

### No seu computador (recomendado)

Precisa só do [Docker Desktop](https://www.docker.com/products/docker-desktop/). Baixe o [financaspro.zip](https://github.com/rotalabsco/financaspro/releases/latest/download/financaspro.zip) (ou clone o repositório) e, na pasta do FinancasPro:

```bash
docker compose up -d --build
```

Depois abra <http://localhost:3000/setup> e crie a sua conta. O app só aceita conexões do próprio computador e o banco não fica exposto. Backup, atualização e problemas comuns: [docs/LOCAL.md](docs/LOCAL.md).

### Num servidor (acesso online)

Para usar no celular ou fora de casa: qualquer servidor com Node.js 22+ e PostgreSQL, atrás de HTTPS. Veja [docs/INSTALACAO.md](docs/INSTALACAO.md).

## Desenvolvimento

Requisitos: Node.js 22+ e Docker (para o Postgres de desenvolvimento).

```bash
npm install
cp .env.example .env
npm run db:local:up   # Postgres em Docker, porta 5434
npm run db:setup      # cria as tabelas (só em banco vazio)
npm run db:seed       # categorias e contas padrão
npm run dev
```

Acesse <http://localhost:3000/setup> e crie o primeiro usuário (a tela só funciona enquanto não existe nenhum). Depois, entre por `/login`.

O `predev` recusa qualquer banco que não seja local, para o dev nunca escrever no banco de produção.

## Testes

```bash
npm test              # vitest
npx tsc --noEmit      # tipos
```

## Estrutura

```
src/
├── app/
│   ├── (auth)/login/     # login
│   ├── (dashboard)/      # telas protegidas
│   └── api/              # rotas da API
├── components/
└── lib/                  # regras de negócio (séries, meses, datas, valores)
src/db/                   # schema, relações, enums e seed (Drizzle)
drizzle/                  # migrations
```

## Licença

[AGPL-3.0-or-later](LICENSE). Você pode usar, modificar e hospedar à vontade. Se oferecer uma versão **modificada** para outras pessoas usarem pela rede, a licença pede que o código dessa versão fique disponível para elas, sob a mesma licença.
