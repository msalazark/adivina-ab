import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/data";
import { signOut } from "./actions";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  const admin = await isAdmin();

  return (
    <main className="wrap">
      <div className="section-head" style={{ marginBottom: "1.25rem" }}>
        <span className="label">Panel de administración · {user.email}</span>
        <form action={signOut}>
          <button className="btn small" type="submit">
            Cerrar sesión
          </button>
        </form>
      </div>
      {admin ? (
        children
      ) : (
        <div className="notice">
          <h2>Tu cuenta no es administradora</h2>
          <p>
            Agrega tu usuario a la tabla <code>admins</code> en Supabase (lo explica el README) y vuelve a cargar esta página.
          </p>
        </div>
      )}
    </main>
  );
}
