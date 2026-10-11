import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyVotes, isPlayable, isQuiz, listTests } from "@/lib/data";

export const metadata = { title: "Jugar" };

/** Lleva al primer test publicado que el visitante todavía no ha jugado. */
export default async function Jugar() {
  const [tests, votes] = await Promise.all([listTests(), getMyVotes()]);
  const quizzes = tests.filter(isQuiz);
  const polls = tests.filter((t) => isPlayable(t) && t.play_mode === "poll");
  // Primero los que tienen respuesta correcta; después las encuestas.
  const next = quizzes.find((t) => !votes[t.id]) ?? polls.find((t) => !votes[t.id]);
  if (next) redirect(`/tests/${next.slug}`);

  const published = [...quizzes, ...polls];
  const correct = quizzes.filter((t) => votes[t.id] === t.winner).length;
  return (
    <main className="wrap">
      <div className="notice">
        {published.length ? (
          <>
            <h2>Jugaste los {published.length} tests del archivo</h2>
            <p>
              {quizzes.length > 0 && (
                <>
                  Acertaste <b className="mono">{correct}</b> de {quizzes.length} con respuesta conocida
                  {polls.length > 0 ? ` y votaste en ${polls.length} encuestas` : ""}.{" "}
                </>
              )}
              Repasa los resultados en el <Link href="/archivo">archivo</Link> mientras llegan tests nuevos.
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
