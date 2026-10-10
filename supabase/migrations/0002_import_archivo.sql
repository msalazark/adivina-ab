-- Adivina el A/B — soporte para importar el archivo de casos (GoodUI + casos con resultado)
-- Ejecutar en Supabase: SQL Editor > New query > pegar y correr.

-- Hay tests cuyo resultado no es público (p. ej. GoodUI lo deja tras membresía):
-- se muestran como catálogo, sin juego de adivinar.
alter table public.tests alter column winner drop not null;

alter table public.tests
  add column if not exists source_id       text,                 -- id en el dataset de origen (AB-0001, GU-672)
  add column if not exists page_type       text,                 -- tipo de página tal como lo declara la fuente
  add column if not exists pattern         text,                 -- patrón de diseño (GoodUI)
  add column if not exists pattern_number  int,
  add column if not exists author          text,
  add column if not exists tested_on       date,
  add column if not exists test_year       int,
  add column if not exists sample_size     text,
  add column if not exists duration        text,
  add column if not exists significance    text,
  add column if not exists revenue_impact  text,
  add column if not exists power_5pct      numeric(5,1),         -- poder para detectar un efecto del 5 % (GoodUI)
  add column if not exists outcome         text check (outcome is null or outcome in ('win','loss','mixed','flat','unknown')),
  add column if not exists results_locked  boolean not null default false,  -- el resultado existe pero está tras membresía
  add column if not exists doc_quality     int,                  -- 0-9: campos documentados en la fuente
  add column if not exists review_flags    text[] not null default '{}',    -- avisos para revisar antes de publicar
  add column if not exists raw             jsonb;                -- registro original completo, sin pérdida

create unique index if not exists tests_source_id_key on public.tests (source_id);
create index if not exists tests_outcome_idx on public.tests (outcome);

-- Una captura puede venir de una URL externa; se conserva para poder volver a descargarla.
alter table public.variant_images
  add column if not exists source_url text;
