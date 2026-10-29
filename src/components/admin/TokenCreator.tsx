"use client";
import { useActionState, useState } from "react";
import { createToken, type CreateTokenState } from "@/app/admin/tokens/actions";

export default function TokenCreator() {
  const [state, action, pending] = useActionState<CreateTokenState, FormData>(createToken, null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="panel" style={{ display: "grid", gap: "0.75rem" }}>
      <h2>Nuevo token</h2>
      <form action={action} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
        <label className="fl" style={{ flex: "1 1 240px" }}>
          <span className="label">Nombre</span>
          <input name="name" placeholder="Boletín GuessTheTest" maxLength={60} required />
        </label>
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear token"}
        </button>
      </form>
      {state?.error && <p className="msg err">{state.error}</p>}
      {state?.token && (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="msg ok">
            Token «{state.name}» creado. Cópialo ahora: no se vuelve a mostrar.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <code className="mono" style={{ wordBreak: "break-all", flex: "1 1 280px" }}>
              {state.token}
            </code>
            <button
              className="btn small"
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(state.token!).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
