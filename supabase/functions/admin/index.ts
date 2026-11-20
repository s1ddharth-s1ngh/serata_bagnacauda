// Admin API for /admin: the site is static (GitHub Pages), so this runs as the Supabase Edge Function "admin".
// Deployed with verify_jwt off: the gate is ADMIN_PASSWORD (Edge Function secret), sent in x-admin-password.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "x-admin-password, content-type, authorization, apikey, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const fail = (error: string, status: number) => Response.json({ error }, { status, headers: CORS });
const sha256 = async (s: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// Hash both sides (fixed length, length doesn't leak) and compare every byte (time doesn't depend on the mismatch).
async function passwordOk(given: string, expected: string) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Service-role client (bypasses RLS); both values are injected by Supabase into every Edge Function.
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const expected = Deno.env.get("ADMIN_PASSWORD");
  if (!expected) return fail("ADMIN_PASSWORD non configurata sul server.", 500);
  if (!(await passwordOk(req.headers.get("x-admin-password") ?? "", expected))) return fail("Password sbagliata.", 401);

  try {
    if (req.method === "GET") {
      // shortcut: PostgREST returns at most 1000 rows; paginate if the party ever goes past that.
      const { data, error } = await db
        .from("media")
        .select("id, path, type, author, created_at, hidden")
        .order("created_at", { ascending: false });
      if (error) return fail(`Errore database: ${error.message}`, 500);
      return Response.json({ media: data }, { headers: CORS });
    }

    if (req.method === "POST") {
      const { id, hidden } = (await req.json().catch(() => null)) ?? {};
      if (typeof id !== "string" || !UUID.test(id) || typeof hidden !== "boolean") {
        return fail("Richiesta non valida: servono id (uuid) e hidden (true/false).", 400);
      }
      const { data, error } = await db.from("media").update({ hidden }).eq("id", id).select("id");
      if (error) return fail(`Errore database: ${error.message}`, 500);
      if (data.length === 0) return fail("Media non trovato.", 404);
      return Response.json({ ok: true }, { headers: CORS });
    }

    return fail("Metodo non supportato.", 405);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Errore sconosciuto.", 500);
  }
});
