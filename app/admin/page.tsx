"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { publicUrl } from "@/lib/supabase";

type Media = {
  id: string;
  path: string;
  type: "image" | "video";
  author: string | null;
  created_at: string;
  hidden: boolean;
};

type Result = { ok: true; media: Media[] } | { ok: false; status: number; error: string };

const KEY = "admin-password";

async function fetchMedia(pw: string): Promise<Result> {
  try {
    const res = await fetch("/api/admin", { headers: { "x-admin-password": pw }, cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, media: body.media };
    return { ok: false, status: res.status, error: body.error ?? `Errore del server (${res.status}).` };
  } catch {
    return { ok: false, status: 0, error: "Server non raggiungibile. Riprovo tra poco." };
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // State is set in the .then callback, never synchronously inside the effects below.
  const refresh = useCallback(
    (pw: string) =>
      fetchMedia(pw).then((r) => {
        if (r.ok) {
          sessionStorage.setItem(KEY, pw);
          setPassword(pw);
          setMedia(r.media);
          setError("");
          return;
        }
        if (r.status === 401) {
          sessionStorage.removeItem(KEY);
          setPassword(null);
        }
        setError(r.error);
      }),
    [],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    if (saved) void refresh(saved);
  }, [refresh]);

  useEffect(() => {
    if (!password) return;
    const timer = setInterval(() => void refresh(password), 15_000);
    return () => clearInterval(timer);
  }, [password, refresh]);

  async function toggle(item: Media) {
    if (!password) return;
    setBusyId(item.id);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "x-admin-password": password, "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, hidden: !item.hidden }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Modifica non riuscita (${res.status}).`);
      }
      await refresh(password);
    } catch {
      setError("Server non raggiungibile: modifica non salvata.");
    } finally {
      setBusyId(null);
    }
  }

  function login(e: FormEvent) {
    e.preventDefault();
    if (draft) void refresh(draft);
  }

  function logout() {
    sessionStorage.removeItem(KEY);
    setPassword(null);
    setMedia([]);
  }

  if (!password) {
    return (
      <main className="min-h-dvh bg-ink text-cream font-sans flex items-center justify-center p-6">
        <form onSubmit={login} className="w-full max-w-xs space-y-4">
          <h1 className="font-display text-3xl">Admin</h1>
          <label className="block space-y-1">
            <span className="text-sm">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded bg-cream text-ink px-3 py-2"
            />
          </label>
          <button type="submit" className="w-full rounded bg-ember text-cream py-2 font-semibold">
            Entra
          </button>
          {error && <p role="alert" className="text-terracotta">{error}</p>}
        </form>
      </main>
    );
  }

  const hiddenCount = media.filter((m) => m.hidden).length;

  return (
    <main className="min-h-dvh bg-ink text-cream font-sans p-4 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h1 className="font-display text-3xl">Admin</h1>
        <p className="text-sm text-cardoon">
          {media.length} media · {hiddenCount} nascosti · aggiorna ogni 15 s
        </p>
        <button onClick={logout} className="text-sm underline">Esci</button>
      </header>
      {error && <p role="alert" className="mb-4 rounded bg-terracotta px-3 py-2">{error}</p>}
      {media.length === 0 && <p className="text-cardoon">Ancora nessun caricamento.</p>}
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {media.map((item) => {
          const url = publicUrl(item.path);
          return (
            <li key={item.id} className={`rounded overflow-hidden bg-oil ${item.hidden ? "opacity-40" : ""}`}>
              <a href={url} target="_blank" rel="noreferrer" className="block aspect-square bg-ink">
                {item.type === "video" ? (
                  <video preload="metadata" muted playsInline src={`${url}#t=0.1`} className="h-full w-full object-cover" />
                ) : (
                  // Plain <img>: public bucket thumbnails, no next/image remotePatterns needed.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={item.author ? `Foto di ${item.author}` : "Foto"} loading="lazy" className="h-full w-full object-cover" />
                )}
              </a>
              <div className="p-2 space-y-1 text-sm">
                <p className="truncate">{item.author ?? "Anonimo"}</p>
                <p className="text-cardoon">
                  {new Date(item.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  {item.hidden && " · nascosto"}
                </p>
                <button
                  onClick={() => toggle(item)}
                  disabled={busyId === item.id}
                  className={`w-full rounded py-1 font-semibold disabled:opacity-50 ${item.hidden ? "bg-cardoon text-ink" : "bg-terracotta text-cream"}`}
                >
                  {item.hidden ? "Mostra" : "Nascondi"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
