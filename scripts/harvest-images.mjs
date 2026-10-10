#!/usr/bin/env node
// Busca en la página de origen de cada caso las capturas de control y variación.
//
//   node scripts/harvest-images.mjs                 # casos con ganador y lift (win/loss)
//   node scripts/harvest-images.mjs --all           # los 620
//   node scripts/harvest-images.mjs --limit=20      # prueba
//
// Escribe `archivo/imagenes-casos.json`, que luego lee `import-archivo.mjs`.
// No descarga las imágenes: solo localiza las URL y decide qué es control y qué es variación.
//
// Reglas, en orden de prioridad, para clasificar cada imagen del artículo:
//   1. texto alternativo   («Control», «Variation»)
//   2. nombre del archivo  («HMOS-Original.png», «ENV_LE1.1_VarB.png»)
//   3. frase que la precede («This is what the variation looked like:»)
//
// Una página puede mostrar varios tests: si hay más de un par control/variación se elige el que
// corresponde a «Test N» del título cuando existe; si no, se usa el primero y el caso queda con
// confianza `media` (el importador lo marca para revisión).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const DIR = path.resolve(String(args.dir ?? "archivo"));
const CONCURRENCY = Number(args.concurrency ?? 6);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CONTROL = /\b(control|original|orginal|orig|baseline|existing|before|version[-_ ]?a|var(?:iation)?[-_ ]?a|current)\b|(?:^|[-_/])(?:\d)?(?:control|original|v?a)(?:[-_.\d]|$)/i;
const VARIATION = /\b(variation|variant|treatment|challenger|after|version[-_ ]?b|var(?:iation)?[-_ ]?[b2]|new)\b|(?:^|[-_/])(?:\d)?(?:variation|variant|var[-_]?[b2]|v?b)(?:[-_.\d]|$)/i;
// Imágenes que nunca son capturas del test.
const JUNK = /logo|avatar|icon|sprite|pixel|gravatar|flag|removebg|bird--|\.svg|\.gif(\?|$)|\?tr=w-\d+,h-\d+|\/tr:h-(?:40|50|80)\b|trees-full|cta-wave|headshot|author|favicon|og-image/i;

const strip = (h) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();

function role(alt, file, before) {
  const test = (re, s) => re.test(s ?? "");
  // Variación primero: «control and variation» no debe contar como control.
  for (const [s, kind] of [[alt, "alt"], [file, "file"]]) {
    if (!s) continue;
    const v = test(VARIATION, s);
    const c = test(CONTROL, s);
    if (v && !c) return { role: "variation", by: kind };
    if (c && !v) return { role: "control", by: kind };
    // «Control & Variation»: una sola imagen con las dos versiones una al lado de la otra.
    if (v && c) return { role: "composite", by: kind };
  }
  // «Test-1.1.png» / «Test-1.2.png»: el sufijo .1 es el control y el .2 la variación (convención de Wingify).
  const num = (file ?? "").match(/test[-_ ]?\d+[._-]([12])(?!\d)/i);
  if (num) return { role: num[1] === "1" ? "control" : "variation", by: "file-num" };
  const tail = (before ?? "").slice(-140).toLowerCase();
  const last = tail.match(/(control|original|variation|variant|version b|version a|treatment|challenger)[^.:]{0,70}:?\s*$/);
  if (last) return { role: /control|original|version a/.test(last[1]) ? "control" : "variation", by: "text" };
  return { role: null, by: null };
}

function extractImages(html, pageUrl) {
  const start = Math.max(0, html.search(/<article|<main/i));
  const body = html.slice(start).replace(/<footer[\s\S]*$/i, "");
  const out = [];
  const seen = new Set();
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (n) => tag.match(new RegExp(`\\b${n}=["']([^"']*)["']`, "i"))?.[1];
    let src = [attr("data-src"), attr("data-lazy-src"), attr("src")].find((s) => s && !s.startsWith("data:"));
    if (!src && attr("srcset")) src = attr("srcset").split(",")[0].trim().split(" ")[0];
    if (!src) continue;
    let url;
    try {
      url = new URL(src.replace(/&amp;/g, "&"), pageUrl);
    } catch {
      continue;
    }
    // ImageKit (Wingify): «/tr:h-0.5,w-0.5/» reduce la imagen; sin él se obtiene la original.
    url.pathname = url.pathname.replace(/\/tr:[^/]+/, "").replace(/\/{2,}/g, "/");
    const clean = url.toString();
    if (JUNK.test(clean) || JUNK.test(src) || seen.has(clean)) continue;
    // Se corta al llegar a la lista «otras historias»: sus miniaturas llevan tr:h-80.
    seen.add(clean);
    const alt = attr("alt") ?? "";
    const before = strip(body.slice(Math.max(0, m.index - 600), m.index));
    const file = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const r = role(alt, file, before);
    out.push({ url: clean, alt: alt.trim(), file, ...r, width: Number(attr("width")) || null });
  }
  return out;
}

