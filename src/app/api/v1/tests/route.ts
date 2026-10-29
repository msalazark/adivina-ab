// Carga de tests por API.
//
//   POST /api/v1/tests      crea un test (borrador por defecto) con sus versiones y capturas
//   GET  /api/v1/tests?source_id_prefix=GTT-   lista los source_id ya cargados (para no reenviar)
//
// Autenticación: `Authorization: Bearer <token>` (tokens creados en /admin/tokens).
// Idempotente por `source_id`: si ya existe, no se toca y responde { created: false }.
// Las capturas se envían como URL https; el servidor las descarga y las sube al bucket.

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { verifyBearer } from "@/lib/api-tokens";
import { IMAGE_BUCKET } from "@/lib/env";
import { slugify } from "@/lib/format";
import { imageSize } from "@/lib/image-size";
import { supabaseService } from "@/lib/supabase/server";
import { CATEGORIES, VARIANT_KEYS } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // límite del bucket
const LOW_RES_WIDTH = 400;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type ImageIn = { url: string; label?: string };
type VariantIn = { key?: string; name?: string; description?: string; images?: ImageIn[] };
type TestIn = {
  source_id: string;
  title: string;
  company?: string;
  industry?: string;
  country?: string;
  category?: string;
  device?: string;
  tool?: string;
  source_name?: string;
  source_url?: string;
  context?: string;
  hypothesis?: string;
  winner?: string | null;
  metric?: string;
  lift?: number | null;
  confidence?: number | null;
  summary?: string;
  learnings?: string[];
  ideas?: string[];
  tags?: string[];
  status?: string;
  outcome?: string;
  results_locked?: boolean;
  tested_on?: string;
  review_flags?: string[];
  raw?: unknown;
  variants: VariantIn[];
};

const str = (v: unknown, max = 4000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 1000)).filter((x): x is string => Boolean(x)) : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

async function fetchImage(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("solo se aceptan URLs https");
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "adivina-ab-api/1.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error(`pesa ${(len / 1048576).toFixed(1)} MB (máx. 5 MB)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`pesa ${(buf.length / 1048576).toFixed(1)} MB (máx. 5 MB)`);
  const info = imageSize(buf);
  if (!info || !ALLOWED_TYPES.has(info.type) || !(info.width > 0 && info.height > 0)) throw new Error("no es una imagen PNG/JPG/WebP/GIF legible");
  return { buf, ...info };
}

export async function GET(request: NextRequest) {
  if (!(await verifyBearer(request.headers.get("authorization")))) return bad("Token inválido o revocado.", 401);
  const prefix = request.nextUrl.searchParams.get("source_id_prefix") ?? "";
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(prefix)) return bad("Indica source_id_prefix (letras, números, - o _).");
  const { data, error } = await supabaseService()
    .from("tests")
    .select("source_id")
    .like("source_id", `${prefix}%`)
    .order("source_id")
    .limit(5000);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true, source_ids: (data ?? []).map((r) => r.source_id) });
}

