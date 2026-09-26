-- FINAL database schema for Agent BREW
-- Consolidated final schema for all persistent app data.
-- This version includes both the original app data and the missing browser-side user/app state.

begin;

create extension if not exists pgcrypto;

-- 1) User profile registry
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  username text,
  primary_email text,
  profile_image_url text,
  wallet_address text,
  auth_provider text not null default 'email',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_username_unique unique (username)
);

alter table public.user_profiles
  add column if not exists username text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles' and column_name = 'display_name'
  ) then
    execute 'update public.user_profiles set username = coalesce(nullif(btrim(username), ''''), nullif(lower(btrim(display_name)), '''')) where username is null or btrim(username) = ''''';
    alter table public.user_profiles drop column display_name;
  end if;
end $$;

create index if not exists user_profiles_email_idx
  on public.user_profiles (lower(primary_email))
  where primary_email is not null;

-- 2) Community chat profile mapping
create table if not exists public.room_chat_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text unique,
  username text,
  name text not null,
  primary_email text,
  profile_image_url text,
  wallet_address text not null unique,
  mode text not null check (mode in ('wallet', 'email')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.room_chat_profiles
  add column if not exists user_id text;

alter table public.room_chat_profiles
  add column if not exists username text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'room_chat_profiles' and column_name = 'display_name'
  ) then
    execute 'update public.room_chat_profiles set username = coalesce(nullif(btrim(username), ''''), nullif(lower(btrim(display_name)), '''')) where username is null or btrim(username) = ''''';
    alter table public.room_chat_profiles drop column display_name;
  end if;
end $$;

alter table public.room_chat_profiles
  add column if not exists primary_email text;

alter table public.room_chat_profiles
  add column if not exists profile_image_url text;

create unique index if not exists room_chat_profiles_user_id_idx
  on public.room_chat_profiles (user_id)
  where user_id is not null;

create index if not exists room_chat_profiles_wallet_address_idx
  on public.room_chat_profiles (wallet_address);

create index if not exists room_chat_profiles_username_idx
  on public.room_chat_profiles (lower(username))
  where username is not null;

-- 3) Community chat messages
create table if not exists public.room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  sender text not null,
  wallet_address text not null,
  profile_image_url text not null default '',
  mode text not null check (mode in ('wallet', 'email')),
  text text not null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  created_at timestamptz not null default now()
);

alter table public.room_chat_messages
  add column if not exists profile_image_url text not null default '';

create index if not exists room_chat_messages_room_created_at_idx
  on public.room_chat_messages (room_id, created_at asc);

-- 4) Token thesis / recent thesis
create table if not exists public.token_theses (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  wallet_address text,
  username text,
  primary_email text,
  avatar_url text,
  token_address text not null,
  token_symbol text not null,
  title text not null,
  content text not null,
  likes_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.token_theses
  add column if not exists likes_count integer not null default 0;

alter table public.token_theses
  add column if not exists username text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'token_theses' and column_name = 'display_name'
  ) then
    execute 'update public.token_theses set username = coalesce(nullif(btrim(username), ''''), nullif(lower(btrim(display_name)), '''')) where username is null or btrim(username) = ''''';
    alter table public.token_theses drop column display_name;
  end if;
end $$;

alter table public.token_theses
  add column if not exists primary_email text;

alter table public.token_theses
  add column if not exists avatar_url text;

create index if not exists token_theses_token_address_idx
  on public.token_theses (token_address, created_at desc);

create index if not exists token_theses_user_idx
  on public.token_theses (user_id)
  where user_id is not null;

-- 5) Thesis like ledger: one-like-per-user-per-thesis
create table if not exists public.thesis_likes (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.token_theses(id) on delete cascade,
  user_id text not null,
  wallet_address text,
  created_at timestamptz not null default now(),
  unique (thesis_id, user_id),
  unique (thesis_id, wallet_address)
);

create index if not exists thesis_likes_thesis_idx
  on public.thesis_likes (thesis_id, created_at desc);

create index if not exists thesis_likes_user_idx
  on public.thesis_likes (user_id);

-- 6) Favorite token by user
create table if not exists public.favorite_tokens (
  user_id text not null,
  token_address text not null,
  token_symbol text not null,
  token_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, token_address)
);

create index if not exists favorite_tokens_user_idx
  on public.favorite_tokens (user_id, updated_at desc);

-- 7) Browser-side profile snapshot fallback
create table if not exists public.user_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  username text,
  primary_email text,
  profile_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profile_snapshots
  add column if not exists username text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profile_snapshots' and column_name = 'display_name'
  ) then
    execute 'update public.user_profile_snapshots set username = coalesce(nullif(btrim(username), ''''), nullif(lower(btrim(display_name)), '''')) where username is null or btrim(username) = ''''';
    alter table public.user_profile_snapshots drop column display_name;
  end if;
