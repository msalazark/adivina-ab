import Link from "next/link";
import TokenCreator from "@/components/admin/TokenCreator";
import { supabaseServer } from "@/lib/supabase/server";
import { revokeToken } from "./actions";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }) : "—";

export default async function TokensPage() {
  const db = await supabaseServer();
  const { data: tokens, error } = await db
    .from("api_tokens")
    .select("id, name, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-head">
        <h1 style={{ fontSize: "1.8rem" }}>Tokens de API</h1>
        <Link className="btn small" href="/admin">
          Volver a la lista
        </Link>
      </div>
      <p style={{ color: "var(--muted)", margin: 0 }}>
        Cada token permite cargar tests con <code>POST /api/v1/tests</code>. Entran como borrador; los revisas y publicas desde el panel.
      </p>
      <TokenCreator />
      {error && <p className="msg err">No se pudo leer la lista: {error.message}</p>}
      <div className="panel table-wrap">
        {tokens?.length ? (
          <table className="list">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Creado</th>
                <th>Último uso</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="mono">{fmt(t.created_at)}</td>
                  <td className="mono">{fmt(t.last_used_at)}</td>
                  <td>
                    <span className={`state${t.revoked_at ? " ko" : " ok"}`}>{t.revoked_at ? "revocado" : "activo"}</span>
                  </td>
                  <td>
                    {!t.revoked_at && (
                      <form action={revokeToken}>
                        <input type="hidden" name="id" value={t.id} />
                        <button className="btn small danger" type="submit">
                          Revocar
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ margin: 0, color: "var(--muted)" }}>Aún no hay tokens.</p>
        )}
      </div>
    </div>
  );
}
