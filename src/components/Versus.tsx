"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { VariantKey } from "@/lib/types";

export type ShotView = { id: string; src: string; width: number; height: number; label: string };
export type VariantView = { key: VariantKey; name: string; description: string; shots: ShotView[] };

type Props = {
  testId: string;
  slug: string;
  variants: VariantView[];
  /** Solo llegan cuando el visitante ya votó: así la ganadora no está en la página antes de votar. */
  winner?: VariantKey;
  mine?: VariantKey;
  canVote: boolean;
  action: (formData: FormData) => Promise<void>;
};

function PickButton({ k }: { k: VariantKey }) {
  const { pending, data } = useFormStatus();
  const mine = data?.get("key") === k;
  return (
    <button className="pick" type="submit" name="key" value={k} disabled={pending}>
      {pending && mine ? "Guardando tu voto…" : `Ganó la ${k}`}
    </button>
  );
}

export default function Versus({ testId, slug, variants, winner, mine, canVote, action }: Props) {
  const [active, setActive] = useState<Record<string, number>>({});
  const [viewer, setViewer] = useState<{ open: boolean; focus: VariantKey | null }>({ open: false, focus: null });
  const anyShots = variants.some((v) => v.shots.length);
  const voted = Boolean(mine);

  const cards = variants.map((v) => {
    const idx = active[v.key] ?? 0;
    const shot = v.shots[idx];
    const win = voted && v.key === winner;
    const isMine = voted && v.key === mine;
    return (
      <article key={v.key} className={`variant${win ? " is-win" : ""}`} data-k={v.key}>
        <div className="v-bar">
          <span className="v-key">{v.key}</span>
          <span className="v-name">{v.name || `Versión ${v.key}`}</span>
          {win ? <span className="v-flag">Ganadora{isMine ? " · tu voto" : ""}</span> : isMine ? <span className="v-flag mine">Tu voto</span> : null}
        </div>
        {v.shots.length > 1 && (
          <div className="shot-tabs" role="group" aria-label={`Capturas de la versión ${v.key}`}>
            {v.shots.map((s, i) => (
              <button key={s.id} type="button" aria-pressed={i === idx} onClick={() => setActive((a) => ({ ...a, [v.key]: i }))}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        {shot ? (
          <button type="button" className="shot" onClick={() => setViewer({ open: true, focus: v.key })} aria-label={`Ampliar captura de la versión ${v.key}`}>
            <Image src={shot.src} alt={`Versión ${v.key}: ${v.name}`} width={shot.width} height={shot.height} sizes="(max-width: 760px) 100vw, 560px" />
            <span className="zoom">Ver completa</span>
          </button>
        ) : (
          <div className="no-shot">Sin captura para esta versión</div>
        )}
        <div className="v-body">
          <p>{v.description}</p>
          {canVote && !voted && <PickButton k={v.key} />}
        </div>
      </article>
    );
  });

  return (
    <>
      {anyShots && (
        <div className="compare-bar">
          <button type="button" className="btn small" onClick={() => setViewer({ open: true, focus: null })}>
            Comparar lado a lado
          </button>
        </div>
      )}
      {canVote && !voted ? (
        <form action={action} className="versus">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="slug" value={slug} />
          {cards}
        </form>
      ) : (
        <div className="versus">{cards}</div>
      )}
      {viewer.open && (
        <Viewer variants={variants} active={active} focus={viewer.focus} onClose={() => setViewer({ open: false, focus: null })} />
      )}
    </>
  );
}

function Viewer({
  variants,
  active,
  focus,
  onClose,
}: {
  variants: VariantView[];
  active: Record<string, number>;
  focus: VariantKey | null;
  onClose: () => void;
}) {
  const withShots = variants.filter((v) => v.shots.length);
  const [only, setOnly] = useState<VariantKey | null>(focus);
  const [idx, setIdx] = useState<Record<string, number>>(active);
  const shown = only ? withShots.filter((v) => v.key === only) : withShots;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Capturas de las versiones">
      <div className="viewer-top">
        <span className="label">Ver</span>
        <button type="button" className="btn small" aria-pressed={!only} onClick={() => setOnly(null)}>
          Lado a lado
        </button>
        {withShots.map((v) => (
          <button key={v.key} type="button" className="btn small" aria-pressed={only === v.key} onClick={() => setOnly(v.key)}>
            Solo {v.key}
          </button>
        ))}
        <button type="button" className="btn small primary spacer" onClick={onClose} autoFocus>
          Cerrar
        </button>
      </div>
      <div className="viewer-body" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((v) => {
          const i = idx[v.key] ?? 0;
          const s = v.shots[i] ?? v.shots[0];
          return (
            <section key={v.key} className="viewer-col variant" data-k={v.key} style={{ background: "transparent", border: 0 }}>
              <header>
                <span className="v-key">{v.key}</span>
                <strong>{v.name}</strong>
                {v.shots.length > 1 && (
                  <span className="shot-tabs" style={{ padding: 0, marginLeft: "auto" }}>
                    {v.shots.map((sh, j) => (
                      <button key={sh.id} type="button" aria-pressed={j === i} onClick={() => setIdx((x) => ({ ...x, [v.key]: j }))}>
                        {sh.label}
                      </button>
                    ))}
                  </span>
                )}
              </header>
              <div className="viewer-scroll">
                <Image src={s.src} alt={`Versión ${v.key}: ${v.name}`} width={s.width} height={s.height} sizes={only ? "100vw" : "50vw"} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
