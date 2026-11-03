# FinancasPro no seu computador

O jeito mais simples e privado de usar: o app e o banco rodam no seu computador e **só ele abre o app**. Nada vai para a nuvem e ninguém da sua rede (Wi-Fi) consegue acessar.

## Do que você precisa

- **Docker Desktop** ([Windows, Mac ou Linux](https://www.docker.com/products/docker-desktop/)). Instale e deixe aberto.
- O código do FinancasPro: baixe o [**financaspro.zip** da última versão](https://github.com/rotalabsco/financaspro/releases/latest/download/financaspro.zip) e descompacte. Quem usa git pode fazer `git clone https://github.com/rotalabsco/financaspro.git`.

## Instalar e abrir

1. Abra um terminal na pasta do FinancasPro.
   - **Windows:** clique com o botão direito na pasta → "Abrir no Terminal".
   - **Mac:** clique com o botão direito na pasta → "Novo Terminal na Pasta".
2. Rode:

   ```bash
   docker compose up -d --build
   ```

   A primeira vez demora alguns minutos: o comando baixa e monta tudo.
3. Abra <http://localhost:3000/setup> e crie a sua conta. A tela de cadastro só funciona enquanto não existe nenhuma conta.
4. Depois disso, o endereço é sempre <http://localhost:3000>.

Na primeira vez, o FinancasPro cria as tabelas, as categorias e contas padrão e uma chave de login própria. Você não precisa configurar nada.

## Dia a dia

| Para | Comando (na pasta do FinancasPro) |
|---|---|
| Parar | `docker compose stop` |
| Iniciar de novo | `docker compose start` |
| Ver o que está acontecendo | `docker compose logs -f app` |

O FinancasPro volta sozinho quando o Docker Desktop abre. Se o Docker estiver configurado para iniciar com o computador, o app também inicia.

## Backup (faça com frequência)

Os dados ficam num volume do Docker, dentro do seu computador. Para guardar uma cópia num arquivo:

```bash
docker compose exec db pg_dump -U financaspro -Fc -f /tmp/backup.dump financaspro
docker compose cp db:/tmp/backup.dump ./financaspro-backup.dump
```

Guarde o `financaspro-backup.dump` num lugar seguro, como um HD externo ou um pendrive. **Ele contém todos os seus dados financeiros:** não envie para ninguém.

### Restaurar um backup

Substitui **todos** os dados atuais pelos do arquivo:

```bash
docker compose cp ./financaspro-backup.dump db:/tmp/restore.dump
docker compose exec db pg_restore -U financaspro -d financaspro --clean --if-exists /tmp/restore.dump
```

## Atualizar para uma versão nova

Faça um backup antes. Depois:

- **Se baixou o ZIP:** baixe o [financaspro.zip](https://github.com/rotalabsco/financaspro/releases/latest/download/financaspro.zip) de novo, descompacte e substitua os arquivos da pasta. As novidades de cada versão ficam em [Releases](https://github.com/rotalabsco/financaspro/releases).
- **Se usou git:** rode `git pull`.

Em seguida:

```bash
docker compose up -d --build
```

Os seus dados continuam: eles ficam no volume do Docker, não na pasta. As mudanças de banco da versão nova são aplicadas sozinhas.

## Problemas comuns

- **A porta 3000 já está em uso:** crie na pasta do FinancasPro um arquivo chamado `.env` com a linha `FINANCASPRO_PORT=3100` e rode `docker compose up -d` de novo. O endereço passa a ser <http://localhost:3100>.
- **"Invalid origin" ao entrar:** abra o app por `http://localhost:3000` ou `http://127.0.0.1:3000`, não por outro nome.
- **Esqueci a senha:** o app não envia e-mail. Na pasta do FinancasPro, rode o comando abaixo e digite a senha nova duas vezes:

  ```bash
  docker compose exec app node scripts/redefinir-senha.mjs voce@exemplo.com
  ```

## Desinstalar

```bash
docker compose down        # remove o app e mantém os dados
docker compose down -v     # remove o app E APAGA TODOS OS DADOS
```

## E se eu quiser acessar de outros lugares?

Esta instalação só aceita o próprio computador, de propósito. Para usar no celular ou fora de casa, hospede num servidor com HTTPS: veja [INSTALACAO.md](INSTALACAO.md). Os dados passam a ficar no servidor que você escolher, e cuidar dele (atualizações, senha forte, backup) fica com você.
