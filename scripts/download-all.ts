// Scarica tutte le foto/video del bucket 'party' in ./party-download/.
// Uso: node --env-file=.env.local scripts/download-all.ts   (rilanciabile: salta i file già scaricati)
// Own client instead of lib/supabase-admin.ts: that one imports 'server-only', which only resolves inside Next.
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (lancia con --env-file=.env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = supabase.storage.from("party");
const OUT = "party-download";
const PAGE = 1000;
mkdirSync(OUT, { recursive: true });

const pad = (n: number) => String(n).padStart(2, "0");
// Local time: names match the party's clock and stay identical between runs, so the skip check works.
function stamp(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

let downloaded = 0;
let skipped = 0;
let failed = 0;

for (let offset = 0; ; offset += PAGE) {
  const { data: files, error } = await bucket.list("", {
    limit: PAGE,
    offset,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error) {
    console.error(`Impossibile elencare i file: ${error.message}`);
    process.exit(1);
  }

  for (const file of files) {
    if (!file.id || !file.created_at) continue; // folder placeholder, not a file
    const dest = join(OUT, `${stamp(file.created_at)}_${file.name}`);
    const n = downloaded + skipped + failed + 1;
    if (existsSync(dest)) {
      skipped++;
      continue;
    }
    try {
      const { data: blob, error: dlError } = await bucket.download(file.name);
      if (dlError) throw dlError;
      // Write to .part then rename: an interrupted run never leaves a truncated file that later gets skipped.
      await writeFile(`${dest}.part`, Buffer.from(await blob.arrayBuffer()));
      await rename(`${dest}.part`, dest);
      downloaded++;
      console.log(`[${n}] ✓ ${dest}`);
    } catch (e) {
      failed++;
      console.error(`[${n}] ✗ ${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (files.length < PAGE) break;
}

console.log(`\nFatto: ${downloaded} scaricati, ${skipped} già presenti, ${failed} falliti → ./${OUT}/`);
if (failed) process.exit(1);
