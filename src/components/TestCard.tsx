import Link from "next/link";
import type { TestTeaser, VariantKey } from "@/lib/types";
import { formatLift } from "@/lib/format";

export default function TestCard({ test, number, vote }: { test: TestTeaser; number: number; vote?: VariantKey }) {
  const state = test.play_mode === "library" ? (
    <span className="state">Caso documentado</span>
  ) : test.play_mode === "poll" ? (
    <span className="state">{vote ? "Votaste" : "Encuesta"}</span>
  ) : !vote ? (
    <span className="state">Sin jugar</span>
  ) : vote === test.winner ? (
    <span className="state ok">Acertaste</span>
  ) : (
    <span className="state ko">Fallaste</span>
  );
  return (
    <Link className="card" href={`/tests/${test.slug}`}>
      <div className="row">
        <span className="label">
          #{number} · {test.category}
          {test.status === "borrador" ? " · borrador" : ""}
        </span>
        {state}
      </div>
      <h3>{test.title}</h3>
      <div className="meta">
        {test.company && <span className="chip">{test.company}</span>}
        {vote && test.play_mode === "quiz" && test.lift !== null && (
          <span className="chip mono">
            {test.winner} {formatLift(test.lift)}
          </span>
        )}
      </div>
    </Link>
  );
}
