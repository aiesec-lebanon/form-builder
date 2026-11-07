-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "aiesec_person_id" BIGINT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "photo_url" TEXT,
    "office_id" BIGINT,
    "office_name" TEXT,
    "position_title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sign_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forms" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "published_revision" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "accepting_responses" BOOLEAN NOT NULL DEFAULT true,
    "response_count" INTEGER NOT NULL DEFAULT 0,
    "last_response_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_collaborators" (
    "form_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_collaborators_pkey" PRIMARY KEY ("form_id","user_id")
);

-- CreateTable
CREATE TABLE "form_invites" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "google_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "access_token_enc" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinations" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets_enc" TEXT,
    "google_connection_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_success_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" UUID,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_aiesec_person_id_key" ON "users"("aiesec_person_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "forms_slug_key" ON "forms"("slug");

-- CreateIndex
CREATE INDEX "forms_owner_id_deleted_at_idx" ON "forms"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "forms_deleted_at_idx" ON "forms"("deleted_at");

-- CreateIndex
CREATE INDEX "form_collaborators_user_id_idx" ON "form_collaborators"("user_id");

-- CreateIndex
CREATE INDEX "form_invites_email_idx" ON "form_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "form_invites_form_id_email_key" ON "form_invites"("form_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_user_id_google_sub_key" ON "google_connections"("user_id", "google_sub");

-- CreateIndex
CREATE INDEX "destinations_form_id_idx" ON "destinations"("form_id");

-- CreateIndex
CREATE INDEX "destinations_google_connection_id_idx" ON "destinations"("google_connection_id");

-- CreateIndex
CREATE INDEX "audit_events_type_created_at_idx" ON "audit_events"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");

-- CreateIndex
CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits"("window_start");

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_collaborators" ADD CONSTRAINT "form_collaborators_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_collaborators" ADD CONSTRAINT "form_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_collaborators" ADD CONSTRAINT "form_collaborators_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_invites" ADD CONSTRAINT "form_invites_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_invites" ADD CONSTRAINT "form_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_google_connection_id_fkey" FOREIGN KEY ("google_connection_id") REFERENCES "google_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written (ADR-005): constraints Prisma cannot express.
-- ---------------------------------------------------------------------------

ALTER TABLE "forms" ADD CONSTRAINT "forms_slug_format" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$');
ALTER TABLE "forms" ADD CONSTRAINT "forms_counts_nonnegative" CHECK ("response_count" >= 0 AND "revision" >= 1);
ALTER TABLE "form_collaborators" ADD CONSTRAINT "form_collaborators_role" CHECK ("role" IN ('editor'));
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_status" CHECK ("status" IN ('active', 'revoked'));
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_type" CHECK ("type" IN ('google_sheets', 'google_drive', 'webhook', 'supabase', 'postgres'));
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_role" CHECK ("role" IN ('primary', 'secondary', 'files'));
-- File storage is always Google Drive, and Drive is only ever file storage.
ALTER TABLE "destinations" ADD CONSTRAINT "destinations_files_are_drive" CHECK (("role" = 'files') = ("type" = 'google_drive'));

-- One primary response destination and at most one file store per form.
CREATE UNIQUE INDEX "destinations_one_primary_per_form" ON "destinations" ("form_id") WHERE "role" = 'primary';
CREATE UNIQUE INDEX "destinations_one_files_per_form" ON "destinations" ("form_id") WHERE "role" = 'files';

-- ---------------------------------------------------------------------------
-- Row Level Security on, no policies: the Supabase Data API (anon and
-- authenticated roles) can read or write nothing. The app connects as the
-- table owner, which RLS does not restrict.
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_collaborators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "destinations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Belt and braces: remove the Data API roles' grants, now and for future
-- tables. Guarded so the migration also runs on plain Postgres.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
