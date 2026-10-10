import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import DeleteButton from "@/components/admin/DeleteButton";
import { formatLift } from "@/lib/format";

const PER_PAGE = 100;

type Props = { searchParams: Promise<{ borrado?: string; p?: string }> };

export default async function AdminHome({ searchParams }: Props) {
  const { borrado, p = "1" } = await searchParams;
  const page = Math.max(1, Number.parseInt(p, 10) || 1);
  const from = (page - 1) * PER_PAGE;
  const db = await supabaseServer();
  const { data: tests, error, count } = await db
    .from("tests")
    .select("id, slug, title, company, category, status, winner, lift, updated_at, variants(id, variant_images(id))", { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + PER_PAGE - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-head">
        <h1 style={{ fontSize: "1.8rem" }}>Tests</h1>
        <Link className="btn primary" href="/admin/tests/nuevo">
          Nuevo test
        </Link>
      </div>
      {borrado && <p className="msg ok">Test borrado, junto con sus capturas.</p>}
      {error && <p className="msg err">No se pudo leer la lista: {error.message}</p>}
      <div className="panel table-wrap">
        {tests?.length ? (
          <table className="list">
            <thead>
              <tr>
                <th>Pregunta</th>
                <th>Empresa</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Ganó</th>
                <th>Capturas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => {
                const shots = (t.variants ?? []).reduce((n, v) => n + (v.variant_images?.length ?? 0), 0);
                return (
                  <tr key={t.id}>
                    <td style={{ minWidth: 240 }}>
                      <Link href={`/admin/tests/${t.id}`}>{t.title}</Link>
                    </td>
                    <td>{t.company ?? "—"}</td>
                    <td>{t.category}</td>
                    <td>
                      <span className={`state${t.status === "publicado" ? " ok" : ""}`}>{t.status}</span>
                    </td>
                    <td className="mono">
                      {t.winner ?? "—"} {t.lift !== null ? formatLift(Number(t.lift)) : ""}
                    </td>
                    <td className="mono">{shots}</td>
                    <td className="acts">
                      <Link className="btn small" href={`/tests/${t.slug}`}>
                        Ver
                      </Link>{" "}
                      <Link className="btn small" href={`/admin/tests/${t.id}`}>
                        Editar
                      </Link>{" "}
                      <DeleteButton id={t.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay tests. Crea el primero con «Nuevo test».
          </p>
        )}
      </div>
      {pages > 1 && (
        <p className="src" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {page > 1 && <Link href={`/admin?p=${page - 1}`}>← Anterior</Link>}
          <span className="mono">
            Página {page} de {pages} · {count} tests
          </span>
          {page < pages && <Link href={`/admin?p=${page + 1}`}>Siguiente →</Link>}
        </p>
      )}
    </div>
  );
}
