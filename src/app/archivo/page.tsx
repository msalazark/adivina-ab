import Link from "next/link";
import TestCard from "@/components/TestCard";
import { getMyVotes, isPlayable, listTests } from "@/lib/data";

export const metadata = { title: "Archivo" };

const PER_PAGE = 60;

type Props = { searchParams: Promise<{ cat?: string; q?: string; estado?: string; p?: string }> };

export default async function Archivo({ searchParams }: Props) {
  const { cat = "", q = "", estado = "", p = "1" } = await searchParams;
  const [tests, votes] = await Promise.all([listTests(), getMyVotes()]);
  const numbered = tests.map((t, i) => ({ t, n: i + 1 }));
  const cats = Array.from(new Set(tests.map((t) => t.category))).sort();
  const needle = q.trim().toLowerCase();

  const shown = numbered
    .filter(({ t }) => !cat || t.category === cat)
    .filter(({ t }) => {
      if (estado === "pendientes") return isPlayable(t) && !votes[t.id];
      if (estado === "jugados") return Boolean(votes[t.id]);
      if (estado === "catalogo") return t.winner === null;
      return true;
    })
    .filter(({ t }) => !needle || [t.title, t.company, t.industry, t.category, ...(t.tags ?? [])].join(" ").toLowerCase().includes(needle))
    .reverse();

  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(p, 10) || 1));
  const visible = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const href = (next: { cat?: string; estado?: string; p?: number }) => {
    const params = new URLSearchParams();
    const c = next.cat ?? cat;
    const e = next.estado ?? estado;
    if (c) params.set("cat", c);
    if (e) params.set("estado", e);
    if (q) params.set("q", q);
    if (next.p && next.p > 1) params.set("p", String(next.p));
    const s = params.toString();
    return s ? `/archivo?${s}` : "/archivo";
  };

  return (
    <main className="wrap">
      <div className="section-head">
        <div>
          <div className="label">
            {tests.length} {tests.length === 1 ? "test" : "tests"} en el archivo
          </div>
          <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}>Archivo de tests</h1>
        </div>
        <form className="search" action="/archivo">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {estado && <input type="hidden" name="estado" value={estado} />}
          <input type="search" name="q" defaultValue={q} placeholder="Empresa, tema o etiqueta" aria-label="Buscar tests" />
          <button className="btn" type="submit">
            Buscar
          </button>
        </form>
      </div>

      <nav className="filters" aria-label="Filtrar por categoría">
        <Link href={href({ cat: "" })} aria-current={!cat ? "true" : undefined}>
          Todas
        </Link>
        {cats.map((c) => (
          <Link key={c} href={href({ cat: c })} aria-current={cat === c ? "true" : undefined}>
            {c}
          </Link>
        ))}
      </nav>
      <nav className="filters" aria-label="Filtrar por estado">
        {[
          ["", "Todos"],
          ["pendientes", "Sin jugar"],
          ["jugados", "Jugados"],
          ["catalogo", "Solo catálogo"],
        ].map(([v, l]) => (
          <Link key={v} href={href({ estado: v })} aria-current={estado === v ? "true" : undefined}>
            {l}
          </Link>
        ))}
      </nav>

      {shown.length ? (
        <div className="cards">
          {visible.map(({ t, n }) => (
            <TestCard key={t.id} test={t} number={n} vote={votes[t.id]} />
          ))}
        </div>
      ) : (
        <div className="notice">
          <p>Ningún test coincide con esos filtros.</p>
        </div>
      )}

      {pages > 1 && (
        <nav className="filters" aria-label="Paginación" style={{ marginTop: "1.5rem" }}>
          {page > 1 && <Link href={href({ p: page - 1 })}>← Anterior</Link>}
          <span className="label">
            Página {page} de {pages} · {shown.length} tests
          </span>
          {page < pages && <Link href={href({ p: page + 1 })}>Siguiente →</Link>}
        </nav>
      )}
    </main>
  );
}