end $$;

create index if not exists user_profile_snapshots_email_idx
  on public.user_profile_snapshots (lower(primary_email))
  where primary_email is not null;

create index if not exists user_profile_snapshots_username_idx
  on public.user_profile_snapshots (lower(username))
  where username is not null;

-- 8) Claim reservation for username/display-name uniqueness
create table if not exists public.claimed_usernames (
  username text primary key constraint claimed_usernames_format_check check (
    username = lower(btrim(username))
    and username <> ''
    and position('@' in username) = 0
  ),
  user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.claimed_usernames
  drop column if exists display_name;

alter table public.claimed_usernames
  add column if not exists created_at timestamptz not null default now();

alter table public.claimed_usernames
  add column if not exists updated_at timestamptz not null default now();

with ranked_claims as (
  select
    ctid,
    row_number() over (
      partition by lower(btrim(username))
      order by updated_at desc, created_at desc, username
    ) as username_rank,
    row_number() over (
      partition by user_id
      order by updated_at desc, created_at desc, username
    ) as user_rank
  from public.claimed_usernames
  where btrim(username) <> ''
    and position('@' in username) = 0
)
delete from public.claimed_usernames as claims
using ranked_claims
where claims.ctid = ranked_claims.ctid
  and (ranked_claims.username_rank > 1 or ranked_claims.user_rank > 1);

delete from public.claimed_usernames
where btrim(username) = '' or position('@' in username) > 0;

update public.claimed_usernames
set username = lower(btrim(username));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'claimed_usernames_format_check'
      and conrelid = 'public.claimed_usernames'::regclass
  ) then
    alter table public.claimed_usernames
      add constraint claimed_usernames_format_check
      check (
        username = lower(btrim(username))
        and username <> ''
        and position('@' in username) = 0
      ) not valid;
  end if;
end $$;

alter table public.claimed_usernames
  validate constraint claimed_usernames_format_check;

create unique index if not exists claimed_usernames_user_uidx
  on public.claimed_usernames (user_id);

create unique index if not exists claimed_usernames_normalized_uidx
  on public.claimed_usernames (lower(btrim(username)));

drop function if exists public.save_profile_identity(text, text, text, text, text, text, text);

create or replace function public.save_profile_identity(
  p_user_id text,
  p_username text,
  p_name text,
  p_primary_email text,
  p_profile_image_url text,
  p_wallet_address text,
  p_mode text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_username text := lower(btrim(p_username));
  username_owner text;
  saved_at timestamptz := now();
begin
  if coalesce(btrim(p_user_id), '') = ''
     or coalesce(normalized_username, '') = ''
     or position('@' in normalized_username) > 0
     or p_mode not in ('wallet', 'email') then
    raise exception 'Invalid profile identity' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(normalized_username));
  select user_id into username_owner
  from public.claimed_usernames
  where username = normalized_username
  for update;

  if username_owner is not null and username_owner <> p_user_id then
    raise exception 'Username is already claimed' using errcode = '23505';
  end if;

  insert into public.claimed_usernames (username, user_id, updated_at)
  values (normalized_username, p_user_id, saved_at)
  on conflict (user_id) do update
    set username = excluded.username,
        updated_at = excluded.updated_at;

  insert into public.user_profiles (
    user_id, username, primary_email, profile_image_url,
    wallet_address, auth_provider, updated_at
  ) values (
    p_user_id, normalized_username, p_primary_email, p_profile_image_url,
    p_wallet_address, 'email', saved_at
  ) on conflict (user_id) do update set
    username = excluded.username,
    primary_email = excluded.primary_email,
    profile_image_url = excluded.profile_image_url,
    wallet_address = excluded.wallet_address,
    updated_at = excluded.updated_at;

  insert into public.user_profile_snapshots (
    user_id, username, primary_email, profile_image_url, updated_at
  ) values (
    p_user_id, normalized_username, p_primary_email, p_profile_image_url, saved_at
  ) on conflict (user_id) do update set
    username = excluded.username,
    primary_email = excluded.primary_email,
    profile_image_url = excluded.profile_image_url,
    updated_at = excluded.updated_at;

  insert into public.room_chat_profiles (
    user_id, username, name, primary_email, profile_image_url,
    wallet_address, mode, updated_at
  ) values (
    p_user_id, normalized_username, p_name, p_primary_email,
    p_profile_image_url, p_wallet_address, p_mode, saved_at
  ) on conflict (user_id) do update set
    username = excluded.username,
    name = excluded.name,
    primary_email = excluded.primary_email,
    profile_image_url = excluded.profile_image_url,
    wallet_address = excluded.wallet_address,
    mode = excluded.mode,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.save_profile_identity(text, text, text, text, text, text, text) from public;
