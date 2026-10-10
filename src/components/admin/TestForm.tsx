"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTest, type TestInput } from "@/app/admin/actions";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { CATEGORIES, VARIANT_KEYS, type VariantKey } from "@/lib/types";

const BUCKET = "test-images";
const LABELS = ["Desktop", "Mobile", "Detalle"];

/** Captura en el formulario: ya subida (path) o pendiente de subir (file). */
export type FormImage = { uid: string; path?: string; file?: File; preview: string; width: number; height: number; label: string };
export type FormVariant = { key: VariantKey; name: string; description: string; images: FormImage[] };
export type FormState = Omit<TestInput, "variants"> & { variants: FormVariant[] };

export const emptyForm = (): FormState => ({
  title: "",
  slug: "",
  company: "",
  industry: "",
  country: "",
  category: "Navegación",
  device: "Todos",
  tool: "",
  source_name: "",
  source_url: "",
  context: "",
  hypothesis: "",
  winner: "B",
  metric: "Conversión",
  lift: "",
  confidence: "",
  summary: "",
  segments: "",
  learnings: "",
  ideas: "",
  tags: "",
  status: "borrador",
  variants: [
    { key: "A", name: "", description: "", images: [] },
    { key: "B", name: "", description: "", images: [] },
  ],
});

const uid = () => Math.random().toString(36).slice(2);

function readDims(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => reject(new Error(`«${file.name}» no es una imagen válida.`));
    img.src = url;
  });
}

/** Reduce capturas enormes (más de 2400 px de ancho o más de 4,5 MB) a WebP de 2000 px. */
async function prepareImage(file: File): Promise<FormImage> {
  const { img, url } = await readDims(file);
  let out: File = file;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > 2400 || file.size > 4.5 * 1024 * 1024) {
    const scale = Math.min(1, 2000 / w);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo comprimir la imagen."))), "image/webp", 0.88));
    out = new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  }
  return { uid: uid(), file: out, preview: url, width: w, height: h, label: h > w * 1.6 && w < 900 ? "Mobile" : "Desktop" };
}

