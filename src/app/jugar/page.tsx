import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyVotes, isPlayable, listTests } from "@/lib/data";

export const metadata = { title: "Jugar" };

/** Lleva al primer test publicado que el visitante todavía no ha jugado. */
export default async function Jugar() {
  const [tests, votes] = await Promise.all([listTests(), getMyVotes()]);
  const published = tests.filter(isPlayable);
  const next = published.find((t) => !votes[t.id]);
  if (next) redirect(`/tests/${next.slug}`);

  const correct = published.filter((t) => votes[t.id] === t.winner).length;
  return (
    <main className="wrap">
      <div className="notice">
        {published.length ? (
          <>
            <h2>Jugaste los {published.length} tests del archivo</h2>
            <p>
              Acertaste <b className="mono">{correct}</b> de {published.length}. Repasa los resultados en el{" "}
              <Link href="/archivo">archivo</Link> mientras llegan tests nuevos.
            </p>
          </>
        ) : (
          <>
            <h2>Todavía no hay tests publicados</h2>
            <p>Vuelve pronto: el archivo se alimenta poco a poco.</p>
          </>
        )}
      </div>
    </main>
  );
}
