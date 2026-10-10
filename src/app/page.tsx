import Link from "next/link";
import TestCard from "@/components/TestCard";
import { getMyVotes, listTests } from "@/lib/data";

export default async function Home() {
  const [tests, votes] = await Promise.all([listTests(), getMyVotes()]);
  const numbered = tests.map((t, i) => ({ t, n: i + 1 }));
  const latest = numbered.slice(-6).reverse();
  const pending = tests.filter((t) => !votes[t.id]).length;

  return (
    <main className="wrap">
      <section className="hero">
        <div>
          <h1>
            ¿Ganó la <em>A</em> o la <em>B</em>?
          </h1>
          <p>
            Tests A/B reales de tiendas, SaaS y marcas. Mira las dos versiones, elige la que crees que ganó y descubre el
            resultado, el lift y lo que se aprendió.
          </p>
          <div className="hero-actions">
            <Link className="btn primary" href="/jugar">
              {pending ? `Jugar (${pending} sin jugar)` : "Jugar"}
            </Link>
            <Link className="btn" href="/archivo">
              Ver el archivo
            </Link>
          </div>
        </div>
        <div className="hero-split" aria-hidden="true">
          <div>A</div>
          <div>B</div>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Últimos tests</h2>
          <span className="label">{tests.length} en el archivo</span>
        </div>
        {latest.length ? (
          <div className="cards">
            {latest.map(({ t, n }) => (
              <TestCard key={t.id} test={t} number={n} vote={votes[t.id]} />
            ))}
          </div>
        ) : (
          <div className="notice">
            <h2>Todavía no hay tests publicados</h2>
            <p>El archivo se alimenta poco a poco. Vuelve pronto.</p>
          </div>
        )}
      </section>
    </main>
  );
}