export default function TestForm({ initial, testId }: { initial: FormState; testId?: string }) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setVar = (i: number, patch: Partial<FormVariant>) =>
    setF((s) => ({ ...s, variants: s.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  async function addFiles(i: number, files: FileList | File[]) {
    const list = Array.from(files).filter((x) => x.type.startsWith("image/"));
    if (!list.length) return;
    try {
      const prepared = await Promise.all(list.map(prepareImage));
      setF((s) => ({ ...s, variants: s.variants.map((v, j) => (j === i ? { ...v, images: [...v.images, ...prepared] } : v)) }));
      setMsg(null);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      // 1. Subir capturas nuevas al storage
      const supabase = supabaseBrowser();
      const pending = f.variants.flatMap((v) => v.images.filter((im) => im.file && !im.path));
      let done = 0;
      const uploaded = new Map<string, string>();
      for (const im of pending) {
        setBusy(`Subiendo capturas (${++done}/${pending.length})…`);
        const ext = (im.file!.type.split("/")[1] || "png").replace("jpeg", "jpg");
        const path = `tests/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, im.file!, { contentType: im.file!.type, cacheControl: "31536000", upsert: false });
        if (error) throw new Error(`No se pudo subir una captura: ${error.message}`);
        uploaded.set(im.uid, path);
      }
      // 2. Guardar el test
      setBusy("Guardando el test…");
      const payload: TestInput = {
        ...f,
        id: testId,
        variants: f.variants.map((v) => ({
          key: v.key,
          name: v.name,
          description: v.description,
          images: v.images.map((im) => ({ path: im.path ?? uploaded.get(im.uid)!, width: im.width, height: im.height, label: im.label })),
        })),
      };
      const res = await saveTest(payload);
      if (!res.ok) throw new Error(res.error);
      // Las capturas ya subidas pasan a tener path
      setF((s) => ({
        ...s,
        slug: res.slug,
        variants: s.variants.map((v) => ({ ...v, images: v.images.map((im) => (im.path ? im : { ...im, path: uploaded.get(im.uid), file: undefined })) })),
      }));
      setMsg({ ok: true, text: testId ? "Cambios guardados." : "Test creado." });
      if (!testId) router.replace(`/admin/tests/${res.id}?creado=1`);
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className="f" onSubmit={onSubmit} noValidate>
      {msg && <p className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</p>}

      <fieldset>
        <legend>La pregunta</legend>
        <label className="fl">
          <span>Pregunta que verá el jugador</span>
          <input id="title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="¿Qué orden del menú vendió más?" required />
        </label>
        <div className="fr">
          <label className="fl">
            <span>Empresa</span>
            <input id="company" value={f.company} onChange={(e) => set("company", e.target.value)} />
          </label>
          <label className="fl">
            <span>Industria</span>
            <input id="industry" value={f.industry} onChange={(e) => set("industry", e.target.value)} />
          </label>
          <label className="fl">
            <span>País</span>
            <input id="country" value={f.country} onChange={(e) => set("country", e.target.value)} />
          </label>
          <label className="fl">
            <span>Categoría</span>
            <select id="category" value={f.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="fl">
            <span>Dispositivo</span>
            <select id="device" value={f.device} onChange={(e) => set("device", e.target.value)}>
              {["Todos", "Desktop", "Mobile"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="fl">
          <span>Contexto</span>
          <small>Escríbelo con tus palabras; no copies el texto de la fuente.</small>
          <textarea id="context" value={f.context} onChange={(e) => set("context", e.target.value)} />
        </label>
        <label className="fl">
          <span>Hipótesis</span>
          <textarea id="hypothesis" value={f.hypothesis} onChange={(e) => set("hypothesis", e.target.value)} />
        </label>
      </fieldset>

      {f.variants.map((v, i) => (
        <VariantFields
          key={v.key}
          v={v}
          index={i}
          onChange={(patch) => setVar(i, patch)}
          onFiles={(files) => addFiles(i, files)}
          onRemove={i >= 2 ? () => setF((s) => ({ ...s, variants: s.variants.filter((_, j) => j !== i), winner: s.winner === v.key ? "A" : s.winner })) : undefined}
        />
      ))}
      {f.variants.length < 3 && (
        <button
          type="button"
          className="btn small"
          style={{ justifySelf: "start" }}
          onClick={() => setF((s) => ({ ...s, variants: [...s.variants, { key: VARIANT_KEYS[s.variants.length], name: "", description: "", images: [] }] }))}
        >
          Agregar versión C
        </button>
      )}

      <fieldset>
        <legend>El resultado</legend>
        <div className="fr">
          <label className="fl">
            <span>Versión ganadora</span>
            <select id="winner" value={f.winner} onChange={(e) => set("winner", e.target.value)}>
              {f.variants.map((v) => (
                <option key={v.key}>{v.key}</option>
              ))}
            </select>
          </label>
          <label className="fl">
            <span>Métrica principal</span>
            <input id="metric" value={f.metric} onChange={(e) => set("metric", e.target.value)} placeholder="Compras" />
          </label>
          <label className="fl">
            <span>Lift (%)</span>
            <input id="lift" inputMode="decimal" value={f.lift} onChange={(e) => set("lift", e.target.value)} placeholder="2.59" />
          </label>
          <label className="fl">
            <span>Confianza (%)</span>
            <input id="confidence" inputMode="decimal" value={f.confidence} onChange={(e) => set("confidence", e.target.value)} placeholder="95" />
          </label>
        </div>
        <label className="fl">
          <span>Resumen del resultado</span>
          <textarea id="summary" value={f.summary} onChange={(e) => set("summary", e.target.value)} />
        </label>
        <label className="fl">
          <span>Lift por segmento</span>
          <small>Uno por línea, como «Mobile: 8.6».</small>
          <textarea id="segments" value={f.segments} onChange={(e) => set("segments", e.target.value)} />
        </label>
        <div className="fr">
          <label className="fl">
            <span>Aprendizajes, uno por línea</span>
            <textarea id="learnings" value={f.learnings} onChange={(e) => set("learnings", e.target.value)} />
          </label>
          <label className="fl">
            <span>Ideas para probar, una por línea</span>
            <textarea id="ideas" value={f.ideas} onChange={(e) => set("ideas", e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Fuente y publicación</legend>
        <div className="fr">
          <label className="fl">
            <span>Fuente</span>
            <input id="source_name" value={f.source_name} onChange={(e) => set("source_name", e.target.value)} placeholder="GuessTheTest, VWO, GoodUI…" />
          </label>
          <label className="fl">
            <span>URL de la fuente</span>
            <input id="source_url" value={f.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://" />
          </label>
          <label className="fl">
            <span>Herramienta de testing</span>
            <input id="tool" value={f.tool} onChange={(e) => set("tool", e.target.value)} />
          </label>
        </div>
        <div className="fr">
          <label className="fl">
            <span>Etiquetas, separadas por coma</span>
            <input id="tags" value={f.tags} onChange={(e) => set("tags", e.target.value)} />
          </label>
          <label className="fl">
            <span>URL del test</span>
            <small>Se genera a partir de la pregunta si la dejas vacía.</small>
            <input id="slug" value={f.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="empresa-tema" />
          </label>
          <label className="fl">
            <span>Estado</span>
            <select id="status" value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="borrador">Borrador (solo admins)</option>
              <option value="publicado">Publicado</option>
            </select>
          </label>
        </div>
      </fieldset>

      <div className="sticky-actions">
        <button className="btn primary" type="submit" disabled={Boolean(busy)}>
          {busy ?? (testId ? "Guardar cambios" : "Crear test")}
        </button>
        {f.slug && testId && (
          <a className="btn" href={`/tests/${f.slug}`} target="_blank" rel="noopener">
            Ver en el sitio
          </a>
        )}
      </div>
    </form>
  );
}

function VariantFields({
  v,
  index,
  onChange,
  onFiles,
  onRemove,
}: {
  v: FormVariant;
  index: number;
  onChange: (patch: Partial<FormVariant>) => void;
  onFiles: (files: FileList | File[]) => void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const move = (from: number, to: number) => {
    const list = [...v.images];
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    onChange({ images: list });
  };

  return (
    <fieldset className="variant" data-k={v.key} style={{ borderColor: "var(--vk)" }}>
      <legend style={{ color: "var(--vk)" }}>Versión {v.key}</legend>
      <label className="fl">
        <span>Nombre corto</span>
        <input id={`v${index}-name`} value={v.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Más rentables primero" />
      </label>
      <label className="fl">
        <span>Qué cambia en esta versión</span>
        <textarea id={`v${index}-description`} value={v.description} onChange={(e) => onChange({ description: e.target.value })} />
      </label>

      <div className="fl">
        <span>Capturas reales de esta versión</span>
        <small>La primera es la principal. Puedes arrastrar archivos, elegirlos o pegarlos con Ctrl+V / Cmd+V.</small>
        {v.images.length > 0 && (
          <div className="thumbs">
            {v.images.map((im, j) => (
              <div className="thumb" key={im.uid}>
                <div className="img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.preview} alt={`Captura ${j + 1} de la versión ${v.key}`} />
                </div>
                <select
                  aria-label="Tipo de captura"
                  value={LABELS.includes(im.label) ? im.label : "Desktop"}
                  onChange={(e) => onChange({ images: v.images.map((x) => (x.uid === im.uid ? { ...x, label: e.target.value } : x)) })}
                >
                  {LABELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <span className="label">
                  {im.width}×{im.height}
                  {im.file ? " · por subir" : ""}
                </span>
                <div className="row">
                  <button type="button" className="btn small" disabled={j === 0} onClick={() => move(j, j - 1)} aria-label="Mover antes">
                    ←
                  </button>
                  <button type="button" className="btn small" disabled={j === v.images.length - 1} onClick={() => move(j, j + 1)} aria-label="Mover después">
                    →
                  </button>
                  <button type="button" className="btn small danger" onClick={() => onChange({ images: v.images.filter((x) => x.uid !== im.uid) })}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div
          className={`drop${over ? " over" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.items)
              .map((it) => it.getAsFile())
              .filter((x): x is File => Boolean(x));
            if (files.length) {
              e.preventDefault();
              onFiles(files);
            }
          }}
        >
          Suelta aquí las capturas de la versión {v.key}, haz clic para elegirlas o pégalas
        </div>
        <input
          ref={input}
          id={`v${index}-files`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {onRemove && (
        <button type="button" className="btn small danger" style={{ justifySelf: "start" }} onClick={onRemove}>
          Quitar versión {v.key}
        </button>
      )}
    </fieldset>
  );
}
