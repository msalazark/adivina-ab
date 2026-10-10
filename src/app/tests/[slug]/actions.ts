"use server";
import { revalidatePath } from "next/cache";
import { getVoterId } from "@/lib/data";
import { supabaseService } from "@/lib/supabase/server";
import { VARIANT_KEYS, type VariantKey } from "@/lib/types";

export async function castVote(formData: FormData) {
  const testId = String(formData.get("testId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const key = String(formData.get("key") ?? "") as VariantKey;
  if (!testId || !VARIANT_KEYS.includes(key)) return;

  const voter = await getVoterId();
  if (!voter) return;

  const db = supabaseService();
  // Solo se vota en tests publicados y por una versión que exista.
  const { data: variant } = await db
    .from("variants")
    .select("key, tests!inner(status)")
    .eq("test_id", testId)
    .eq("key", key)
    .eq("tests.status", "publicado")
    .not("tests.winner", "is", null)
    .maybeSingle();
  if (!variant) return;

  await db.from("votes").upsert({ test_id: testId, voter_id: voter, variant_key: key }, { onConflict: "test_id,voter_id", ignoreDuplicates: true });
  revalidatePath(`/tests/${slug}`);
  revalidatePath("/", "layout");
}
