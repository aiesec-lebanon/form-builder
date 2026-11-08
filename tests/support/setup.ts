// Deterministic, obviously fake configuration for unit tests, set unconditionally
// so the machine's own environment (CI placeholders, .env files) never leaks in.
// Nothing here is a real credential; modules read these through lib/env.ts.
process.env.SESSION_SECRET = "test-session-secret-0123456789-abcdefghijklmnop";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET = "test-cron-secret";
process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
process.env.AIESEC_AUTH_URL = "https://auth.example.test/oauth";
process.env.AIESEC_CLIENT_ID = "test-client-id";
process.env.AIESEC_CLIENT_SECRET = "test-client-secret";
process.env.AIESEC_REDIRECT_URI = "http://localhost:3000/api/auth/callback";
process.env.GIS_GRAPHQL_URL = "https://gis.example.test/graphql";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

// Optional features start off; tests that need one stub it with vi.stubEnv.
const OPTIONAL_KEYS = ["DATABASE_CA_CERT", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_API_KEY", "GOOGLE_PROJECT_NUMBER", "GOOGLE_ALLOWED_DOMAINS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "DEV_LOGIN", "PLATFORM_ADMIN_PERSON_IDS", "REQUIRE_CURRENT_POSITION"];
for (const key of OPTIONAL_KEYS) delete process.env[key];
