import Link from "next/link";
import { notFound } from "next/navigation";
import TestForm, { type FormState } from "@/components/admin/TestForm";
import { getTestById } from "@/lib/data";
import { publicImageUrl } from "@/lib/env";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> };

export default async function EditTest({ params, searchParams }: Props) {
  const { id } = await params;
  const { creado } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTestById(id);
  if (!t) notFound();

  const initial: FormState = {
    title: t.title,
    slug: t.slug,
    company: t.company ?? "",
    industry: t.industry ?? "",
    country: t.country ?? "",
    category: t.category,
    device: t.device,
    tool: t.tool ?? "",
    source_name: t.source_name ?? "",
    source_url: t.source_url ?? "",
    context: t.context ?? "",
    hypothesis: t.hypothesis ?? "",
    winner: t.winner,
    metric: t.metric ?? "",
    lift: t.lift === null ? "" : String(t.lift),
    confidence: t.confidence === null ? "" : String(t.confidence),
    summary: t.summary ?? "",
    segments: t.segments.map((s) => `${s.label}: ${s.value}`).join("\n"),
    learnings: t.learnings.join("\n"),
    ideas: t.ideas.join("\n"),
    tags: t.tags.join(", "),
    status: t.status,
    variants: t.variants.map((v) => ({
      key: v.key,
      name: v.name,
      description: v.description,
      images: v.images.map((im) => ({ uid: im.id, path: im.path, preview: publicImageUrl(im.path), width: im.width, height: im.height, label: im.label })),
    })),
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-head">
        <div>
          <span className="label">{t.status === "publicado" ? "Publicado" : "Borrador"}</span>
          <h1 style={{ fontSize: "1.8rem" }}>Editar test</h1>
        </div>
        <Link className="btn small" href="/admin">
          Volver a la lista
        </Link>
      </div>
      {creado && <p className="msg ok">Test creado. Puedes seguir editándolo o publicarlo cuando esté listo.</p>}
      <TestForm initial={initial} testId={t.id} />
    </div>
  );
}
