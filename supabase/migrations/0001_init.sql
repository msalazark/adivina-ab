-- Adivina el A/B — esquema inicial
-- Ejecutar en Supabase: SQL Editor > New query > pegar y correr (o `supabase db push`).


-- ---------------------------------------------------------------
-- Administradores del panel
-- ---------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------
-- Tests
-- ---------------------------------------------------------------
create table if not exists public.tests (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null,
  company       text,
  industry      text,
  country       text,
  category      text not null default 'Otro',
  device        text not null default 'Todos' check (device in ('Todos','Desktop','Mobile')),
  tool          text,
  source_name   text,
  source_url    text,
  context       text,
  hypothesis    text,
  winner        text not null check (winner in ('A','B','C')),
  metric        text,
  lift          numeric(8,2),
  confidence    numeric(5,2) check (confidence is null or (confidence >= 0 and confidence <= 100)),
  summary       text,
  segments      jsonb not null default '[]'::jsonb,   -- [{ "label": "Mobile", "value": 8.6 }]
  learnings     text[] not null default '{}',
  ideas         text[] not null default '{}',
  tags          text[] not null default '{}',
  status        text not null default 'borrador' check (status in ('borrador','publicado')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tests_status_published_idx on public.tests (status, published_at);
create index if not exists tests_category_idx on public.tests (category);

create table if not exists public.variants (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.tests (id) on delete cascade,
  key          text not null check (key in ('A','B','C')),
  name         text not null default '',
  description  text not null default '',
  unique (test_id, key)
);

-- Capturas reales de cada versión (desktop, mobile, detalle…)
create table if not exists public.variant_images (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references public.variants (id) on delete cascade,
  path        text not null,           -- ruta dentro del bucket test-images
  width       int  not null check (width > 0),
  height      int  not null check (height > 0),
  label       text not null default 'Desktop',
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists variant_images_variant_idx on public.variant_images (variant_id, sort);

-- ---------------------------------------------------------------
-- Votos (un voto por visitante anónimo y test)
-- ---------------------------------------------------------------
create table if not exists public.votes (
  test_id     uuid not null references public.tests (id) on delete cascade,
  voter_id    uuid not null,
  variant_key text not null check (variant_key in ('A','B','C')),
  created_at  timestamptz not null default now(),
  primary key (test_id, voter_id)
);
create index if not exists votes_voter_idx on public.votes (voter_id);

-- ---------------------------------------------------------------
-- Tokens de API para la carga automática (se usan en la siguiente etapa)
-- Solo se guarda el hash SHA-256 del token.
-- ---------------------------------------------------------------
create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  token_hash    text not null unique,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- ---------------------------------------------------------------
-- Mantenimiento de fechas
-- ---------------------------------------------------------------
create or replace function public.touch_test()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'publicado' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tests_touch on public.tests;
create trigger tests_touch before insert or update on public.tests
for each row execute function public.touch_test();

-- ---------------------------------------------------------------
-- Encuesta agregada: cuántos votos tiene cada versión de un test
-- ---------------------------------------------------------------
create or replace function public.test_poll(p_test_id uuid)
returns table (variant_key text, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select v.variant_key, count(*)::bigint
  from public.votes v
  join public.tests t on t.id = v.test_id
  where v.test_id = p_test_id and (t.status = 'publicado' or public.is_admin())
  group by v.variant_key;
$$;

-- ---------------------------------------------------------------
-- Row Level Security
-- Lectura pública de lo publicado; escritura solo para administradores.
-- Los votos se escriben desde el servidor con la service role key.
-- ---------------------------------------------------------------
alter table public.admins          enable row level security;
alter table public.tests           enable row level security;
alter table public.variants        enable row level security;
alter table public.variant_images  enable row level security;
alter table public.votes           enable row level security;
alter table public.api_tokens      enable row level security;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists tests_read on public.tests;
create policy tests_read on public.tests
  for select using (status = 'publicado' or public.is_admin());
drop policy if exists tests_write on public.tests;
create policy tests_write on public.tests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists variants_read on public.variants;
create policy variants_read on public.variants
  for select using (exists (select 1 from public.tests t where t.id = test_id and (t.status = 'publicado' or public.is_admin())));
drop policy if exists variants_write on public.variants;
create policy variants_write on public.variants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists variant_images_read on public.variant_images;
create policy variant_images_read on public.variant_images
  for select using (exists (
    select 1 from public.variants v join public.tests t on t.id = v.test_id
    where v.id = variant_id and (t.status = 'publicado' or public.is_admin())));
drop policy if exists variant_images_write on public.variant_images;
create policy variant_images_write on public.variant_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists api_tokens_admin on public.api_tokens;
create policy api_tokens_admin on public.api_tokens
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- votes: sin políticas => nadie lo lee ni escribe con la anon key.

grant execute on function public.test_poll(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------
-- Storage: bucket público de capturas, escritura solo admins
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('test-images', 'test-images', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists test_images_admin_insert on storage.objects;
create policy test_images_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'test-images' and public.is_admin());
drop policy if exists test_images_admin_update on storage.objects;
create policy test_images_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'test-images' and public.is_admin());
drop policy if exists test_images_admin_delete on storage.objects;
create policy test_images_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'test-images' and public.is_admin());
