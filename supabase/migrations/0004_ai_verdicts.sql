-- Adivina el A/B — estimación de Claude para tests sin resultado público
-- Ejecutar en Supabase: SQL Editor > New query > pegar y correr (después de 0003).
--
-- Es una ESTIMACIÓN razonada, no el resultado real. Vive en columnas propias (ai_*) para no
-- mezclarse nunca con `winner`, que solo recibe resultados oficiales.

alter table public.tests
  add column if not exists ai_winner        text check (ai_winner in ('A','B','C')),
  add column if not exists ai_confidence    text check (ai_confidence in ('alta','media','baja')),
  add column if not exists ai_rationale     text,
  add column if not exists ai_criteria      text[] not null default '{}',
  add column if not exists ai_model         text,
  add column if not exists ai_generated_at  timestamptz;

create index if not exists tests_ai_winner_idx on public.tests (ai_winner) where ai_winner is not null;
