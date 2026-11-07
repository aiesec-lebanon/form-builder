// Deterministic, obviously fake configuration for unit tests. Nothing here is a
// real credential; modules read these through lib/env.ts.
process.env.SESSION_SECRET ??= "test-session-secret-0123456789-abcdefghijklmnop";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3000";
process.env.AIESEC_AUTH_URL ??= "https://auth.example.test/oauth";
process.env.AIESEC_CLIENT_ID ??= "test-client-id";
process.env.AIESEC_CLIENT_SECRET ??= "test-client-secret";
process.env.AIESEC_REDIRECT_URI ??= "http://localhost:3000/api/auth/callback";
process.env.GIS_GRAPHQL_URL ??= "https://gis.example.test/graphql";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