/** Empareja control → variación en orden de aparición. */
function pairUp(images) {
  const pairs = [];
  let pendingControl = null;
  for (const im of images) {
    if (im.role === "control") pendingControl = im;
    else if (im.role === "variation" && pendingControl) {
      pairs.push({ control: pendingControl, variation: im });
      pendingControl = null;
    } else if (im.role === "variation" && !pairs.length && !pendingControl) pairs.push({ control: null, variation: im });
  }
  return pairs.filter((p) => p.control && p.variation);
}

function choosePair(pairs, title) {
  if (!pairs.length) return { pair: null, confidence: null };
  if (pairs.length === 1) return { pair: pairs[0], confidence: "alta" };
  const n = title.match(/\btest\s*#?\s*(\d)\b/i);
  if (n && pairs[Number(n[1]) - 1]) return { pair: pairs[Number(n[1]) - 1], confidence: "media" };
  return { pair: pairs[0], confidence: "media" };
}

async function fetchHtml(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
}

async function main() {
  const file = (await (await import("node:fs/promises")).readdir(DIR)).find((n) => /^Casos de A B testing.*\.json$/i.test(n));
  const cases = JSON.parse(await readFile(path.join(DIR, file), "utf8"));
  const todo = cases
    .filter((r) => args.all || (["win", "loss"].includes(r.outcome) && r.uplift_pct !== null && r.primary_metric))
    .filter((r) => /^https?:/.test(r.source_url ?? ""))
    .slice(0, LIMIT);

  const pages = new Map(); // url → Promise<imágenes> (varias filas comparten página)
  const result = {};
  let done = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const r = queue.shift();
        let entry;
        try {
          if (!pages.has(r.source_url)) pages.set(r.source_url, fetchHtml(r.source_url).then((h) => extractImages(h, r.source_url)));
          const images = await pages.get(r.source_url);
          const pairs = pairUp(images);
          const { pair, confidence } = choosePair(pairs, r.title ?? "");
          const composite = images.find((i) => i.role === "composite");
          entry = pair
            ? { status: "pareja", confidence, pairs: pairs.length, control: pair.control, variation: pair.variation }
            : composite
              ? { status: "compuesta", composite, candidates: images.length }
              : { status: images.some((i) => i.role) ? "incompleto" : "sin_clasificar", candidates: images.length, images: images.slice(0, 8) };
          if (pair && r.source_url && [...pages.keys()].length && sharedPage(todo, r.source_url) > 1) entry.shared_page = sharedPage(todo, r.source_url);
        } catch (e) {
          entry = { status: "error", error: String(e.message ?? e) };
        }
        result[r.case_id] = { source_url: r.source_url, title: r.title, ...entry };
        if (++done % 40 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
      }
    }),
  );

  const count = (f) => Object.values(result).filter(f).length;
  const summary = {
    generado: new Date().toISOString(),
    casos: todo.length,
    con_pareja: count((x) => x.status === "pareja"),
    confianza_alta: count((x) => x.confidence === "alta" && !x.shared_page),
    confianza_media: count((x) => x.confidence === "media"),
    pagina_compartida: count((x) => x.shared_page),
    compuesta: count((x) => x.status === "compuesta"),
    incompleto: count((x) => x.status === "incompleto"),
    sin_clasificar: count((x) => x.status === "sin_clasificar"),
    error: count((x) => x.status === "error"),
  };
  console.log(summary);
  await writeFile(path.join(DIR, "imagenes-casos.json"), JSON.stringify({ summary, casos: result }, null, 1));
  console.log(`Escrito ${path.join(DIR, "imagenes-casos.json")}`);
}

function sharedPage(todo, url) {
  return todo.filter((r) => r.source_url === url).length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
