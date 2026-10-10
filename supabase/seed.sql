-- Test de ejemplo: Lomax (fuente: GuessTheTest). Las capturas se suben desde el panel admin.
with t as (
  insert into public.tests (
    slug, title, company, industry, country, category, device, tool, source_name, source_url,
    context, hypothesis, winner, metric, lift, confidence, summary, segments, learnings, ideas, tags, status
  ) values (
    'lomax-menu-clics-vs-ingresos',
    '¿Qué orden del menú vendió más: por clics o por ingresos?',
    'Lomax', 'Suministros de oficina (B2B y B2C)', 'Dinamarca', 'Navegación', 'Todos', 'Wingify (VWO)',
    'GuessTheTest', 'https://guessthetest.com/archived-tests/',
    'Al revisar mapas de calor y análisis de clics del mega menú, el equipo vio un desajuste: Office Supplies era la categoría que más atención y clics recibía, pero no la que más ingresos aportaba.',
    'Si las categorías del menú se ordenan según su aporte a los ingresos y no según los clics, más usuarios llegarán a categorías de mayor valor y aumentarán las compras.',
    'B', 'Compras', 2.59, 98.7,
    'El menú ordenado por ingresos subió las compras sin cambiar el ticket promedio: el efecto vino de que más personas convirtieran, no de canastas más grandes. El mapa de calor mostró que el resto del menú siguió usándose.',
    '[{"label":"B2B","value":2.04},{"label":"B2C","value":3.43},{"label":"Desktop","value":2},{"label":"Mobile","value":8.6}]'::jsonb,
    array[
      'Un clic mide atención, no valor: la categoría más clicada no siempre es la que más vende.',
      'En mobile el orden pesa más porque se ven menos opciones a la vez; ahí el lift fue unas cuatro veces mayor que en desktop.',
      'El ticket promedio no cambió: ordenar por valor ayudó a que más gente terminara comprando.'
    ],
    array[
      'Compara la participación de clics de cada categoría con su conversión y su aporte a ingresos; si los rankings difieren, prueba ordenar por valor.',
      'Analiza los tests de navegación por dispositivo y considera un orden específico para mobile.'
    ],
    array['mega menú','arquitectura de información','heatmaps','ecommerce','mobile'],
    'publicado'
  )
  on conflict (slug) do nothing
  returning id
)
insert into public.variants (test_id, key, name, description)
select t.id, v.key, v.name, v.description
from t, (values
  ('A', 'Más clicadas primero', 'El mega menú ordena las categorías según cuántos clics recibe cada una, con Office Supplies a la cabeza.'),
  ('B', 'Más rentables primero', 'Las mismas categorías, reordenadas según su contribución a los ingresos. Office Supplies baja al sexto lugar.')
) as v(key, name, description);
