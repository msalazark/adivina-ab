-- Adivina el A/B — modo de juego de cada test
-- Ejecutar en Supabase: SQL Editor > New query > pegar y correr (después de 0002).
--
--   quiz     tiene ganadora conocida: se adivina y puntúa
--   poll     tiene capturas pero no ganadora oficial: se vota y se ve lo que eligió la comunidad
--   library  sin ganadora ni capturas: caso documentado para consultar, sin voto

alter table public.tests
  add column if not exists play_mode text not null default 'quiz'
  check (play_mode in ('quiz', 'poll', 'library'));

create index if not exists tests_play_mode_idx on public.tests (play_mode, status);

-- Recalcula el modo de uno o de todos los tests. Se invoca tras guardar capturas o importar.
create or replace function public.refresh_play_modes(p_test uuid default null)
returns void
language sql
as $$
  update public.tests t
  set play_mode = case
    when t.winner is not null then 'quiz'
    when exists (
      select 1 from public.variants v
      join public.variant_images i on i.variant_id = v.id
      where v.test_id = t.id
    ) then 'poll'
    else 'library'
  end
  where p_test is null or t.id = p_test;
$$;

grant execute on function public.refresh_play_modes(uuid) to authenticated;

-- Los tests que ya existen
select public.refresh_play_modes();