export async function POST(request: NextRequest) {
  const token = await verifyBearer(request.headers.get("authorization"));
  if (!token) return bad("Token inválido o revocado.", 401);

  let body: TestIn;
  try {
    body = (await request.json()) as TestIn;
  } catch {
    return bad("El cuerpo debe ser JSON.");
  }

  const sourceId = str(body.source_id, 80);
  if (!sourceId || !/^[A-Za-z0-9_.:-]+$/.test(sourceId)) return bad("source_id es obligatorio (letras, números, . : - _).");
  const title = str(body.title, 300);
  if (!title) return bad("title es obligatorio.");
  const variantsIn = Array.isArray(body.variants) ? body.variants.slice(0, 3) : [];
  if (variantsIn.length < 2) return bad("Se necesitan al menos dos versiones en variants.");
  const variants = variantsIn.map((v, i) => ({
    key: VARIANT_KEYS[i],
    name: str(v.name, 200) ?? "",
    description: str(v.description, 2000) ?? "",
    images: (Array.isArray(v.images) ? v.images : []).slice(0, 4).filter((im) => typeof im?.url === "string"),
  }));
  const winner = typeof body.winner === "string" && variants.some((v) => v.key === body.winner) ? body.winner : null;
  const confidence = num(body.confidence);
  if (confidence !== null && (confidence < 0 || confidence > 100)) return bad("confidence debe estar entre 0 y 100.");
  const outcome = ["win", "loss", "mixed", "flat", "unknown"].includes(String(body.outcome)) ? body.outcome : winner ? null : "unknown";

  const db = supabaseService();

  // Idempotencia
  const existing = await db.from("tests").select("id, slug, play_mode").eq("source_id", sourceId).maybeSingle();
  if (existing.data) return NextResponse.json({ ok: true, created: false, ...existing.data });

  const baseSlug = slugify(title) || slugify(sourceId);
  const row = {
    source_id: sourceId,
    title,
    company: str(body.company, 200),
    industry: str(body.industry, 200),
    country: str(body.country, 100),
    category: (CATEGORIES as readonly string[]).includes(String(body.category)) ? body.category : "Otro",
    device: ["Todos", "Desktop", "Mobile"].includes(String(body.device)) ? body.device : "Todos",
    tool: str(body.tool, 200),
    source_name: str(body.source_name, 200),
    source_url: /^https?:\/\//i.test(String(body.source_url ?? "")) ? String(body.source_url).trim() : null,
    context: str(body.context),
    hypothesis: str(body.hypothesis),
    winner,
    metric: str(body.metric, 200),
    lift: num(body.lift),
    confidence,
    summary: str(body.summary),
    learnings: strList(body.learnings),
    ideas: strList(body.ideas),
    tags: strList(body.tags).slice(0, 20),
    status: body.status === "publicado" ? "publicado" : "borrador",
    outcome,
    results_locked: Boolean(body.results_locked),
    tested_on: /^\d{4}-\d{2}-\d{2}$/.test(String(body.tested_on ?? "")) ? body.tested_on : null,
    review_flags: [...strList(body.review_flags), `api:${token.name}`.slice(0, 60)],
    raw: body.raw ?? null,
  };

  // 1. Test (si el slug choca, se le agrega un sufijo)
  let inserted: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug.slice(0, 62)}-${randomUUID().slice(0, 6)}`;
    const ins = await db.from("tests").insert({ ...row, slug }).select("id, slug").single();
    if (!ins.error) inserted = ins.data as { id: string; slug: string };
    else if (ins.error.code !== "23505") return bad(ins.error.message, 500);
    else if (String(ins.error.message).includes("source_id")) {
      const again = await db.from("tests").select("id, slug, play_mode").eq("source_id", sourceId).single();
      return NextResponse.json({ ok: true, created: false, ...again.data });
    }
  }
  if (!inserted) return bad("No se pudo generar una URL única para el test.", 500);

  // 2. Versiones
  const vIns = await db
    .from("variants")
    .insert(variants.map((v) => ({ test_id: inserted.id, key: v.key, name: v.name, description: v.description })))
    .select("id, key");
  if (vIns.error) {
    await db.from("tests").delete().eq("id", inserted.id);
    return bad(`variants: ${vIns.error.message}`, 500);
  }
  const variantId = Object.fromEntries((vIns.data ?? []).map((v) => [v.key, v.id as string]));

  // 3. Capturas: se descargan en el servidor y se suben al bucket
  const imageErrors: { key: string; url: string; error: string }[] = [];
  const flags = new Set<string>();
  let uploaded = 0;
  await Promise.all(
    variants.map(async (v) => {
      const rows: Record<string, unknown>[] = [];
      for (const [sort, im] of v.images.entries()) {
        try {
          const got = await fetchImage(im.url);
          const path = `tests/${randomUUID()}.${got.ext}`;
          const up = await db.storage.from(IMAGE_BUCKET).upload(path, got.buf, { contentType: got.type, cacheControl: "31536000", upsert: false });
          if (up.error) throw new Error(up.error.message);
          if (got.width < LOW_RES_WIDTH) flags.add("images_low_res");
          rows.push({
            variant_id: variantId[v.key],
            path,
            width: got.width,
            height: got.height,
            label: str(im.label, 40) ?? (row.device === "Mobile" ? "Mobile" : "Desktop"),
            sort,
            source_url: im.url,
          });
        } catch (e) {
          imageErrors.push({ key: v.key, url: im.url, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (rows.length) {
        const r = await db.from("variant_images").insert(rows);
        if (r.error) imageErrors.push({ key: v.key, url: "*", error: `variant_images: ${r.error.message}` });
        else uploaded += rows.length;
      }
    }),
  );
  if (imageErrors.length) flags.add("images_failed");
  if (flags.size) await db.from("tests").update({ review_flags: [...row.review_flags, ...flags] }).eq("id", inserted.id);

  // quiz / encuesta / biblioteca según haya ganadora y capturas
  await db.rpc("refresh_play_modes", { p_test: inserted.id });
  const final = await db.from("tests").select("play_mode, status").eq("id", inserted.id).single();
  if (row.status === "publicado") revalidatePath("/", "layout");

  return NextResponse.json(
    { ok: true, created: true, id: inserted.id, slug: inserted.slug, ...final.data, images_uploaded: uploaded, image_errors: imageErrors },
    { status: 201 },
  );
}
