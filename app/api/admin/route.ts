import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const fail = (error: string, status: number) => Response.json({ error }, { status });

// Returns an error response, or null when the password is right.
function checkPassword(request: Request): Response | null {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return fail("ADMIN_PASSWORD non configurata sul server.", 500);
  const given = request.headers.get("x-admin-password") ?? "";
  // Hash both sides: equal lengths, so timingSafeEqual never throws and the length doesn't leak.
  if (!timingSafeEqual(sha256(given), sha256(expected))) return fail("Password sbagliata.", 401);
  return null;
}

export async function GET(request: Request) {
  const denied = checkPassword(request);
  if (denied) return denied;
  try {
    // shortcut: PostgREST returns at most 1000 rows; paginate if the party ever goes past that.
    const { data, error } = await supabaseAdmin()
      .from("media")
      .select("id, path, type, author, created_at, hidden")
      .order("created_at", { ascending: false });
    if (error) return fail(`Errore database: ${error.message}`, 500);
    return Response.json({ media: data });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Errore sconosciuto.", 500);
  }
}

export async function POST(request: Request) {
  const denied = checkPassword(request);
  if (denied) return denied;
  const { id, hidden } = (await request.json().catch(() => null)) ?? {};
  if (typeof id !== "string" || !UUID.test(id) || typeof hidden !== "boolean") {
    return fail("Richiesta non valida: servono id (uuid) e hidden (true/false).", 400);
  }
  try {
    const { data, error } = await supabaseAdmin()
      .from("media")
      .update({ hidden })
      .eq("id", id)
      .select("id");
    if (error) return fail(`Errore database: ${error.message}`, 500);
    if (data.length === 0) return fail("Media non trovato.", 404);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Errore sconosciuto.", 500);
  }
}
