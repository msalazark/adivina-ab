#!/usr/bin/env node
// Importa la carpeta `archivo/` a Supabase: tests, versiones A/B y capturas.
//
//   node --env-file=.env.local scripts/import-archivo.mjs --dry-run      # solo valida y cuenta
//   node --env-file=.env.local scripts/import-archivo.mjs                # importa como borradores
//   node --env-file=.env.local scripts/import-archivo.mjs --no-images    # sin descargar capturas
//
// Opciones:
//   --dir=archivo            carpeta con los archivos (por defecto ./archivo)
//   --only=casos|goodui      importa solo una de las dos fuentes
//   --only=jugables          solo los casos con ganador, lift y pareja de capturas válida (≈128)
//   --status=borrador        estado inicial (borrador | publicado). Por defecto borrador
//   --limit=N                procesa solo los primeros N de cada fuente (pruebas)
//   --concurrency=6          descargas de imágenes en paralelo
//   --dry-run                no escribe nada en Supabase ni descarga imágenes
//   --no-images              crea los tests sin capturas (se pueden completar volviendo a correr sin la opción)
//
// Es idempotente: cada test se identifica por `source_id` (AB-0001, GU-672). Lo que ya existe no se
// toca; si a un test existente le faltan capturas, se descargan al volver a correr.
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY).

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DIR = path.resolve(String(args.dir ?? "archivo"));
const DRY = Boolean(args["dry-run"]);
const WITH_IMAGES = !args["no-images"];
const STATUS = args.status === "publicado" ? "publicado" : "borrador";
const ONLY = args.only ? String(args.only) : null;
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const CONCURRENCY = Math.max(1, Number(args.concurrency ?? 6));
const BUCKET = "test-images";
const MAX_BYTES = 5 * 1024 * 1024; // límite del bucket
const MIN_WIDTH = 400; // por debajo suele ser una miniatura de la página de origen…
const MIN_TALL = 700; // …salvo las capturas móviles, estrechas pero altas

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}

/** CSV según RFC 4180 (comillas dobles, saltos de línea dentro de campos). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

function normDevice(s) {
  const t = (s ?? "").toLowerCase();
  const mobile = /mobile|phone|android|ios|app/.test(t);
  const desktop = /desktop|tablet|laptop/.test(t);
  if (mobile && !desktop) return "Mobile";
  if (desktop && !mobile) return "Desktop";
  return "Todos";
}

/** Primer patrón que coincida en `text` gana. */
function pickCategory(rules, text, fallback = "Otro") {
  for (const [re, cat] of rules) if (re.test(text)) return cat;
  return fallback;
}

