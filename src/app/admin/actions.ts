"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/data";
import { IMAGE_BUCKET } from "@/lib/env";
import { slugify } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import { CATEGORIES, VARIANT_KEYS, type VariantKey } from "@/lib/types";

export type ImageInput = { id?: string; path: string; width: number; height: number; label: string };
export type VariantInput = { key: VariantKey; name: string; description: string; images: ImageInput[] };
export type TestInput = {
  id?: string;
  slug?: string;
  title: string;
  company: string;
  industry: string;
  country: string;
  category: string;
  device: string;
  tool: string;
  source_name: string;
  source_url: string;
  context: string;
  hypothesis: string;
  winner: string;
  metric: string;
  lift: string;
  confidence: string;
  summary: string;
  segments: string; // "Mobile: 8.6" por línea
  learnings: string; // uno por línea
  ideas: string;
  tags: string; // separadas por coma
  status: string;
  variants: VariantInput[];
};

export type SaveResult = { ok: true; id: string; slug: string } | { ok: false; error: string };

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const toNum = (s: string) => {
  const t = String(s ?? "").replace(",", ".").replace("%", "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function parseSegments(s: string) {
  return lines(s)
    .map((l) => l.match(/^(.*?)[:=]\s*([+-]?\d+(?:[.,]\d+)?)\s*%?$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ label: m[1].trim(), value: Number(m[2].replace(",", ".")) }));
}

export async function saveTest(input: TestInput): Promise<SaveResult> {
  if (!(await isAdmin())) return { ok: false, error: "Tu sesión no tiene permisos de administración." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Escribe la pregunta del test." };
  const variants = input.variants.slice(0, 3).map((v, i) => ({ ...v, key: VARIANT_KEYS[i] }));
  if (variants.length < 2) return { ok: false, error: "El test necesita al menos dos versiones." };
  // Ganadora vacía = resultado desconocido o no público (el test queda como catálogo, sin juego).
  const winner = input.winner.trim() === "" ? null : input.winner;
  if (winner !== null && !variants.some((v) => v.key === winner)) return { ok: false, error: "Elige cuál versión ganó." };
  const lift = toNum(input.lift);
  const confidence = toNum(input.confidence);
  if (Number.isNaN(lift)) return { ok: false, error: "El lift debe ser un número, por ejemplo 2.59 o -4." };
  if (Number.isNaN(confidence) || (confidence !== null && (confidence < 0 || confidence > 100)))
    return { ok: false, error: "La confianza debe ser un número entre 0 y 100." };
  const slug = slugify(input.slug?.trim() || title);
  if (!slug) return { ok: false, error: "No se pudo generar la URL del test a partir de la pregunta." };

  const row = {
    slug,
    title,
    company: input.company.trim() || null,
    industry: input.industry.trim() || null,
    country: input.country.trim() || null,
    category: (CATEGORIES as readonly string[]).includes(input.category) ? input.category : "Otro",
    device: ["Todos", "Desktop", "Mobile"].includes(input.device) ? input.device : "Todos",
    tool: input.tool.trim() || null,
    source_name: input.source_name.trim() || null,
    source_url: /^https?:\/\//i.test(input.source_url.trim()) ? input.source_url.trim() : null,
    context: input.context.trim() || null,
    hypothesis: input.hypothesis.trim() || null,
    winner,
    metric: input.metric.trim() || null,
    lift,
    confidence,
    summary: input.summary.trim() || null,
    segments: parseSegments(input.segments),
    learnings: lines(input.learnings),
    ideas: lines(input.ideas),
    tags: input.tags.split(",").map((t) => t.trim()).filter(Boolean),
    status: input.status === "publicado" ? "publicado" : "borrador",
  };

  const db = await supabaseServer();

  // 1. Test
  const saved = input.id
    ? await db.from("tests").update(row).eq("id", input.id).select("id, slug").single()
    : await db.from("tests").insert(row).select("id, slug").single();
  if (saved.error) {
    const dup = saved.error.code === "23505";
    return { ok: false, error: dup ? "Ya existe un test con esa URL. Cambia la pregunta o el campo URL." : saved.error.message };
  }
  const testId = saved.data.id as string;

  // 2. Versiones
  const { data: existingVariants } = await db.from("variants").select("id, key").eq("test_id", testId);
  const keep = new Set(variants.map((v) => v.key));
  const toRemove = (existingVariants ?? []).filter((v) => !keep.has(v.key as VariantKey));
  const removedPaths: string[] = [];
  if (toRemove.length) {
    const { data: imgs } = await db.from("variant_images").select("path").in("variant_id", toRemove.map((v) => v.id));
    removedPaths.push(...(imgs ?? []).map((i) => i.path));
    await db.from("variants").delete().in("id", toRemove.map((v) => v.id));
  }
  const up = await db
    .from("variants")
    .upsert(
      variants.map((v) => ({ test_id: testId, key: v.key, name: v.name.trim(), description: v.description.trim() })),
      { onConflict: "test_id,key" },
    )
    .select("id, key");
  if (up.error) return { ok: false, error: up.error.message };
  const variantId = Object.fromEntries((up.data ?? []).map((v) => [v.key, v.id as string]));

  // 3. Capturas: se reemplaza el conjunto de filas y se borran del storage las que ya no se usan
  const ids = Object.values(variantId);
  const { data: oldImgs } = await db.from("variant_images").select("id, path").in("variant_id", ids);
  const newPaths = new Set(variants.flatMap((v) => v.images.map((im) => im.path)));
  removedPaths.push(...(oldImgs ?? []).filter((im) => !newPaths.has(im.path)).map((im) => im.path));
  await db.from("variant_images").delete().in("variant_id", ids);
  const imageRows = variants.flatMap((v) =>
    v.images
      .filter((im) => im.path && im.width > 0 && im.height > 0)
      .map((im, sort) => ({
        variant_id: variantId[v.key],
        path: im.path,
        width: Math.round(im.width),
        height: Math.round(im.height),
        label: im.label?.trim() || "Desktop",
        sort,
      })),
  );
  if (imageRows.length) {
    const ins = await db.from("variant_images").insert(imageRows);
    if (ins.error) return { ok: false, error: ins.error.message };
  }
  if (removedPaths.length) await db.storage.from(IMAGE_BUCKET).remove(removedPaths);
  // quiz / encuesta / biblioteca según haya ganadora y capturas
  await db.rpc("refresh_play_modes", { p_test: testId });

  revalidatePath("/", "layout");
  return { ok: true, id: testId, slug: saved.data.slug as string };
}

export async function deleteTest(formData: FormData) {
  if (!(await isAdmin())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await supabaseServer();
  const { data: vars } = await db.from("variants").select("id").eq("test_id", id);
  if (vars?.length) {
    const { data: imgs } = await db.from("variant_images").select("path").in("variant_id", vars.map((v) => v.id));
    if (imgs?.length) await db.storage.from(IMAGE_BUCKET).remove(imgs.map((i) => i.path));
  }
  await db.from("tests").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/admin?borrado=1");
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  redirect("/");
}
