# AIESEC Forms

A form builder for AIESEC members. Build a form, connect it to your own Google Sheet, webhook or database, and every response goes straight there. AIESEC Forms keeps the form, not the answers.

AIESEC Forms is an open-source project by [AIESEC in Lebanon](https://aiesec.org). Members of any AIESEC entity are welcome to use it, report problems and contribute.

[![CI](https://github.com/aiesec-lebanon/form-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/aiesec-lebanon/form-builder/actions/workflows/ci.yml)

## Why it exists

AIESEC entities run on forms: event registrations, membership applications, partner enquiries, feedback after every conference. Those forms often collect personal data about young people. They usually live in personal accounts that get lost at term handover.

AIESEC Forms is built around a few rules:

- **The owner keeps the data.** Answers are delivered to a destination the form's owner controls. They are never written to the AIESEC Forms database.
- **Sign in with AIESEC.** Members sign in with their AIESEC account. By default only people with a current EXPA position can build forms.
- **Forms outlive terms.** Every form has one owner and up to 25 collaborators, and ownership can be handed to the next team.
- **Fast on a phone.** The builder and the forms work on mobile first, in light and dark.

## Features

**Building forms**

- 18 question types: short and long text, email, phone, number, URL, date, time, multiple choice, checkboxes, dropdown, multiple-choice grid, checkbox grid, linear scale, rating, file upload, consent and statement.
- Multiple pages, drag-and-drop reordering, undo and redo, autosave and a live preview.
- Conditional logic that shows a question or a whole page based on earlier answers.
- Templates for event registration, feedback surveys, contact forms and membership applications.
- Choice questions can be filled with AIESEC entities (the local committees in your country, or every AIESEC country and territory) straight from AIESEC's API. Long lists become searchable.
- A design-system style (calm, warm, bold or playful), an accent colour from AIESEC's programme palette, and light, dark or automatic mode.
- Checks before publishing catch untitled questions, empty options, broken logic rules and a missing destination.

**Collecting responses**

- Share by link, QR code or embed code. Owners can limit which websites can embed a form.
- Open to anyone, or only to people who sign in with AIESEC. AIESEC-only forms can be limited to current members, record who responded and allow one response per person.
- A close date, a response limit and an on/off switch for accepting responses.
- View and response counts for completion rates.
- Respondents' answers are saved in their own browser while they fill the form in, so nothing is lost if delivery fails.
- Optional Cloudflare Turnstile bot check and rate limits on every submission.

**Running the platform**

- Collaborators by email or EXPA ID, and ownership transfer.
- An activity log of sign-ins and changes for platform admins at `/admin/activity`.
- A daily cleanup job (GitHub Actions) that purges deleted forms after 30 days, trims old activity, messages and rate-limit records, and moves abandoned uploads to the Drive trash.

## Destinations

Each form has one **primary** destination that must accept a response before the respondent sees "sent". It can also have **secondary** destinations that receive a copy, and a **file uploads** destination for file questions.

| Destination | What arrives | What the owner sets up |
| --- | --- | --- |
| Google Sheets | One row per response: submitted at, response ID, then one column per question. Grids get one column per row. New questions are added as new columns at the end. | Connect Google in Settings. AIESEC Forms creates the Sheet. |
| Google Drive | Uploaded files land in a folder AIESEC Forms creates, and the Sheet links to each file. | Same Google connection. |
| Webhook | A signed JSON `POST` for every response. | Any public HTTPS URL. |
| Supabase | A row in the owner's own Supabase table, through the Data API. | Run the setup SQL shown in the app and paste the project's secret key. |
| PostgreSQL | A row in the owner's own table, over TLS. | Run the setup SQL and paste a connection string. |

Google access uses the `drive.file` scope, so AIESEC Forms can only see the files it created. Owner secrets (webhook signing secrets, database keys, Google tokens) are encrypted at rest with AES-256-GCM. Webhook, Supabase and Postgres hosts are checked on every connection, so a destination can't point at a private or internal network.

### Database table

Supabase and PostgreSQL destinations write to a table like this (the app shows the exact SQL):

```sql
create table if not exists public.form_responses (
  response_id uuid primary key,
  form_id text not null,
  submitted_at timestamptz not null,
  data jsonb not null
);
```

Inserts are idempotent on `response_id`. For one column per question, open the destination's menu and copy **One column per question (SQL)**. It creates a view over `data`. Run it again after you change the questions.

### Webhooks

Every response is sent as:

```http
POST /your-endpoint
Content-Type: application/json
User-Agent: AIESEC-Forms-Webhook/1.0
X-AIESEC-Forms-Event: response.created
X-AIESEC-Forms-Delivery: <unique id per attempt>
X-AIESEC-Forms-Timestamp: <unix seconds>
X-AIESEC-Forms-Signature: v1=<hex HMAC-SHA256>
Idempotency-Key: <response id>
```

```json
{
  "event": "response.created",
  "responseId": "2f6c…",
  "submittedAt": "2026-11-08T10:00:00.000Z",
  "form": { "id": "…", "title": "Event registration", "slug": "event-registration" },
  "respondent": null,
  "answers": [
    { "fieldId": "f_…", "label": "Full name", "type": "short_text", "value": "Lina Haddad" }
  ]
}
```

`respondent` holds the name, email and AIESEC ID only when the form asks people to sign in with AIESEC and records who responded. Every question is listed in order, with `null` for questions that weren't answered.

To verify a request, compute the HMAC of `<timestamp>.<raw body>` with the signing secret shown in the app:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function isFromAiesecForms(secret, rawBody, headers) {
  const timestamp = headers["x-aiesec-forms-timestamp"] ?? "";
  const signature = headers["x-aiesec-forms-signature"] ?? "";
  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return fresh && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

Ignore requests you have already processed by checking `Idempotency-Key`. Return a `2xx` to accept the response. Redirects are not followed, so use the final URL. Any other status fails the delivery. When the webhook is the primary destination, the respondent then sees an error and can send again. The **Test** button sends an `event: "test"` request.

## How a response travels

1. The respondent opens `/f/<slug>` or an embedded form. Their answers are kept in their own browser until the response is sent.
2. File uploads go from the browser to the owner's Drive folder before the response is sent.
3. On **Send**, the server checks the answers against the published form, the access rules, the close date and response limit, rate limits and Turnstile.
4. The server delivers the response to the primary destination. If that fails, the respondent sees an error and can send again. Their answers are still in their browser. Nothing is queued on our side.
5. Once the primary accepts, secondary destinations get a copy. Their failures show up as health on the destination card in the builder.
6. Files from responses that were never sent are moved to the Drive trash after 7 days.

**What AIESEC Forms stores:** members' EXPA profile basics (name, EXPA ID, email, photo, entity and position), form definitions, collaborators, encrypted destination settings, response and view counts, delivery health, and an activity log with a one-way hash of the IP address. It never stores answers or uploaded files. The full policy is on the [privacy page](app/privacy/page.tsx), served at `/privacy`.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) with React 19 and TypeScript
- Tailwind CSS v4 and [React Aria Components](https://react-spectrum.adobe.com/react-aria/)
- The AIESEC design system, vendored in [components/aiesec/](components/aiesec/)
- PostgreSQL ([Supabase](https://supabase.com)) through [Prisma 7](https://www.prisma.io) and the `pg` driver
- Zod for validation, jose for sealed session cookies, dnd-kit for drag and drop, lucide-react icons
- Vitest for unit tests and Playwright for end-to-end smoke tests
- [Vercel](https://vercel.com) for hosting, and GitHub Actions for CI and the daily cleanup

## Getting started

### Prerequisites

- Node.js 22 or newer (CI runs Node 24) and npm
- A PostgreSQL database. A local Postgres is fine for development. Production uses Supabase.
- Optional, depending on what you work on:
  - An AIESEC OAuth application from `auth.aiesec.org`, to sign in with real AIESEC accounts
  - A Google Cloud OAuth client with the Sheets and Drive APIs enabled, for the Google destinations
  - Cloudflare Turnstile keys, for the bot check

### Run it locally

```bash
git clone https://github.com/aiesec-lebanon/form-builder.git
cd form-builder
npm install            # also runs prisma generate
cp .env.example .env.local
```

Fill in `.env.local` (see [Configuration](#configuration)). For a quick local setup without AIESEC credentials:

- Point `DATABASE_URL` and `DIRECT_URL` at your local database, for example `postgresql://postgres:postgres@localhost:5432/aiesec_forms`. TLS is skipped for `localhost`.
- Generate `ENCRYPTION_KEY` with `openssl rand -base64 32`, and use a random string of 32 or more characters for `SESSION_SECRET` and 16 or more for `CRON_SECRET`.
- Put any placeholder in `AIESEC_CLIENT_ID` and `AIESEC_CLIENT_SECRET`, and set `DEV_LOGIN="1"`.

Then create the tables and start the app:

```bash
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and choose **Use a development account**. Add `?as=2` to `/api/auth/dev-login` to sign in as a second person, which helps when testing collaborators. Development accounts only work when `NODE_ENV=development`. A production build ignores `DEV_LOGIN`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with coverage. CI fails below 80%. |
| `npm run e2e` | Playwright smoke tests against a running dev server with `DEV_LOGIN=1` |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:status` | Show which migrations have been applied |
| `npm run tokens` | Regenerate `components/aiesec/tokens.css` from the design system's `tokens.json` |

## Configuration

All settings are environment variables. [.env.example](.env.example) lists them with comments. The app validates them on first use and names any that are missing or invalid.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Runtime connection. On Supabase, the transaction pooler (port 6543). |
| `DIRECT_URL` | Yes | Connection for migrations. On Supabase, the session pooler (port 5432). |
| `DATABASE_CA_CERT` | No | PEM of the database CA, to verify the TLS certificate. |
| `AIESEC_AUTH_URL` | Yes | AIESEC OAuth base URL, `https://auth.aiesec.org/oauth`. |
| `AIESEC_CLIENT_ID`, `AIESEC_CLIENT_SECRET` | Yes | The AIESEC OAuth application. |
| `AIESEC_REDIRECT_URI` | Yes | `<base URL>/api/auth/callback`, registered on the AIESEC application exactly. |
| `GIS_GRAPHQL_URL` | Yes | AIESEC's GraphQL API, used to read the signed-in member's profile and entities. |
| `SESSION_SECRET` | Yes | 32+ characters. Seals session cookies and derives other keys. |
| `ENCRYPTION_KEY` | Yes | Base64 of 32 random bytes. Encrypts owner secrets and Google tokens. Changing it makes stored secrets unreadable. |
| `CRON_SECRET` | Yes | 16+ characters. The daily cleanup workflow sends it to `/api/cron/cleanup`. |
| `NEXT_PUBLIC_BASE_URL` | Yes | The public origin, for example `https://forms.example.org`. |
| `PLATFORM_ADMIN_PERSON_IDS` | No | Comma-separated EXPA person IDs who can open `/admin/activity`. |
| `REQUIRE_CURRENT_POSITION` | No | `true` (default) lets only members with a current EXPA position sign in. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | Turns on the Google Sheets and Drive destinations. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | No | Turns on the Turnstile bot check. Both must be set. |
| `DEV_LOGIN` | No | `1` enables development accounts in `next dev`. Never set it in production. |

## Deploying

AIESEC Forms is built for Vercel and a Supabase Postgres database.

1. **Database.** Create a Supabase project and run `npm run db:migrate` with its `DIRECT_URL`. Migrations turn on row-level security and remove the Data API roles' access, so only the app can read the tables.
2. **AIESEC sign-in.** Register `https://<domain>/api/auth/callback` on your AIESEC OAuth application.
3. **Google (optional).** In Google Cloud, enable the Sheets and Drive APIs and add the `openid`, `userinfo.email` and `drive.file` scopes. Add `https://<domain>` as an authorized origin and `https://<domain>/api/google/callback` as a redirect URI. While the Google app is in testing, only listed test users can connect and connections expire after 7 days. Publish it with `/privacy` as the privacy policy URL to lift both limits.
4. **Vercel.** Import the repository, set every variable from the table above, and deploy. [vercel.json](vercel.json) sets the function region; change `regions` to the region closest to your database.
5. **Daily cleanup.** In the GitHub repository, Settings → Secrets and variables → Actions: add the variable `APP_URL` (your production address) and the secret `CRON_SECRET` (the same value as in Vercel). [cleanup.yml](.github/workflows/cleanup.yml) then calls `/api/cron/cleanup` once a day; run it by hand from the Actions tab to check.
6. **Check.** `GET /api/health` should return `{"ok":true,"db":"up"}`. Then sign in, create a form, connect a destination, publish it and send a test response from your phone.

Run `npm run db:migrate` again whenever a release adds a migration in [prisma/migrations/](prisma/migrations/).

## Project structure

```text
app/                 Routes: dashboard, builder, public form (/f/[slug]), embed, API routes
actions/             Server actions for forms, the builder, destinations, collaborators and Google
components/
  aiesec/            Vendored AIESEC design system: tokens, components and fonts
  builder/           The form builder
  form/              The form respondents see
  dashboard/         The forms list and template picker
lib/
  auth/              AIESEC OAuth, sessions and the sign-in policy
  destinations/      Adapters for Google Sheets, Drive, webhooks, Supabase and Postgres
  forms/             Form schema, question types, logic, payloads and publish checks
  google/            Google OAuth, token refresh and API calls
  net/               Network guard for owner-supplied hosts
prisma/              Schema and hand-written SQL migrations
public/embed.js      The embed script
proxy.ts             Session gate and security headers
tests/               Unit tests
e2e/                 Playwright smoke tests
```

This project uses Next.js 16, which renames and changes several APIs (for example, `middleware.ts` is now `proxy.ts`). Check the guides in `node_modules/next/dist/docs/` before relying on older Next.js knowledge.

### Embedding a form

```html
<div data-aiesec-form="your-form-link"></div>
<script src="https://<forms-domain>/embed.js" async></script>
```

Optional attributes: `data-theme="light|dark"`, `data-transparent` and `data-title`. The iframe resizes to fit the form, and the `div` fires an `aiesec-forms:submitted` event after a response is sent.

## Contributing

Contributions are welcome, from AIESEC members and anyone else.

1. Open an [issue](https://github.com/aiesec-lebanon/form-builder/issues) to report a bug or discuss a feature before starting large changes.
2. Fork the repository and create a branch from `main`.
3. Keep changes focused, and add or update tests in [tests/](tests/) for anything you change.
4. Before opening a pull request, run:

   ```bash
   npm run typecheck && npm run lint && npm run test:coverage && npm run build
   ```

   CI runs the same checks and requires 80% coverage.
5. Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org) style used in this repository, such as `feat: add a time zone to date questions` or `fix: keep grid columns in order`.

Some rules the code follows, and that pull requests should keep:

- Response answers and uploaded files are never stored, logged or included in error messages.
- Owner secrets are encrypted before they reach the database.
- Every request to an owner-supplied host goes through `lib/net/guard.ts`.
- New UI uses the components in `components/aiesec/` and works on a phone, in light and dark.

## Security

If you find a security problem, please don't open a public issue. Report it privately through the repository's **Security** tab, or contact the platform team of AIESEC in Lebanon.

## Brand

The AIESEC name, logo and design system in this repository belong to AIESEC and are used under AIESEC's brand guidelines. They aren't covered by the code license. The "Powered by AIESEC" mark is deliberately not used, because it needs separate permission.

## License

A license hasn't been chosen yet. Until a `LICENSE` file is added to the repository, the code can't be reused outside this project.

---

Made by AIESEC in Lebanon.
