-- Reports from respondents about a form (footer "Report"). Reviewed by
-- platform admins; rows go with their form.
CREATE TABLE "form_reports" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "contact" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "form_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_reports_reviewed_at_created_at_idx" ON "form_reports"("reviewed_at", "created_at");

ALTER TABLE "form_reports" ADD CONSTRAINT "form_reports_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_reports" ADD CONSTRAINT "form_reports_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 40);
ALTER TABLE "form_reports" ADD CONSTRAINT "form_reports_details_length" CHECK ("details" IS NULL OR char_length("details") <= 2000);
ALTER TABLE "form_reports" ADD CONSTRAINT "form_reports_contact_length" CHECK ("contact" IS NULL OR char_length("contact") <= 254);

-- Same rule as every table: RLS on, no policies, no Data API grants.
ALTER TABLE "form_reports" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "form_reports" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
