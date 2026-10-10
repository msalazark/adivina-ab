"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteTest } from "@/app/admin/actions";

function Confirm() {
  const { pending } = useFormStatus();
  return (
    <button className="btn small danger" type="submit" disabled={pending}>
      {pending ? "Borrando…" : "Sí, borrar"}
    </button>
  );
}

export default function DeleteButton({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button className="btn small danger" type="button" onClick={() => setAsking(true)}>
        Borrar
      </button>
    );
  return (
    <form action={deleteTest} style={{ display: "inline-flex", gap: "0.3rem" }}>
      <input type="hidden" name="id" value={id} />
      <Confirm />
      <button className="btn small" type="button" onClick={() => setAsking(false)}>
        No
      </button>
    </form>
  );
}
