-- Sites allowed to frame /embed/[slug]; an empty list means any site. Applies without republishing.
ALTER TABLE "forms" ADD COLUMN "embed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "forms" ADD CONSTRAINT "forms_embed_domains_max" CHECK (cardinality("embed_domains") <= 20);
