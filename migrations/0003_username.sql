alter table room_chat_profiles
  add column if not exists username text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_chat_profiles'
      and column_name = 'display_name'
  ) then
    execute 'update public.room_chat_profiles set username = coalesce(nullif(btrim(username), ''''), nullif(lower(btrim(display_name)), '''')) where username is null or btrim(username) = ''''';
    alter table public.room_chat_profiles drop column display_name;
  end if;
end $$;

create index if not exists room_chat_profiles_username_idx
  on room_chat_profiles (lower(username))
  where username is not null;