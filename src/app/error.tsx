"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap">
      <div className="notice">
        <h2>No pudimos cargar esta página</h2>
        <p>Puede ser un problema momentáneo con la base de datos. Si estás configurando el proyecto, revisa las variables de Supabase en el archivo .env.local.</p>
        <button className="btn primary" type="button" onClick={reset}>
          Intentar de nuevo
        </button>
      </div>
    </main>
  );
}
