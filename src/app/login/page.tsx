"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("El correo o la contraseña no coinciden. Revisa e inténtalo de nuevo.");
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : "/admin");
    router.refresh();
  }

  return (
    <form className="panel f login" onSubmit={onSubmit}>
      <h1 style={{ fontSize: "1.6rem" }}>Entrar al panel</h1>
      <p className="muted" style={{ margin: 0 }}>
        Solo para quien administra el archivo de tests.
      </p>
      {error && <p className="msg err">{error}</p>}
      <label className="fl">
        <span>Correo</span>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="fl">
        <span>Contraseña</span>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
