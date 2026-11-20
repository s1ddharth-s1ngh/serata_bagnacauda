-- Applied to the remote project via MCP apply_migration (version 20261120083116).
-- Live photo wall: media table, RLS, realtime, public bucket "party"
create table public.media (
  id uuid primary key default gen_random_uuid(),
  -- only "<uuid>.<ext>" at bucket root: blocks junk/path tricks in public URLs
  path text not null unique
    check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$'),
  type text not null check (type in ('image', 'video')),
  author text check (char_length(author) <= 40),
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create index media_created_at_idx on public.media (created_at);

alter table public.media enable row level security;

-- explicit grants: anon reads, and may only write path/type/author (never hidden/created_at/id)
revoke all on public.media from anon, authenticated;
grant select on public.media to anon;
grant insert (path, type, author) on public.media to anon;
grant select, insert, update, delete on public.media to service_role;

create policy "anon can add visible media"
  on public.media for insert to anon
  with check (hidden = false);

create policy "anon can see visible media"
  on public.media for select to anon
  using (hidden = false);

alter publication supabase_realtime add table public.media;

-- 50 MB = max on Free plan (and the default global limit on Pro)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('party', 'party', true, 52428800, array['image/*', 'video/*']);

create policy "anon can upload to party"
  on storage.objects for insert to anon
  with check (
    bucket_id = 'party'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$'
  );
