#!/usr/bin/env node
// Carga las estimaciones de Claude (archivo/veredictos-claude.json) en Supabase.
//
//   node --env-file=.env.local scripts/load-ai-verdicts.mjs --dry-run
//   node --env-file=.env.local scripts/load-ai-verdicts.mjs
//
// Formato del archivo:
//   { "model": "claude-sonnet-5-5", "generated_at": "2026-10-11", "verdicts": {
//       "GU-672": { "winner": "B", "confidence": "media", "rationale": "…", "criteria": ["Fricción", …] } } }
//
// Solo escribe columnas ai_*: nunca toca `winner` (el resultado oficial).

import { readFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const DRY = Boolean(args["dry-run"]);
const file = path.resolve(String(args.file ?? "archivo/veredictos-claude.json"));

const data = JSON.parse(await readFile(file, "utf8"));
const entries = Object.entries(data.verdicts ?? {});
const bad = [];
for (const [id, v] of entries) {
  if (!["A", "B", "C"].includes(v.winner)) bad.push(`${id}: winner inválido`);
  if (!["alta", "media", "baja"].includes(v.confidence)) bad.push(`${id}: confianza inválida`);
  if (!v.rationale || v.rationale.trim().length < 20) bad.push(`${id}: explicación vacía o muy corta`);
}
const count = (f) => entries.filter(([, v]) => f(v)).length;
console.log(`${entries.length} veredictos · A=${count((v) => v.winner === "A")} B=${count((v) => v.winner === "B")} · ` +
  `confianza alta=${count((v) => v.confidence === "alta")} media=${count((v) => v.confidence === "media")} baja=${count((v) => v.confidence === "baja")}`);
if (bad.length) {
  console.error(`\nProblemas:\n${bad.join("\n")}`);
  process.exit(1);
}
if (DRY) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY. Corre con --env-file=.env.local");
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let ok = 0;
const missing = [];
const queue = [...entries];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const [id, v] = queue.shift();
      const { data: rows, error } = await db
        .from("tests")
        .update({
          ai_winner: v.winner,
          ai_confidence: v.confidence,
          ai_rationale: v.rationale.trim(),
          ai_criteria: v.criteria ?? [],
          ai_model: data.model ?? null,
          ai_generated_at: data.generated_at ? new Date(data.generated_at).toISOString() : new Date().toISOString(),
        })
        .eq("source_id", id)
        .select("id");
      if (error) throw new Error(`${id}: ${error.message}`);
      if (!rows?.length) missing.push(id);
      else ok++;
    }
  }),
);
console.log(`Actualizados: ${ok}. Sin test en la base: ${missing.length}${missing.length ? ` (${missing.slice(0, 10).join(", ")}…)` : ""}`);