grant execute on function public.save_profile_identity(text, text, text, text, text, text, text) to anon, authenticated;

-- 9) User app preferences (theme, language, favorite token)
create table if not exists public.user_app_preferences (
  user_id text primary key,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  language text not null default 'en' check (language in ('en', 'zh', 'ja')),
  favorite_token_address text,
  favorite_token_symbol text,
  favorite_token_name text,
  updated_at timestamptz not null default now()
);

create index if not exists user_app_preferences_token_idx
  on public.user_app_preferences (favorite_token_address)
  where favorite_token_address is not null;

-- 10) Recent thesis cache mirror of browser localStorage
create table if not exists public.recent_thesis_cache (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  token_address text not null,
  token_symbol text not null,
  thesis_id uuid not null,
  thesis_title text not null,
  thesis_content text not null,
  thesis_author_user_id text,
  thesis_author_username text,
  thesis_author_avatar_url text,
  thesis_author_email text,
  likes_count integer not null default 0,
  liked_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recent_thesis_cache
  add column if not exists thesis_author_email text;

alter table public.recent_thesis_cache
  add column if not exists thesis_author_username text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recent_thesis_cache' and column_name = 'thesis_author_display_name'
  ) then
    execute 'update public.recent_thesis_cache set thesis_author_username = coalesce(nullif(btrim(thesis_author_username), ''''), nullif(lower(btrim(thesis_author_display_name)), '''')) where thesis_author_username is null or btrim(thesis_author_username) = ''''';
    alter table public.recent_thesis_cache drop column thesis_author_display_name;
  end if;
end $$;

create index if not exists recent_thesis_cache_user_token_idx
  on public.recent_thesis_cache (user_id, token_address, updated_at desc);

create index if not exists recent_thesis_cache_token_idx
  on public.recent_thesis_cache (token_address, updated_at desc);

-- 11) Token market and launch data
create table if not exists public.tokens (
  address text primary key check (address ~* '^0x[a-f0-9]{40}$'),
  token_index integer not null default 0,
  pool text not null default '',
  creator text not null default '',
  creator_launch_count integer not null default 1,
  name text not null,
  symbol text not null,
  quote_symbol text not null default 'WBNB',
  quote_address text,
  quote_name text,
  launched_at_ms bigint not null,
  block_number bigint not null default 0,
  tx_hash text not null default '',
  last_buy_at_ms bigint,
  last_buy_block_number bigint,
  last_buy_log_index integer,
  logo_url text not null default '',
  fallback_logo_url text not null default '',
  onchain_artwork_contract text,
  description text,
  twitter_url text,
  website_url text,
  telegram_url text,
  price_usd numeric(38, 24) not null default 0,
  price_change_5m numeric(16, 8),
  price_change_1h numeric(16, 8),
  price_change_6h numeric(16, 8),
  price_change_24h numeric(16, 8),
  volume_24h numeric(30, 8) not null default 0,
  liquidity_usd numeric(30, 8) not null default 0,
  market_cap_usd numeric(30, 8) not null default 0,
  buys_5m integer not null default 0,
  sells_5m integer not null default 0,
  buys_1h integer not null default 0,
  sells_1h integer not null default 0,
  buys_6h integer not null default 0,
  sells_6h integer not null default 0,
  buys_24h integer not null default 0,
  sells_24h integer not null default 0,
  total_buys integer not null default 0,
  total_sells integer not null default 0,
  buy_ratio numeric(16, 8) not null default 1,
  agent_score numeric(8, 2) not null default 0,
  potential_score numeric(8, 2),
  agent_verdict text not null default '',
  agent_signals jsonb not null default '[]'::jsonb,
  dex_url text not null default '',
  brew_url text not null default '',
  bubblemaps_url text not null default '',
  bscscan_token_url text not null default '',
  bscscan_creator_url text not null default '',
  bscscan_tx_url text not null default '',
  other_dev_tokens jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.token_sales (
  transaction_hash text not null,
  log_index integer not null,
  token_address text not null references public.tokens(address) on delete cascade,
  pool_address text not null default '',
  block_number bigint not null,
  block_hash text not null default '',
  event_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (transaction_hash, log_index)
);

create index if not exists tokens_last_buy_idx
  on public.tokens (last_buy_at_ms desc nulls last);

create index if not exists tokens_creator_idx
  on public.tokens (creator);

create index if not exists token_sales_event_at_idx
  on public.token_sales (event_at desc);

create index if not exists token_sales_token_event_at_idx
  on public.token_sales (token_address, event_at desc);

-- 12) Visitor session tracking
create table if not exists public.visitor_sessions (
  session_id text primary key check (char_length(session_id) between 8 and 128),
  user_id text,
  username text not null default '',
  primary_email text not null default '',
  profile_image_url text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_path text not null default '/',
  referrer text not null default ''
);

alter table public.visitor_sessions
  add column if not exists user_id text;

alter table public.visitor_sessions
  add column if not exists username text not null default '';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visitor_sessions' and column_name = 'display_name'
  ) then
    execute $migration$
      update public.visitor_sessions
      set username = coalesce(
        nullif(btrim(username), ''),
        nullif(lower(btrim(display_name)), ''),
        ''
      )
      where username is null or btrim(username) = ''
    $migration$;
    alter table public.visitor_sessions drop column display_name;
  end if;
end $$;

alter table public.visitor_sessions
  add column if not exists primary_email text not null default '';

alter table public.visitor_sessions
  add column if not exists profile_image_url text not null default '';

create index if not exists visitor_sessions_last_seen_idx
  on public.visitor_sessions (last_seen_at desc);
create index if not exists visitor_sessions_user_id_idx
  on public.visitor_sessions (user_id)
  where user_id is not null;

-- 13) Summary views
create or replace view public.token_market_stats as
select
  count(*)::bigint as total_tokens,
  count(*) filter (
    where volume_24h > 0 or liquidity_usd > 0 or market_cap_usd > 0
  )::bigint as active_pairs,
  coalesce(sum(volume_24h), 0)::numeric(30, 8) as total_tracked_volume_24h,
  coalesce(sum(market_cap_usd), 0)::numeric(30, 8) as total_tracked_market_cap,
  (
    select count(*)::bigint
    from (
      select creator
      from public.tokens
      where creator <> ''
      group by creator
      having count(*) > 1
    ) as multi_token_creators
  ) as multi_token_devs,
  max(updated_at) as updated_at
from public.tokens;

create or replace view public.visitor_summary
with (security_invoker = false)
as
select
  count(*)::bigint as total_visits,
  count(distinct session_id)::bigint as unique_visitors,
  count(*) filter (
    where last_seen_at >= now() - interval '45 seconds'
  )::bigint as active_visitors,
  max(last_seen_at) as last_visit_at
from public.visitor_sessions;

-- 14) Row level security
alter table public.user_profiles enable row level security;
alter table public.room_chat_profiles enable row level security;
alter table public.room_chat_messages enable row level security;
alter table public.favorite_tokens enable row level security;
alter table public.token_theses enable row level security;
alter table public.thesis_likes enable row level security;
alter table public.user_profile_snapshots enable row level security;
alter table public.claimed_usernames enable row level security;
alter table public.user_app_preferences enable row level security;
alter table public.recent_thesis_cache enable row level security;
alter table public.tokens enable row level security;
alter table public.token_sales enable row level security;
alter table public.visitor_sessions enable row level security;

-- Public profile access: allow read for everyone, write for authenticated users
drop policy if exists user_profiles_read_all on public.user_profiles;
create policy user_profiles_read_all
  on public.user_profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists user_profiles_write_all on public.user_profiles;
create policy user_profiles_write_all
  on public.user_profiles
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists user_profiles_update_all on public.user_profiles;
create policy user_profiles_update_all
  on public.user_profiles
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists room_chat_profiles_read_all on public.room_chat_profiles;
create policy room_chat_profiles_read_all
  on public.room_chat_profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists room_chat_profiles_insert_all on public.room_chat_profiles;
create policy room_chat_profiles_insert_all
  on public.room_chat_profiles
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists room_chat_profiles_update_all on public.room_chat_profiles;
create policy room_chat_profiles_update_all
  on public.room_chat_profiles
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists room_chat_messages_read_all on public.room_chat_messages;
create policy room_chat_messages_read_all
  on public.room_chat_messages
  for select
  to anon, authenticated
  using (true);

drop policy if exists room_chat_messages_insert_all on public.room_chat_messages;
create policy room_chat_messages_insert_all
  on public.room_chat_messages
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists favorite_tokens_read_all on public.favorite_tokens;
create policy favorite_tokens_read_all
  on public.favorite_tokens
  for select
  to anon, authenticated
  using (true);

drop policy if exists favorite_tokens_write_all on public.favorite_tokens;
create policy favorite_tokens_write_all
  on public.favorite_tokens
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists favorite_tokens_update_all on public.favorite_tokens;
create policy favorite_tokens_update_all
  on public.favorite_tokens
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists token_theses_read_all on public.token_theses;
create policy token_theses_read_all
  on public.token_theses
  for select
  to anon, authenticated
  using (true);

drop policy if exists token_theses_insert_all on public.token_theses;
create policy token_theses_insert_all
  on public.token_theses
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists token_theses_update_all on public.token_theses;
create policy token_theses_update_all
  on public.token_theses
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists thesis_likes_read_all on public.thesis_likes;
create policy thesis_likes_read_all
  on public.thesis_likes
  for select
  to anon, authenticated
  using (true);

drop policy if exists thesis_likes_insert_all on public.thesis_likes;
create policy thesis_likes_insert_all
  on public.thesis_likes
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists thesis_likes_update_all on public.thesis_likes;
create policy thesis_likes_update_all
  on public.thesis_likes
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists user_profile_snapshots_read_all on public.user_profile_snapshots;
create policy user_profile_snapshots_read_all
  on public.user_profile_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists user_profile_snapshots_write_all on public.user_profile_snapshots;
create policy user_profile_snapshots_write_all
  on public.user_profile_snapshots
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists user_profile_snapshots_update_all on public.user_profile_snapshots;
create policy user_profile_snapshots_update_all
  on public.user_profile_snapshots
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists claimed_usernames_read_all on public.claimed_usernames;
create policy claimed_usernames_read_all
  on public.claimed_usernames
  for select
  to anon, authenticated
  using (true);

drop policy if exists claimed_usernames_write_all on public.claimed_usernames;
create policy claimed_usernames_write_all
  on public.claimed_usernames
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists claimed_usernames_update_all on public.claimed_usernames;
create policy claimed_usernames_update_all
  on public.claimed_usernames
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists user_app_preferences_read_all on public.user_app_preferences;
create policy user_app_preferences_read_all
  on public.user_app_preferences
  for select
  to anon, authenticated
  using (true);

drop policy if exists user_app_preferences_write_all on public.user_app_preferences;
create policy user_app_preferences_write_all
  on public.user_app_preferences
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists user_app_preferences_update_all on public.user_app_preferences;
create policy user_app_preferences_update_all
  on public.user_app_preferences
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists recent_thesis_cache_read_all on public.recent_thesis_cache;
create policy recent_thesis_cache_read_all
  on public.recent_thesis_cache
  for select
  to anon, authenticated
  using (true);

drop policy if exists recent_thesis_cache_insert_all on public.recent_thesis_cache;
create policy recent_thesis_cache_insert_all
  on public.recent_thesis_cache
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists recent_thesis_cache_update_all on public.recent_thesis_cache;
create policy recent_thesis_cache_update_all
  on public.recent_thesis_cache
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists tokens_read_all on public.tokens;
create policy tokens_read_all
  on public.tokens
  for select
  to anon, authenticated
  using (true);

drop policy if exists token_sales_read_all on public.token_sales;
create policy token_sales_read_all
  on public.token_sales
  for select
  to anon, authenticated
  using (true);

-- Visitor sessions are operational data; keep read limited and write open for anonymous stats collection
drop policy if exists visitor_sessions_insert_all on public.visitor_sessions;
create policy visitor_sessions_insert_all
  on public.visitor_sessions
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists visitor_sessions_update_all on public.visitor_sessions;
create policy visitor_sessions_update_all
  on public.visitor_sessions
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists visitor_sessions_read_all on public.visitor_sessions;
create policy visitor_sessions_read_all
  on public.visitor_sessions
  for select
  to anon, authenticated
  using (true);

-- Grants
grant select, insert, update on public.user_profiles to anon, authenticated;
grant select, insert, update on public.room_chat_profiles to anon, authenticated;
grant select, insert on public.room_chat_messages to anon, authenticated;
grant select, insert, update on public.favorite_tokens to anon, authenticated;
grant select, insert, update on public.token_theses to anon, authenticated;
grant select, insert, update on public.thesis_likes to anon, authenticated;
grant select, insert, update on public.user_profile_snapshots to anon, authenticated;
grant select, insert, update on public.claimed_usernames to anon, authenticated;
grant select, insert, update on public.user_app_preferences to anon, authenticated;
grant select, insert, update on public.recent_thesis_cache to anon, authenticated;
grant select on public.tokens, public.token_sales to anon, authenticated;
grant select on public.token_market_stats, public.visitor_summary to anon, authenticated;
grant all on public.tokens, public.token_sales, public.visitor_sessions to service_role;
revoke all on public.visitor_sessions from anon, authenticated;

commit;
