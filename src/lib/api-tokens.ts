import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseService } from "@/lib/supabase/server";

/** Token nuevo: se muestra una sola vez; en la base solo queda su hash SHA-256. */
export function newToken() {
  const token = `aab_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Valida `Authorization: Bearer <token>` contra api_tokens (no revocados). Devuelve el id del token o null. */
export async function verifyBearer(header: string | null): Promise<{ id: string; name: string } | null> {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  const db = supabaseService();
  const { data } = await db
    .from("api_tokens")
    .select("id, name")
    .eq("token_hash", hashToken(m[1]))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data as { id: string; name: string };
}
