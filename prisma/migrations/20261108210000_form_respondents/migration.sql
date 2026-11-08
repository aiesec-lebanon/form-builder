-- One-response-per-person records for AIESEC-only forms. respondent_key is a
-- keyed hash of the person, never the AIESEC id; rows go with their form.
CREATE TABLE "form_respondents" (
    "form_id" UUID NOT NULL,
    "respondent_key" TEXT NOT NULL,
    "response_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_respondents_pkey" PRIMARY KEY ("form_id","respondent_key")
);

ALTER TABLE "form_respondents" ADD CONSTRAINT "form_respondents_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_respondents" ADD CONSTRAINT "form_respondents_key_length" CHECK (char_length("respondent_key") BETWEEN 16 AND 128);

-- Same rule as every table: RLS on, no policies, no Data API grants.
ALTER TABLE "form_respondents" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "form_respondents" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
