-- The AIESEC work email from EXPA (currentPerson.aiesec_email), stored at each
-- sign-in. The existing "email" column stays the EXPA sign-in email.
ALTER TABLE "users" ADD COLUMN "aiesec_email" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_aiesec_email_length" CHECK ("aiesec_email" IS NULL OR char_length("aiesec_email") BETWEEN 3 AND 254);
