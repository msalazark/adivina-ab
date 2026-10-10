import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { VOTER_COOKIE } from "@/lib/env";
import type { Test, TestTeaser, Variant, VariantKey } from "@/lib/types";

const TEST_SELECT = `
  id, slug, title, company, industry, country, category, device, tool, source_name, source_url,
  context, hypothesis, winner, metric, lift, confidence, summary, segments, learnings, ideas, tags,
  status, published_at, created_at, updated_at,
  variants ( id, key, name, description, images:variant_images ( id, path, width, height, label, sort ) )
`;

function normalize(row: Record<string, unknown>): Test {
  const t = row as unknown as Test;
  const variants = ((row.variants as Variant[]) ?? [])
    .map((v) => ({ ...v, images: [...(v.images ?? [])].sort((a, b) => a.sort - b.sort) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    ...t,
    lift: t.lift === null ? null : Number(t.lift),
    confidence: t.confidence === null ? null : Number(t.confidence),
    segments: Array.isArray(t.segments) ? t.segments : [],
    variants,
  };
}

/** Id anónimo del visitante (lo asigna el proxy). */
export const getVoterId = cache(async () => {
  const store = await cookies();
  return store.get(VOTER_COOKIE)?.value ?? null;
});

export const getCurrentUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const isAdmin = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("is_admin");
  return data === true;
});

/** Tests visibles para el visitante, del más antiguo al más nuevo (así se numeran). */
export const listTests = cache(async (): Promise<TestTeaser[]> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("tests")
    .select("id, slug, title, company, industry, category, device, status, published_at, tags, winner, lift, created_at")
    .order("published_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, lift: r.lift === null ? null : Number(r.lift) })) as TestTeaser[];
});

export const getTestBySlug = cache(async (slug: string): Promise<Test | null> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("tests").select(TEST_SELECT).eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalize(data) : null;
});

export async function getTestById(id: string): Promise<Test | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("tests").select(TEST_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalize(data) : null;
}

/** Votos del visitante actual: { test_id: "A" | "B" | "C" }. */
export const getMyVotes = cache(async (): Promise<Record<string, VariantKey>> => {
  const voter = await getVoterId();
  if (!voter) return {};
  const { data } = await supabaseService().from("votes").select("test_id, variant_key").eq("voter_id", voter);
  return Object.fromEntries((data ?? []).map((v) => [v.test_id, v.variant_key as VariantKey]));
});

export async function getPoll(testId: string): Promise<Record<string, number>> {
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("test_poll", { p_test_id: testId });
  return Object.fromEntries(((data as { variant_key: string; votes: number }[]) ?? []).map((r) => [r.variant_key, Number(r.votes)]));
}

export async function getScore() {
  const [tests, votes] = await Promise.all([listTests(), getMyVotes()]);
  let played = 0;
  let correct = 0;
  for (const t of tests) {
    const v = votes[t.id];
    if (!v) continue;
    played++;
    if (v === t.winner) correct++;
  }
  return { played, correct, total: tests.filter((t) => t.status === "publicado").length };
}
