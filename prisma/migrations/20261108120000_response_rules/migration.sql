-- Response rules that apply immediately (no republish) and aggregate view counts.
ALTER TABLE "forms" ADD COLUMN "closes_at" TIMESTAMPTZ(6);
ALTER TABLE "forms" ADD COLUMN "response_limit" INTEGER;
ALTER TABLE "forms" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "forms" ADD CONSTRAINT "forms_response_limit_positive" CHECK ("response_limit" IS NULL OR "response_limit" >= 1);
ALTER TABLE "forms" ADD CONSTRAINT "forms_view_count_nonnegative" CHECK ("view_count" >= 0);
