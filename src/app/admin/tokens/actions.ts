"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/data";
import { newToken } from "@/lib/api-tokens";
import { supabaseServer } from "@/lib/supabase/server";

export type CreateTokenState = { token?: string; name?: string; error?: string } | null;

export async function createToken(_prev: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  if (!(await isAdmin())) return { error: "Tu sesión no tiene permisos de administración." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Ponle un nombre al token (por ejemplo, «Boletín GuessTheTest»)." };
  const user = await getCurrentUser();
  const { token, hash } = newToken();
  const db = await supabaseServer();
  const { error } = await db.from("api_tokens").insert({ name, token_hash: hash, created_by: user?.id ?? null });
  if (error) return { error: error.message };
  revalidatePath("/admin/tokens");
  return { token, name };
}

export async function revokeToken(formData: FormData) {
  if (!(await isAdmin())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await supabaseServer();
  await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/tokens");
}
