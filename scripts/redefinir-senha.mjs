/**
 * Redefine a senha de um usuário direto no banco e encerra as sessões abertas dele.
 * Para quem esqueceu a senha: o app não envia e-mail. Só funciona para quem tem acesso
 * ao banco (no computador da instalação), que já tem acesso a todos os dados.
 *
 *   Instalação local:  docker compose exec app node scripts/redefinir-senha.mjs voce@exemplo.com
 *   Fora do Docker:    DATABASE_URL=... node scripts/redefinir-senha.mjs voce@exemplo.com
 */
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!email || !url) {
  console.error("Uso: node scripts/redefinir-senha.mjs <email>   (com DATABASE_URL definida)");
  process.exit(1);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /[?&]sslmode=disable(&|$)/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: true } });
await client.connect();
try {
  const { rows } = await client.query('select id from "user" where email = $1', [email]);
  if (rows.length === 0) {
    console.error(`Nenhum usuário com o e-mail ${email}.`);
    process.exit(1);
  }
  // Iterador de linhas: funciona digitando e com a senha vinda de um pipe.
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => {
    process.stdout.write(q);
    const { value } = await lines.next();
    return (value ?? "").trim();
  };
  const password = await ask("Nova senha (mín. 8 caracteres): ");
  const confirm = await ask("Repita a nova senha: ");
  rl.close();
  if (password.length < 8 || password !== confirm) {
    console.error("As senhas não conferem ou têm menos de 8 caracteres. Nada foi alterado.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await client.query("begin");
  const upd = await client.query(
    `update account set password = $1, updated_at = now() where user_id = $2 and provider_id = 'credential'`,
    [hash, rows[0].id]
  );
  if (upd.rowCount === 0) {
    await client.query(
      `insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       values ($1, $2, 'credential', $2, $3, now(), now())`,
      [`credential-${rows[0].id}`, rows[0].id, hash]
    );
  }
  const del = await client.query("delete from session where user_id = $1", [rows[0].id]);
  await client.query("commit");
  console.log(`Senha redefinida. ${del.rowCount} sessão(ões) encerrada(s): entre de novo com a senha nova.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
