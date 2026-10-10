import Link from "next/link";
import TestForm, { emptyForm } from "@/components/admin/TestForm";

export default function NewTest() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-head">
        <h1 style={{ fontSize: "1.8rem" }}>Nuevo test</h1>
        <Link className="btn small" href="/admin">
          Volver a la lista
        </Link>
      </div>
      <TestForm initial={emptyForm()} />
    </div>
  );
}
