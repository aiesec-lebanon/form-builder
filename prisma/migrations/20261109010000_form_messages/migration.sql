-- Messages to a form's owner from "Contact form owner" (ADR-017). Rows go
-- with their form; the daily cron deletes them after a year.
CREATE TABLE "form_messages" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "form_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_messages_form_id_created_at_idx" ON "form_messages"("form_id", "created_at");
CREATE INDEX "form_messages_created_at_idx" ON "form_messages"("created_at");

ALTER TABLE "form_messages" ADD CONSTRAINT "form_messages_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_messages" ADD CONSTRAINT "form_messages_lengths" CHECK (
  char_length("sender_name") BETWEEN 1 AND 100
  AND char_length("sender_email") BETWEEN 3 AND 254
  AND char_length("subject") BETWEEN 1 AND 150
  AND char_length("body") BETWEEN 1 AND 4000
);

-- Same rule as every table: RLS on, no policies, no Data API grants.
ALTER TABLE "form_messages" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "form_messages" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
