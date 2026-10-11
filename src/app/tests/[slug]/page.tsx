import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Versus, { type VariantView } from "@/components/Versus";
import SegmentChart from "@/components/SegmentChart";
import { getMyVotes, getPoll, getTestBySlug, isPlayable, listTests } from "@/lib/data";
import { publicImageUrl } from "@/lib/env";
import { formatLift } from "@/lib/format";
import type { Test } from "@/lib/types";
import { castVote } from "./actions";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTestBySlug(slug);
  if (!t) return { title: "Test no encontrado" };
  const firstShot = t.variants.flatMap((v) => v.images)[0];
  return {
    title: t.title,
    description: t.context ?? undefined,
    openGraph: {
      title: t.title,
      description: t.context ?? undefined,
      images: firstShot ? [{ url: publicImageUrl(firstShot.path), width: firstShot.width, height: firstShot.height }] : undefined,
    },
  };
}

function Poll({ test, counts }: { test: Test; counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return <p className="src">Todavía no hay otros votos.</p>;
  return (
    <div className="poll">
      {test.variants.map((v) => {
        const p = Math.round((100 * (counts[v.key] ?? 0)) / total);
        return (
          <div className="poll-row" data-k={v.key} key={v.key}>
            <span className="k">{v.key}</span>
            <span className="track">
              <i style={{ width: `${p}%` }} />
            </span>
            <span className="pct">{p}%</span>
          </div>
        );
      })}
      <p className="src mono" style={{ margin: 0 }}>
        {total} {total === 1 ? "voto" : "votos"}
      </p>
    </div>
  );
}

export default async function TestPage({ params }: Params) {
  const { slug } = await params;
  const test = await getTestBySlug(slug);
  if (!test) notFound();

  const [all, votes] = await Promise.all([listTests(), getMyVotes()]);
  const mine = votes[test.id];
  const number = all.findIndex((t) => t.id === test.id) + 1;
  const nextTest = all.find((t) => isPlayable(t) && !votes[t.id] && t.id !== test.id);
  const poll = mine ? await getPoll(test.id) : {};

  const variants: VariantView[] = test.variants.map((v) => ({
    key: v.key,
    name: v.name,
    description: v.description,
    shots: v.images.map((im) => ({ id: im.id, src: publicImageUrl(im.path), width: im.width, height: im.height, label: im.label })),
  }));

  const ok = mine === test.winner;
  const winV = test.variants.find((v) => v.key === test.winner);
  const mode = test.play_mode;
  // Una biblioteca no se juega: no hay nada que ocultar. En quiz y encuesta, el resultado espera al voto.
  const revealed = Boolean(mine) || test.status === "borrador" || mode === "library";
  const outcomeText: Record<string, string> = {
    win: "la variación mejoró la métrica principal",
    loss: "la variación empeoró la métrica principal",
    mixed: "el resultado fue mixto",
    flat: "no hubo diferencia apreciable",
    unknown: "la fuente no fue concluyente",
  };
  const facts: [string, string | null][] = [
    ["Tipo de página", test.page_type],
    ["Patrón", test.pattern ? `${test.pattern}${test.pattern_number ? ` (#${test.pattern_number})` : ""}` : null],
    ["Muestra", test.sample_size],
    ["Poder estadístico (efecto 5 %)", test.power_5pct !== null ? `${test.power_5pct}%` : null],
    ["Duración", test.duration],
    ["Significancia", test.significance],
    ["Impacto en ingresos", test.revenue_impact],
    ["Autoría", test.author],
    ["Fecha del test", test.tested_on ? new Date(test.tested_on).toLocaleDateString("es", { dateStyle: "long", timeZone: "UTC" }) : test.test_year ? String(test.test_year) : null],
  ];
  const shownFacts = facts.filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <main className="wrap">
      <div className="q-head">
        <div className="meta">
          <span className="label">
            Test {number ? `#${number}` : ""}
            {test.status === "borrador" ? " · borrador (solo admins)" : ""}
          </span>
          <span className="chip">{test.category}</span>
          {test.company && <span className="chip">{test.company}</span>}
          {test.industry && <span className="chip">{test.industry}</span>}
          {test.device !== "Todos" && <span className="chip">{test.device}</span>}
        </div>
        <h1>{test.title}</h1>
      </div>

      {(test.context || test.hypothesis) && (
        <div className="brief">
          {test.context && (
            <div>
              <div className="label">Contexto</div>
              <p>{test.context}</p>
            </div>
          )}
          {test.hypothesis && (
            <div>
              <div className="label">Hipótesis</div>
              <p>{test.hypothesis}</p>
            </div>
          )}
        </div>
      )}

      {mode === "library" ? (
        <section className="brief" aria-label="Cambio probado">
          {variants.map((v) => (
            <div key={v.key}>
              <div className="label">
                {v.key === "A" ? "Control" : "Variación"}
                {v.name && v.name !== "Control" && v.name !== "Variación" ? ` · ${v.name}` : ""}
              </div>
              <p>{v.description || "—"}</p>
            </div>
          ))}
        </section>
      ) : (
        <Versus
          testId={test.id}
          slug={test.slug}
          variants={variants}
          winner={mine && test.winner ? test.winner : undefined}
          mine={mine}
          canVote={test.status === "publicado"}
          action={castVote}
        />
      )}

      {mode === "poll" && !mine && test.status === "publicado" && (
        <p className="src" style={{ marginTop: "1rem" }}>
          Este test no tiene una respuesta oficial: vota con tu criterio y verás qué eligió la comunidad.
        </p>
      )}

      {test.status === "borrador" && !mine && mode !== "library" && (
        <p className="msg err" style={{ marginTop: "1rem" }}>
          Este test es un borrador: no admite votos. Así se verá el resultado cuando se publique.
        </p>
      )}

      {revealed && (
        <section className="result" id="resultado" aria-live="polite">
          {mode === "library" ? (
            <div className="verdict">
              <h2>Caso documentado</h2>
              <p>
                {test.outcome && outcomeText[test.outcome]
                  ? `Según la fuente, ${outcomeText[test.outcome]}. `
                  : ""}
                No hay capturas de las versiones, así que este caso es para consultar, no para jugar.
              </p>
            </div>
          ) : mode === "poll" ? (
            <div className="verdict">
              <h2>{mine ? `Votaste la ${mine}` : "Vista previa de la encuesta"}</h2>
              <p>
                {test.results_locked
                  ? "La fuente deja el resultado tras una membresía, así que no hay respuesta oficial. Esto es lo que votó la comunidad."
                  : "La fuente no declara qué versión ganó. Esto es lo que votó la comunidad."}
              </p>
            </div>
          ) : mine ? (
            <div className={`verdict ${ok ? "ok" : "ko"}`}>
              <h2>{ok ? "Acertaste" : "Esta vez no"}</h2>
              <p>
                Ganó la versión <b>{test.winner}</b>
                {winV?.name ? `: ${winV.name}` : ""}.
              </p>
            </div>
          ) : (
            <div className="verdict ok">
              <h2>Vista previa del resultado</h2>
              <p>Ganadora: {test.winner}</p>
            </div>
          )}
          <div className="r-grid">
            <div className="r-cell">
              <div className="label">{test.metric || "Métrica principal"}</div>

              {(mode === "quiz" || mode === "library") && test.lift !== null && <div className={`lift ${test.lift >= 0 ? "pos" : "neg"}`}>{formatLift(test.lift)}</div>}
              {test.confidence !== null && (
                <div className="conf">
                  <div className="label">
                    Confianza estadística · <span className="mono">{test.confidence}%</span>
                  </div>
                  <div className="meter">
                    <i style={{ width: `${Math.min(100, test.confidence)}%` }} />
                  </div>
                </div>
              )}
              {test.summary && <p className="summary">{test.summary}</p>}
            </div>
            <div className="r-cell">
              {test.segments.length > 0 && (
                <>
                  <div className="label">Lift por segmento</div>
                  <SegmentChart segments={test.segments} />
                </>
              )}
              {mode !== "library" && (
                <>
                  <div className="label" style={{ marginTop: test.segments.length ? "1.1rem" : 0 }}>
                    Qué votaron los demás
                  </div>
                  <Poll test={test} counts={poll} />
                </>
              )}
              {shownFacts.length > 0 && (
                <>
                  <div className="label" style={{ marginTop: test.segments.length || mode !== "library" ? "1.1rem" : 0 }}>
                    Ficha del test
                  </div>
                  <dl className="facts">
                    {shownFacts.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
          </div>
          {(test.learnings.length > 0 || test.ideas.length > 0) && (
            <div className="learn">
              {test.learnings.length > 0 && (
                <div>
                  <h3>Lo que enseña</h3>
                  <ul>
                    {test.learnings.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
              {test.ideas.length > 0 && (
                <div>
                  <h3>Ideas para probar</h3>
                  <ul>
                    {test.ideas.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="r-foot">
            <span className="src">
              {test.source_url && /^https?:\/\//.test(test.source_url) ? (
                <>
                  Fuente:{" "}
                  <a href={test.source_url} target="_blank" rel="noopener noreferrer">
                    {test.source_name || test.source_url}
                  </a>
                </>
              ) : test.source_name ? (
                <>Fuente: {test.source_name}</>
              ) : null}
              {test.tool ? ` · Herramienta: ${test.tool}` : ""}
            </span>
            {nextTest ? (
              <Link className="btn primary" href={`/tests/${nextTest.slug}`}>
                Siguiente test
              </Link>
            ) : (
              <Link className="btn primary" href="/archivo">
                Ver el archivo
              </Link>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
