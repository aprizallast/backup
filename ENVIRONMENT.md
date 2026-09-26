# Environment Configuration

Use the ignored `.env.local` file for local API credentials and configuration.
The app launcher loads it for development, build, preview, and database
migration commands. Existing shell and deployment-provided values take
precedence. Never commit secrets or put server-only values in `VITE_` variables.

## Application Variables

| Variable | Required when | Purpose and handling |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase-backed Room Chat is enabled | Supabase project URL used by the browser client. Optional; without it, chat uses local storage. |
| `VITE_SUPABASE_ANON_KEY` | Supabase-backed Room Chat is enabled | Public Supabase anon/publishable key used by the browser client. It is not a secret; protect data with RLS. Never put a service-role key here. |
| `SUPABASE_URL` | Supabase token, sales, and visitor persistence is enabled | Server-only Supabase project URL used by persistence endpoints. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase token, sales, and visitor persistence is enabled | Server-only secret used by API routes to write protected tables. Never prefix it with `VITE_` or expose it to the browser. |
| `DATABASE_URL` | Persistent Better Auth/Postgres deployment is enabled | Server-only Postgres connection string. The platform injects it for deployment. Without it, local preview uses in-memory PGLite. |
| `GEMINI_API_KEY` | Gemini Copilot responses are enabled | Server-only key. `/api/copilot` tries Gemini before xAI. |
| `XAI_API_KEY` | xAI Copilot fallback is enabled | Server-only key. `/api/copilot` uses this when Gemini is unavailable or fails. |
| `VITE_STUN_URLS` | Custom WebRTC/STUN configuration is needed | Optional, client-visible comma-separated STUN URLs; the multiplayer module has a default. |
| `VITE_PUBLIC_HOSTNAME` | A custom deployed public hostname is needed during build | Build/platform-provided public hostname used for generated PWA/share metadata. |

For local development, put the values needed by enabled integrations in
`.env.local`. Example variable names (leave optional credentials unset when the
integration is not used):

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
XAI_API_KEY=
VITE_PRIVY_APP_ID=
DATABASE_URL=
BETTER_AUTH_SECRET=
```

Only `VITE_` variables are exposed to browser code. Supabase anon keys and
Privy app IDs are public client configuration; API keys, database credentials,
and service-role keys must remain server-only. The public anon key still relies
on correct Supabase row-level security policies.

## Platform-Managed Authentication

Authentication is enabled for username/password test accounts. The username
form creates an internal `.invalid` email alias for Better Auth; no mailbox,
email delivery, or wallet connection is used. Local auth configuration may be
set in `.env.local`; deployment credentials are provisioned by the platform.

| Variable | Purpose and handling |
| --- | --- |
| `VITE_AUTH_ENABLED` | Client-visible auth switch. Omitted from `.grok/app-env.json` to enable auth; deployment controls its own value. |
| `VITE_PRIVY_APP_ID` | Public Privy application ID. When configured, the app enables Privy email, wallet, and Google login; without it, the existing account route remains available. |
| `BETTER_AUTH_URL` | Optional server-only public base URL for Better Auth; preview derives its origin from the request. |
| `BETTER_AUTH_SECRET` | Server-only Better Auth session/signing secret; deployment-provided. Preview uses a process-stable fallback. |
| `GROK_AUTH_ISSUER` | Optional server-only auth broker issuer; defaults to the built-in issuer. |
| `GROK_AUTH_CLIENT_ID` | Server-only broker client ID; preview has a prewired fallback. |
| `GROK_AUTH_CLIENT_SECRET` | Server-only broker client secret; preview has a prewired fallback. |
| `GROK_PROJECT_ID` | Platform-provided project identity used to validate gate identity tokens. |
| `GROK_GATE_ORIGIN` | Optional server-only gate origin override; otherwise derived from the request/platform. |

## Optional Connector Variables

| Variable | Purpose and handling |
| --- | --- |
| `GROK_CONNECTORS_URL` | Optional server-only connector host override. |
| `GROK_CONNECTOR_ACCESS_TOKEN` | Optional server-only development token. In production, the request gate supplies the connector token instead. |

## Not Currently Used

Room Chat's browser client uses only the public anon key, protected by the SQL
policies. Token snapshots, recent buy events, and visitor heartbeats use the
server-only service-role key through API handlers. Test accounts and sessions
are stored by Better Auth in the app Postgres database (`DATABASE_URL`), not in
Supabase; local preview uses PGLite and resets when its server process restarts.