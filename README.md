# FinancasPro

Controle financeiro pessoal e familiar com ciclo **Previsto × Realizado**. Substitui a planilha: prevê o mês seguinte (recorrentes e parcelas), registra o que foi pago e fecha o mês com o saldo do banco.

Feito para ser **hospedado por você**: uma instalação atende uma pessoa ou uma família, e todos os usuários de uma instalação veem os mesmos dados.

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

## Rodar localmente

Requisitos: Node.js 22+, Docker (para o Postgres de desenvolvimento).

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

## Hospedar

Veja [docs/INSTALACAO.md](docs/INSTALACAO.md).

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
