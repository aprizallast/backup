# Supabase Setup

Run `schema.sql` in the Supabase SQL Editor to create or upgrade the web
application data model: profiles and username claims, Room Chat, preferences
and favorites, token theses and likes, token snapshots, recent buy events, and
visitor heartbeats. `FINAL.sql` at the workspace root is the consolidated schema
entrypoint and contains the same profile-identity RPC and table definitions.

## Required Project Values

Configure these through the deployment platform's environment settings; do not
commit values or create a `.env` file.

| Key | Exposure | Enables |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser-visible | Room Chat Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Browser-visible public key | Room Chat reads and writes allowed by RLS |
| `SUPABASE_URL` | Server-only | Server-side token, sales, and visitor persistence |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret, server-only | Writes to protected token and visitor tables |
| `DATABASE_URL` | Secret, server-only | Persistent Better Auth accounts and sessions on deployment |

The Supabase token and visitor tables are written by these application APIs:

- `GET /api/tokens` upserts token snapshots.
- `GET /api/sales` records recent buy events for tokens present in the snapshot.
- `POST /api/visitors/ping` refreshes a visitor heartbeat.
- `POST /api/visitors/leave` marks a visitor session inactive.

The service-role key bypasses RLS. It is read only by server code and must
never be named `VITE_SUPABASE_SERVICE_ROLE_KEY`. If Supabase server credentials
are absent, those endpoints keep their existing upstream/in-memory behavior.

Room Chat requires both browser keys above. Account signup/sign-in is separate:
Better Auth stores those accounts in the application Postgres database via
`DATABASE_URL`; the local PGLite preview database is temporary.

Profile saves call `public.save_profile_identity`, which atomically claims the
normalized username and updates `user_profiles`, `user_profile_snapshots`, and
`room_chat_profiles`. Apply the updated SQL before saving profiles; chat and
thesis views resolve the current username and avatar through the shared profile
row keyed by the Better Auth user ID.