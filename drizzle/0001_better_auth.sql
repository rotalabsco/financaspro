CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_user" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_user" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");--> statement-breakpoint
-- Usuários da tabela antiga `users` (iron-session) passam para o Better Auth. A senha é o
-- mesmo hash bcrypt (o app verifica com bcrypt). `users` fica no banco, sem uso.
-- created_at/updated_at antigos são timestamp sem fuso gravados em UTC.
-- Para alto se dois e-mails antigos só diferem em maiúsculas/espaços: um usuário sumiria
-- em silêncio. A transação do migrate desfaz tudo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" GROUP BY lower(trim("email")) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'users tem e-mails duplicados (ignorando maiúsculas e espaços); resolva antes de migrar';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO "user" ("id", "name", "email", "email_verified", "created_at", "updated_at")
SELECT u."id", COALESCE(NULLIF(trim(u."name"), ''), lower(trim(u."email"))), lower(trim(u."email")), true,
       u."created_at" AT TIME ZONE 'UTC', u."updated_at" AT TIME ZONE 'UTC'
FROM "users" u;--> statement-breakpoint
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT 'credential-' || u."id", u."id", 'credential', u."id", u."password_hash",
       u."created_at" AT TIME ZONE 'UTC', u."updated_at" AT TIME ZONE 'UTC'
FROM "users" u
JOIN "user" nu ON nu."id" = u."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "account" a WHERE a."user_id" = u."id" AND a."provider_id" = 'credential'
);