const GOODUI_PATTERN_RULES = [
  [/testimonial|social counts|star ratings|company logos|trust seals|authority|authentic photos|guarantee/i, "Prueba social"],
  [/call to action|button|shortcut|action label|links or buttons|contrast links|hover/i, "CTA y botones"],
  [/form|field|label|natural language|steps|progressive|canned response|auto suggest|floating labels|coupon/i, "Formularios"],
  [/price|pricing|plans|payment|pay later|discount|shipping|unit prices|currency|what it's worth|expensive/i, "Precios"],
  [/headline|title|copy|vague or specific|empowering|more for less|problem-solution/i, "Copy y mensajes"],
  [/photo|image|video|zigzag|gallery|thumbnail|theme images|carousel/i, "Imágenes y video"],
  [/menu|navigation|search|filter|categories|list or grid|results|condensed list|tunnel|open in a new tab|infinite/i, "Navegación"],
];
const GOODUI_PAGE_RULES = [
  [/checkout|cart/i, "Checkout"],
  [/product/i, "Página de producto"],
  [/pricing/i, "Precios"],
  [/signup|thank you/i, "Onboarding"],
  [/home|landing/i, "Landing page"],
  [/listing|global/i, "Navegación"],
  [/content/i, "Copy y mensajes"],
];
const CASE_RULES = [
  [/checkout|cart|basket|payment|billing|mini[- ]?cart/i, "Checkout"],
  [/pricing|plans? page|subscription|paywall/i, "Precios"],
  [/push|notification|e-?mail|newsletter/i, "Email"],
  [/onboarding|activation|first experience/i, "Onboarding"],
  [/form|registration|sign-?up|lead|quote|booking|enquiry|application/i, "Formularios"],
  [/product (detail )?page|pdp|product pages?|buy box/i, "Página de producto"],
  [/navigation|menu|filter|search|category|listing|plp|collection/i, "Navegación"],
  [/landing|homepage|home page|hero|banner/i, "Landing page"],
  [/cta|button|call[- ]to[- ]action/i, "CTA y botones"],
  [/testimonial|social proof|review|trust|badge/i, "Prueba social"],
  [/image|video|photo/i, "Imágenes y video"],
  [/headline|copy|message|wording|text/i, "Copy y mensajes"],
];

/** "Sep 30, 2026" → "2026-09-30" */
function parseDate(s) {
  const t = clean(s);
  if (!t) return null;
  const d = new Date(`${t} UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const numOrNull = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// Casos con resultado (JSON) → tests
// ---------------------------------------------------------------------------
const WINNER_WORDS = /\b(won|wins?|winning|winner|outperform\w*|beat|beats|beating)\b/i;
const RESULT_PERCENT = /\d+(?:\.\d+)?\s?%.*\b(increas|improv|lift|uplift|boost|generat|more|higher)/i;
const TITLE_LEAK = /\d+(?:\.\d+)?\s?%|\b(increas\w*|boost\w*|lift\w*|improv\w*|drives?|drove|uplift|wins?|won|outperform\w*|scores? big)\b/i;
const CONTROL_WON = /\b(original|control|existing|traditional|baseline)\b[^.]{0,80}\b(outperform\w*|beat|won|better|more|higher)\b/i;

/** Quita de la descripción de la variación las frases que cuentan el resultado: se verían antes de votar. */
function splitChange(change) {
  const text = clean(change);
  if (!text) return { visible: null, leaked: null };
  const sentences = text.split(/(?<=[.!?])\s+/);
  const keep = [];
  const leak = [];
  for (const s of sentences) (WINNER_WORDS.test(s) || RESULT_PERCENT.test(s) ? leak : keep).push(s);
  return { visible: keep.join(" ") || null, leaked: leak.length ? leak.join(" ") : null };
}

function confidenceFrom(significance) {
  const t = clean(significance);
  if (!t || !/confiden|signific|chance|probab|certain|validity/i.test(t)) return null;
  const m = [...t.matchAll(/(\d{2,3}(?:\.\d+)?)\s*\+?\s*%/g)];
  if (m.length !== 1) return null; // varias cifras = ambiguo, mejor no inventar
  const n = Number(m[0][1]);
  return n >= 50 && n <= 100 ? n : null;
}

/** Capturas halladas por scripts/harvest-images.mjs en la página de origen de cada caso. */
let HARVEST = {};
/** Títulos neutrales en español (archivo/titulos-es.json): los originales a menudo cuentan el resultado. */
let TITLES = {};

function mapCase(r) {
  const originalTitle = clean(r.title) ?? r.case_id;
  const title = TITLES[r.case_id] ?? originalTitle;
  const flags = [];
  const { visible, leaked } = splitChange(r.change_tested);
  const resultsText = clean(r.results);

  // Ganadora: solo se infiere de `outcome`; queda marcada para revisión humana.
  let winner = null;
  if (r.outcome === "win") winner = "B";
  else if (r.outcome === "loss") winner = "A";
  if (winner) flags.push("winner_inferred");
  if (r.outcome === "win" && CONTROL_WON.test(`${resultsText ?? ""}`)) flags.push("control_may_have_won");
  if (TITLE_LEAK.test(title)) flags.push("title_may_leak_result");
  if (TITLES[r.case_id]) flags.push("title_rewritten");
  if (!visible) flags.push("variant_description_missing");
  if (!r.change_tested) flags.push("no_change_described");

  // Algunas filas de Design My Experiment usan `hypothesis` para el objetivo (Monetization, Retention…).
  let hypothesis = clean(r.hypothesis);
  const tags = (clean(r.tags) ?? "").split(/[\s,]+/).filter(Boolean);
  if (hypothesis && /^[A-Za-z]+$/.test(hypothesis)) {
    tags.push(`objetivo-${hypothesis.toLowerCase()}`);
    hypothesis = null;
  }
  if (r.outcome === "unknown" || r.outcome === "flat" || r.outcome === "mixed") flags.push(`outcome_${r.outcome}`);

  // Capturas de la página de origen: solo parejas control/variación sin ambigüedad de página.
  const h = HARVEST[r.case_id];
  const harvested = h?.status === "pareja" && !h.shared_page ? h : null;
  if (harvested) {
    flags.push("images_from_source_page");
    if (h.confidence === "media") flags.push("images_multiple_tests");
  } else if (h?.status === "compuesta") flags.push("images_composite_only");
  else if (h?.shared_page) flags.push("images_shared_page");

  const source = clean(r.source);
  const original = clean(r.original_source);
  const summaryParts = [];
  if (leaked) summaryParts.push(`Cambio probado: ${leaked}`);
  if (resultsText) summaryParts.push(resultsText);

  return {
    source_id: r.case_id,
    key: "casos",
    dedupe: `${(clean(r.company) ?? "").toLowerCase()}|${title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
    test: {
      slug: slugify(`${r.case_id}-${title}`),
      title,
      company: clean(r.company),
      industry: clean(r.industry),
      country: clean(r.country),
      // Primero el tipo de página declarado; el título solo desempata (si no, «add-to-cart» cae en Checkout).
      category: pickCategory(CASE_RULES, r.page_type ?? "", pickCategory(CASE_RULES, title)),
      device: normDevice(r.device),
      tool: null,
      source_name: original ? `${source} · ${original}` : source,
      source_url: /^https?:\/\//i.test(r.source_url ?? "") ? r.source_url : null,
      context: null,
      hypothesis,
      winner,
      metric: clean(r.primary_metric),
      lift: typeof r.uplift_pct === "number" ? r.uplift_pct : numOrNull(r.uplift_pct),
      confidence: confidenceFrom(r.significance),
      summary: summaryParts.join("\n\n") || null,
      segments: [],
      learnings: (clean(r.takeaways) ?? "").split(" | ").map((s) => s.trim()).filter(Boolean),
      ideas: [],
      tags: [...new Set(tags)],
      status: STATUS,
      page_type: clean(r.page_type),
      sample_size: clean(r.sample_size),
      duration: clean(r.duration),
      significance: clean(r.significance),
      revenue_impact: clean(r.revenue_impact),
      outcome: r.outcome ?? null,
      test_year: r.year ? Math.round(Number(r.year)) : null,
      results_locked: false,
      doc_quality: r.doc_quality ?? null,
      review_flags: flags,
      raw: r,
    },
    variants: [
      { key: "A", name: "Control", description: "Versión original, sin el cambio que se probó.", images: harvested?.control ? [{ url: harvested.control.url, label: "Captura" }] : [] },
      { key: "B", name: "Variación", description: visible ?? "El cambio probado se describe junto con el resultado.", images: harvested?.variation ? [{ url: harvested.variation.url, label: "Captura" }] : [] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Catálogo GoodUI (CSV) → tests con imágenes, sin resultado
// ---------------------------------------------------------------------------
function mapGoodUi(r) {
  const device = normDevice(r.device);
  const company = clean(r.company);
  const pattern = clean(r.pattern_name);
  const title = [pattern ?? "Test A/B", company ? `en ${company}` : null, device !== "Todos" ? `(${device})` : null]
    .filter(Boolean)
    .join(" ");
  const label = device === "Todos" ? "Captura" : device;
  const tags = [pattern, clean(r.page_type)].filter(Boolean);

  return {
    source_id: r.case_id,
    key: "goodui",
    dedupe: null,
    test: {
      slug: slugify(`${r.case_id}-${title}`),
      title,
      company,
      industry: null,
      country: null,
      category: pickCategory(GOODUI_PATTERN_RULES, pattern ?? "", pickCategory(GOODUI_PAGE_RULES, r.page_type ?? "")),
      device,
      tool: null,
      source_name: "GoodUI",
      source_url: /^https?:\/\//i.test(r.source_url ?? "") ? r.source_url : null,
      context: clean(r.change_tested),
      hypothesis: null,
      winner: null,
      metric: clean(r.primary_metric),
      lift: null,
      confidence: null,
      summary: null,
      segments: [],
      learnings: [],
      ideas: [],
      tags,
      status: STATUS,
      page_type: clean(r.page_type),
      pattern,
      pattern_number: numOrNull(r.pattern_number),
      author: clean(r.author),
      tested_on: parseDate(r.date),
      sample_size: numOrNull(r.sample_size) !== null ? String(Math.round(numOrNull(r.sample_size))) : null,
      power_5pct: numOrNull(r.power_5pct_mde),
      outcome: null,
      results_locked: /^no\b/i.test(r.results_visible ?? ""),
      review_flags: [],
      raw: r,
    },
    variants: [
      { key: "A", name: "Control", description: "", images: r.image_a ? [{ url: r.image_a, label }] : [] },
      { key: "B", name: "Variación", description: "", images: r.image_b ? [{ url: r.image_b, label }] : [] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------
/** Ancho y alto sin dependencias (JPEG, PNG, GIF, WebP). */
function imageSize(buf) {
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { type: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.toString("ascii", 0, 3) === "GIF") {
    return { type: "image/gif", ext: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { type: "image/webp", ext: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { type: "image/webp", ext: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { type: "image/webp", ext: "webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function download(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "adivina-ab-importer/1.0" } });
      if (res.status === 404) throw Object.assign(new Error("404"), { notFound: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      if (e.notFound) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Para miniaturas (`_athumb`) intenta primero la versión `_afull` de la misma captura. */
async function fetchImage(url) {
  const candidates = /_([ab])thumb(-\d+)?\.(jpg|png)$/i.test(url) ? [url.replace(/_([ab])thumb/i, "_$1full"), url] : [url];
  let err;
  for (const u of candidates) {
    try {
      const buf = await download(u);
      if (buf.length > MAX_BYTES) throw new Error(`pesa ${(buf.length / 1048576).toFixed(1)} MB (máx. 5 MB)`);
      const size = imageSize(buf);
      if (!size || !(size.width > 0 && size.height > 0)) throw new Error("no se pudo leer el tamaño de la imagen");
      return { buf, ...size, usedUrl: u, thumbnail: u !== candidates[0] || /thumb/i.test(u) };
    } catch (e) {
      err = e;
    }
  }
  throw err;
}

async function pool(items, size, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------
async function loadSources() {
  const names = await readdir(DIR);
  const find = (re) => names.find((n) => re.test(n.normalize("NFC")));
  const out = [];

  const casosFile = find(/^Casos de A B testing.*\.json$/i);
  if (casosFile && ONLY !== "goodui") {
    const data = JSON.parse(await readFile(path.join(DIR, casosFile), "utf8"));
    const manifest = names.find((n) => n === "imagenes-casos.json");
    const titles = names.find((n) => n === "titulos-es.json");
    if (titles) TITLES = JSON.parse(await readFile(path.join(DIR, titles), "utf8"));
    if (manifest) HARVEST = JSON.parse(await readFile(path.join(DIR, manifest), "utf8")).casos ?? {};
    const mapped = data.map(mapCase);
    // «jugables»: ganador conocido, lift, métrica y una pareja control/variación hallada en su página.
    const keep = (it) => it.test.winner && it.test.lift !== null && it.test.metric && it.variants.every((v) => v.images.length);
    out.push(...(ONLY === "jugables" ? mapped.filter(keep) : mapped).slice(0, LIMIT));
  }
  const goodFile = find(/^Cat.logo de tests GoodUI.*\.csv$/i);
  if (goodFile && ONLY !== "casos" && ONLY !== "jugables") {
    const rows = parseCsv(await readFile(path.join(DIR, goodFile), "utf8"));
    // De más antiguo a más nuevo, como el resto del archivo.
    rows.sort((a, b) => Number(a.case_id.replace(/\D/g, "")) - Number(b.case_id.replace(/\D/g, "")));
    out.push(...rows.slice(0, LIMIT).map(mapGoodUi));
  }
  if (!out.length) throw new Error(`No encontré archivos de casos en ${DIR}`);
  return out;
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------
async function main() {
  const all = await loadSources();

  // Duplicados dentro de la misma fuente (mismo caso publicado dos veces): se importa el primero.
  const seen = new Map();
  const duplicates = [];
  let items = [];
  const slugs = new Set();
  for (const it of all) {
    if (it.dedupe) {
      const first = seen.get(it.dedupe);
      if (first) {
        duplicates.push({ source_id: it.source_id, duplicate_of: first });
        continue;
      }
      seen.set(it.dedupe, it.source_id);
    }
    // Las URL deben ser únicas.
    let slug = it.test.slug || slugify(it.source_id);
    if (slugs.has(slug)) slug = `${slug}-${it.source_id.toLowerCase()}`.slice(0, 90);
    slugs.add(slug);
    it.test.slug = slug;
    it.test.source_id = it.source_id;
    items.push(it);
  }

  const report = { dryRun: DRY, status: STATUS, total: items.length, duplicates, created: 0, existing: 0, images: { ok: 0, failed: [], thumbnails: [] } };
  const stats = {
    porFuente: Object.fromEntries([...new Set(items.map((i) => i.key))].map((k) => [k, items.filter((i) => i.key === k).length])),
    conImagenes: items.filter((i) => i.variants.some((v) => v.images.length)).length,
    imagenesTotales: items.reduce((n, i) => n + i.variants.reduce((m, v) => m + v.images.length, 0), 0),
    conGanadora: items.filter((i) => i.test.winner).length,
    sinGanadora: items.filter((i) => !i.test.winner).length,
    categorias: Object.fromEntries(
      Object.entries(
        items.reduce((acc, i) => ((acc[i.test.category] = (acc[i.test.category] ?? 0) + 1), acc), {}),
      ).sort((a, b) => b[1] - a[1]),
    ),
    avisos: items.reduce((acc, i) => (i.test.review_flags.forEach((f) => (acc[f] = (acc[f] ?? 0) + 1)), acc), {}),
  };
  console.log("\nLo que se importaría:");
  console.log(JSON.stringify({ ...stats, duplicadosOmitidos: duplicates.length }, null, 2));

  if (DRY) {
    const sample = items.find((i) => i.key === "casos") ?? items[0];
    console.log("\nEjemplo (primer caso):\n", JSON.stringify({ test: { ...sample.test, raw: "…" }, variants: sample.variants }, null, 2));
    await writeFile("import-report.json", JSON.stringify({ ...report, stats }, null, 2));
    console.log("\nSimulación terminada. Informe en import-report.json");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY. Corre con --env-file=.env.local");
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 0. Parejas de las páginas de origen: se validan juntas (ambas descargan y no son miniaturas)
  //    antes de crear nada. Si una falla se descartan las dos y el test queda sin capturas.
  if (WITH_IMAGES) {
    const withPairs = items.filter((i) => i.key === "casos" && i.variants.every((v) => v.images.length));
    console.log(`\nValidando ${withPairs.length} parejas de capturas halladas en las páginas de origen…`);
    await pool(withPairs, CONCURRENCY, async (it) => {
      try {
        const got = await Promise.all(it.variants.map((v) => fetchImage(v.images[0].url)));
        const small = got.find((g) => g.width < MIN_WIDTH && g.height < MIN_TALL);
        if (small) throw new Error(`captura demasiado pequeña (${small.width}×${small.height}px)`);
        it.variants.forEach((v, i) => (v.images[0].got = got[i]));
      } catch (e) {
        it.variants.forEach((v) => (v.images = []));
        it.test.review_flags.push("images_discarded");
        report.images.failed.push({ source_id: it.source_id, error: `pareja descartada: ${e.message ?? e}` });
      }
    });
    console.log(`  parejas válidas: ${withPairs.filter((i) => i.variants[0].images.length).length}/${withPairs.length}`);
    // En modo «jugables» un test sin su pareja de capturas no se crea.
    if (ONLY === "jugables") items = items.filter((i) => i.variants.every((v) => v.images.length));
  }

  // 1. ¿Cuáles ya existen?
  const existing = new Map(); // source_id → test id
  for (let i = 0; i < items.length; i += 200) {
    const ids = items.slice(i, i + 200).map((x) => x.source_id);
    const { data, error } = await db.from("tests").select("id, source_id").in("source_id", ids);
    if (error) throw new Error(`Leyendo tests existentes: ${error.message}`);
    for (const r of data) existing.set(r.source_id, r.id);
  }
  const fresh = items.filter((i) => !existing.has(i.source_id));
  report.existing = items.length - fresh.length;
  console.log(`\n${fresh.length} tests nuevos, ${report.existing} ya existían.`);

  // 2. Tests nuevos (created_at escalonado para conservar el orden de numeración)
  const base = Date.now() - fresh.length * 10;
  const testId = new Map(existing);
  // Lotes homogéneos (misma fuente = mismas columnas) para que PostgREST no rellene con null lo que falte.
  const batches = [];
  for (const src of [...new Set(fresh.map((x) => x.key))]) {
    const group = fresh.filter((x) => x.key === src);
    for (let i = 0; i < group.length; i += 100) batches.push(group.slice(i, i + 100));
  }
  let inserted = 0;
  for (const chunk of batches) {
    const rows = chunk.map((it) => ({ ...it.test, created_at: new Date(base + fresh.indexOf(it) * 10).toISOString() }));
    const { data, error } = await db.from("tests").insert(rows).select("id, source_id");
    if (error) throw new Error(`Insertando tests (${chunk[0].source_id}…): ${error.message}`);
    for (const r of data) testId.set(r.source_id, r.id);
    inserted += chunk.length;
    console.log(`  tests ${inserted}/${fresh.length}`);
  }
  report.created = fresh.length;

  // 3. Versiones (las de tests nuevos). Las de tests existentes ya están.
  const variantId = new Map(); // `${source_id}:${key}` → id
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    const rows = chunk.flatMap((it) =>
      it.variants.map((v) => ({ test_id: testId.get(it.source_id), key: v.key, name: v.name, description: v.description })),
    );
    const { data, error } = await db.from("variants").insert(rows).select("id, test_id, key");
    if (error) throw new Error(`Insertando versiones: ${error.message}`);
    const bySource = new Map(chunk.map((it) => [testId.get(it.source_id), it.source_id]));
    for (const r of data) variantId.set(`${bySource.get(r.test_id)}:${r.key}`, r.id);
  }

  // 4. Capturas: nuevas y, si faltan, también de tests que ya existían
  if (WITH_IMAGES) {
    const withImages = items.filter((it) => it.variants.some((v) => v.images.length));
    const missing = [];
    for (const it of withImages) {
      if (!existing.has(it.source_id)) {
        for (const v of it.variants) if (v.images.length) missing.push({ it, v });
        continue;
      }
      const { data } = await db.from("variants").select("id, key, variant_images(id)").eq("test_id", existing.get(it.source_id));
      for (const row of data ?? []) {
        variantId.set(`${it.source_id}:${row.key}`, row.id);
        const v = it.variants.find((x) => x.key === row.key);
        if (v?.images.length && !(row.variant_images ?? []).length) missing.push({ it, v });
      }
    }
    console.log(`\nDescargando capturas de ${missing.length} versiones…`);

    let done = 0;
    await pool(missing, CONCURRENCY, async ({ it, v }) => {
      const vid = variantId.get(`${it.source_id}:${v.key}`);
      const rows = [];
      for (const [sort, im] of v.images.entries()) {
        try {
          const got = im.got ?? (await fetchImage(im.url));
          const objectPath = `import/${it.source_id.toLowerCase()}/${v.key.toLowerCase()}-${sort + 1}.${got.ext}`;
          const up = await db.storage.from(BUCKET).upload(objectPath, got.buf, { contentType: got.type, upsert: true });
          if (up.error) throw new Error(up.error.message);
          rows.push({ variant_id: vid, path: objectPath, width: got.width, height: got.height, label: im.label, sort, source_url: got.usedUrl });
          report.images.ok++;
          if (got.thumbnail) report.images.thumbnails.push(it.source_id);
        } catch (e) {
          report.images.failed.push({ source_id: it.source_id, key: v.key, url: im.url, error: String(e.message ?? e) });
        }
      }
      if (rows.length) {
        const { error } = await db.from("variant_images").insert(rows);
        if (error) report.images.failed.push({ source_id: it.source_id, key: v.key, error: `variant_images: ${error.message}` });
      }
      if (++done % 25 === 0 || done === missing.length) console.log(`  versiones ${done}/${missing.length} · capturas ok ${report.images.ok} · fallidas ${report.images.failed.length}`);
    });
  }

  await writeFile("import-report.json", JSON.stringify({ ...report, stats }, null, 2));
  console.log(
    `\nListo. Tests nuevos: ${report.created}. Capturas: ${report.images.ok} ok, ${report.images.failed.length} fallidas, ` +
      `${report.images.thumbnails.length} solo en miniatura. Informe en import-report.json`,
  );
  if (report.images.failed.length) console.log("Vuelve a correr el script para reintentar las capturas que faltan.");
}

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
