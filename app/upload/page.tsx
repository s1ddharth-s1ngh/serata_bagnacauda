"use client";

import { useEffect, useState } from "react";
import * as tus from "tus-js-client";
import { BUCKET, MAX_FILE_MB, SUPABASE_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";
import { describeFile } from "@/lib/media";
import { EVENT } from "@/lib/event";
import Fujot from "@/components/Fujot";
import { Cornice, Riga, Titolo } from "@/components/Carta";

type Job = {
  id: string;
  file: File;
  path: string; // fixed per file, so "Riprova" resumes the same upload
  kind: "image" | "video" | null;
  contentType: string;
  loaded: number;
  uploaded: boolean; // file is in storage, only the DB row may be missing
  status: "waiting" | "uploading" | "done" | "error" | "skipped";
  error?: string;
};

const NAME_KEY = "party-author";
const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
// Direct storage host is faster for big files; custom domains just keep the plain URL.
const TUS_ENDPOINT = `${SUPABASE_URL.replace(".supabase.co", ".storage.supabase.co")}/storage/v1/upload/resumable`;

const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

// TUS for every file: resumable on flaky networks and gives real progress. Small files go in one request.
function tusUpload(job: Job, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(job.file, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
      headers: { authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // resume only uploads of this exact object, never an old upload with a different name
      fingerprint: () => Promise.resolve(`party-${job.path}`),
      chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6 MB
      metadata: { bucketName: BUCKET, objectName: job.path, contentType: job.contentType, cacheControl: "31536000" },
      onProgress: (sent) => onProgress(sent),
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}

async function addRow(path: string, type: "image" | "video", author: string | null) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase.from("media").insert({ path, type, author });
    if (!error || error.code === "23505") return; // 23505: row already saved by an earlier attempt
    if (attempt === 3) throw error;
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

function explain(err: unknown) {
  const res = err instanceof tus.DetailedError ? err.originalResponse : null;
  const status = res?.getStatus() ?? 0;
  const body = res?.getBody() ?? "";
  if (status === 413 || /too large|maximum allowed size/i.test(body)) return `File troppo grande: il massimo è ${MAX_FILE_MB} MB.`;
  if (status === 415 || /mime/i.test(body)) return "Formato non supportato: solo foto e video.";
  if (status >= 400 && status < 500) return `Il server ha rifiutato il file (errore ${status}). Prova con un altro file.`;
  return "Connessione assente o troppo lenta. Avvicinati al Wi-Fi e premi “Riprova”.";
}

export default function UploadPage() {
  const [name, setName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage after hydration
      if (saved) setName(saved);
    } catch {} // private mode: just don't remember
  }, []);

  function saveName(value: string) {
    setName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {}
  }

  const patch = (id: string, p: Partial<Job>) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...p } : j)));

  async function run(queue: Job[]) {
    if (!queue.length) return;
    setRunning(true);
    // keep the phone awake: iOS pauses uploads when the screen locks
    const lock = await navigator.wakeLock?.request("screen").catch(() => null);
    const author = Array.from(name.trim()).slice(0, 40).join("") || null;
    for (const job of queue) {
      patch(job.id, { status: "uploading", error: undefined });
      try {
        if (!job.uploaded) {
          await tusUpload(job, (loaded) => patch(job.id, { loaded }));
          patch(job.id, { uploaded: true });
        }
        await addRow(job.path, job.kind!, author);
        patch(job.id, { status: "done", loaded: job.file.size });
      } catch (err) {
        patch(job.id, { status: "error", error: explain(err) });
      }
    }
    lock?.release().catch(() => {});
    setRunning(false);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same files again
    if (!files.length) return;
    const picked = files.map((file): Job => {
      const { ext, contentType, kind } = describeFile(file.name, file.type);
      const id = crypto.randomUUID();
      const error = !kind
        ? "Formato non supportato: solo foto e video."
        : file.size > MAX_BYTES
          ? `Troppo grande (${toMB(file.size)} MB): il massimo è ${MAX_FILE_MB} MB. Prova un video più corto.`
          : undefined;
      return { id, file, path: `${id}.${ext}`, kind, contentType, loaded: 0, uploaded: false, status: error ? "skipped" : "waiting", error };
    });
    setJobs(picked);
    run(picked.filter((j) => j.status === "waiting"));
  }

  const counted = jobs.filter((j) => j.status !== "skipped");
  const total = counted.reduce((s, j) => s + j.file.size, 0);
  const sent = counted.reduce((s, j) => s + j.loaded, 0);
  const done = counted.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error");
  const finished = !running && done > 0 && done === counted.length;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-lg flex-col overflow-x-clip px-7 pb-9 pt-10">
      <Cornice className="inset-2.5 text-ink/60" width={1} />

      <header>
        <p className="-rotate-[0.6deg] font-mono text-[12px] uppercase tracking-[0.26em]">{EVENT.date}</p>
        <Titolo className="mt-3 w-[80%] text-[3.6rem]" />
        <Riga doppia className="mt-4" />
      </header>

      <div className="relative">
        <div className="mt-6 flex items-start gap-3">
          <p className="text-[1.4rem] leading-[1.22]">{EVENT.tagline}</p>
          <Fujot className="-mt-1 w-[78px] shrink-0 rotate-[4deg]" />
        </div>

        <label className="group mt-8 flex items-baseline gap-3">
          <span className="font-mono text-[15px]">Nome:</span>
          <span className="relative flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => saveName(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              placeholder="facoltativo"
              className="w-full bg-transparent pb-1 text-[1.4rem] italic caret-ink outline-none placeholder:font-mono placeholder:text-[12px] placeholder:not-italic placeholder:tracking-wide placeholder:text-ink/45"
            />
            <Riga className="absolute inset-x-0 -bottom-1.5 group-focus-within:[&_line]:[stroke-width:2.4]" />
          </span>
        </label>

        <label
          className={`group mt-10 block rounded-[2px] outline-offset-8 outline-ink has-[input:focus-visible]:outline-2 ${running ? "cursor-wait" : "cursor-pointer"}`}
        >
          <input type="file" accept="image/*,video/*" multiple disabled={running} onChange={onPick} className="sr-only" />
          <span
            className={`inchiostro relative block -rotate-[1.4deg] px-6 pb-6 pt-7 text-center text-stamp transition-[scale,translate,opacity] duration-100 ease-out ${running ? "opacity-45" : "group-active:translate-y-px group-active:scale-[0.965]"}`}
          >
            <Cornice className="inset-[1.5px]" width={3} />
            <Cornice className="inset-[8px]" width={1.2} />
            <span className="block font-mono text-[1.7rem] font-bold uppercase leading-[1.15] tracking-[0.2em]">
              {running ? "Sto mandando…" : (
                <>
                  Manda foto
                  <br />e video
                </>
              )}
            </span>
            <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.3em]">dalla galleria del telefono</span>
          </span>
        </label>

        {finished && (
          <p aria-hidden="true" className="inchiostro pointer-events-none absolute left-1/2 top-[34%] z-10 -translate-x-1/2 -rotate-[9deg] animate-stampa px-5 py-2.5 font-mono text-[2.25rem] font-bold uppercase tracking-[0.22em] text-stamp mix-blend-multiply">
            <Cornice className="inset-[2px]" width={3.5} />
            <Cornice className="inset-[9px]" width={1.2} />
            Ricevuto
          </p>
        )}
      </div>

      {counted.length > 0 && !finished && (
        <section aria-live="polite" className="mt-9">
          <p className="font-mono text-[15px] tabular-nums">
            {done} di {counted.length}
            <span className="sr-only"> caricati</span>
          </p>
          <Traccia value={total ? sent / total : 0} />
        </section>
      )}

      {finished && (
        <p aria-live="polite" className="mt-9 text-[1.25rem] leading-snug">
          {done === 1 ? "Arrivato." : `Arrivati tutti e ${done}.`} Tra poco {done === 1 ? "compare" : "compaiono"} sullo schermo grande. Puoi
          mandarne ancora quando vuoi.
        </p>
      )}

      {failed.length > 0 && !running && (
        <button
          onClick={() => run(failed)}
          className="mt-7 self-start -rotate-[0.8deg] rounded-[2px] border-[3px] border-double border-ink px-4 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.14em] transition-[scale] duration-100 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          Riprova {failed.length === 1 ? "il file non caricato" : `i ${failed.length} file non caricati`}
        </button>
      )}

      {jobs.length > 0 && (
        <ol className="mt-7 space-y-2.5 font-mono text-[13px]">
          {jobs.map((j) => (
            <li key={j.id}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 truncate">{j.file.name}</span>
                <span aria-hidden="true" className="min-w-6 flex-1 border-b border-dotted border-ink/50" />
                <span className="shrink-0 tabular-nums">{statusLabel(j)}</span>
              </div>
              {j.error && <p className="mt-0.5 leading-snug text-stamp">{j.error}</p>}
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-auto pt-12 font-mono text-[11.5px] leading-relaxed text-ink/75">
        <Riga className="mb-3 text-ink/70" />
        <p>* Fino a {MAX_FILE_MB} MB per file: i video lunghi meglio tagliarli, 30 secondi bastano.</p>
        <p>** Tieni aperta questa pagina finché non compare il timbro «Ricevuto».</p>
      </footer>
    </main>
  );
}

function statusLabel(j: Job) {
  if (j.status === "done") return "fatto";
  if (j.status === "error" || j.status === "skipped") return "non caricato";
  if (j.status === "waiting") return `in coda · ${toMB(j.file.size)} MB`;
  return `${Math.floor((j.loaded / j.file.size) * 100)}%`;
}

// Progress as a pen stroke growing along a dotted form line.
function Traccia({ value }: { value: number }) {
  return (
    <svg aria-hidden="true" className="mt-1 block h-3 w-full overflow-visible">
      <line x1="0" x2="100%" y1="6" y2="6" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="1 5" strokeLinecap="round" />
      <line x1="1" x2={`${Math.max(0.5, Math.min(100, value * 100))}%`} y1="6" y2="6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" filter="url(#penna)" />
    </svg>
  );
}
