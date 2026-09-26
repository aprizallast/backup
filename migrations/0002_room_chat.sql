create table if not exists room_chat_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text unique,
  name text not null,
  username text,
  primary_email text,
  profile_image_url text,
  wallet_address text not null unique,
  mode text not null check (mode in ('wallet', 'email')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  sender text not null,
  wallet_address text not null,
  mode text not null check (mode in ('wallet', 'email')),
  text text not null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists room_chat_messages_room_id_idx
  on room_chat_messages (room_id, created_at desc);

create unique index if not exists room_chat_profiles_user_id_idx
  on room_chat_profiles (user_id)
  where user_id is not null;

create index if not exists room_chat_profiles_username_idx
  on room_chat_profiles (lower(username))
  where username is not null;

create index if not exists room_chat_profiles_wallet_address_idx
  on room_chat_profiles (wallet_address);

alter table room_chat_profiles enable row level security;
alter table room_chat_messages enable row level security;

drop policy if exists "room_chat_profiles_read_all" on room_chat_profiles;
create policy "room_chat_profiles_read_all"
  on room_chat_profiles
  for select
  using (true);

drop policy if exists "room_chat_messages_read_all" on room_chat_messages;
create policy "room_chat_messages_read_all"
  on room_chat_messages
  for select
  using (true);

drop policy if exists "room_chat_profiles_write_all" on room_chat_profiles;
create policy "room_chat_profiles_write_all"
  on room_chat_profiles
  for insert
  with check (true);

drop policy if exists "room_chat_profiles_update_all" on room_chat_profiles;
create policy "room_chat_profiles_update_all"
  on room_chat_profiles
  for update
  using (true)
  with check (true);

drop policy if exists "room_chat_messages_write_all" on room_chat_messages;
create policy "room_chat_messages_write_all"
  on room_chat_messages
  for insert
  with check (true);
