"use client";
/* eslint-disable @next/next/no-img-element -- remote party media and a data-URL QR: nothing for next/image to optimize */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { publicUrl, supabase } from "@/lib/supabase";
import { newDeck, peekNext, pickNext, syncDeck, type Media } from "@/lib/media";
import { EVENT } from "@/lib/event";
import Fujot from "@/components/Fujot";
import { Cornice, Riga, Titolo } from "@/components/Carta";

const PHOTO_MS = 6_000;
const VIDEO_MAX_MS = 20_000;
const LOAD_TIMEOUT_MS = 15_000;
const POLL_MS = 15_000;
const DROP_MS = 700; // animate-cade in globals.css
const FADE_MS = DROP_MS + 300; // drop, then the covered print fades out

type Slide = { key: number; item: Media; isNew: boolean; ready: boolean; tilt: number };
let channelSeq = 0;

export default function WallPage() {
  const deck = useRef(newDeck());
  const active = useRef<Slide | null>(null); // slide being loaded or shown
  const readyKey = useRef(0);
  const slideSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined); // the one pending "move on" timer
  const failures = useRef(0);
  const syncSeq = useRef(0);
  const appliedSeq = useRef(0);

  const [slides, setSlides] = useState<Slide[]>([]); // at most [shown, loading]: the new print drops on the old one, never an empty table
  const [count, setCount] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [qr, setQr] = useState<{ src: string; label: string } | null>(null);

  function advance() {
    clearTimeout(timer.current);
    const next = pickNext(deck.current);
    if (!next) {
      active.current = null;
      setSlides([]);
      return;
    }
    const slide = { key: ++slideSeq.current, ...next, ready: false, tilt: Math.random() * 6 - 3 };
    active.current = slide;
    setSlides((all) => [...all.filter((s) => s.ready).slice(-1), slide]);
    timer.current = setTimeout(() => fail(slide.key), LOAD_TIMEOUT_MS);
  }

  function ready(key: number) {
    const slide = active.current;
    if (slide?.key !== key || readyKey.current === key) return; // stale, or a video resuming after a stall
    readyKey.current = key;
    failures.current = 0;
    setSlides((all) => all.map((s) => (s.key === key ? { ...s, ready: true } : s)));
    setTimeout(() => setSlides((all) => all.filter((s) => s.key >= key)), FADE_MS + 200);
    clearTimeout(timer.current);
    timer.current = setTimeout(advance, slide.item.type === "video" ? VIDEO_MAX_MS : PHOTO_MS);
    const upcoming = peekNext(deck.current);
    if (upcoming?.item.type === "image") new Image().src = publicUrl(upcoming.item.path);
  }

  function finish(key: number) {
    if (active.current?.key === key) advance();
  }

  function fail(key: number) {
    if (active.current?.key !== key) return;
    clearTimeout(timer.current);
    failures.current += 1;
    // everything failing (e.g. venue Wi-Fi down): back off instead of spinning
    timer.current = setTimeout(advance, failures.current > deck.current.items.length ? 5_000 : 0);
  }

  async function sync() {
    const seq = ++syncSeq.current;
    const { data, error } = await supabase
      .from("media")
      .select("id, path, type, author, created_at")
      .order("created_at")
      .limit(1000); // shortcut: no paging past 1000 items, plenty for one party
    if (error || seq < appliedSeq.current) return; // drop responses older than one already applied
    const firstLoad = appliedSeq.current === 0;
    appliedSeq.current = seq;
    const added = syncDeck(deck.current, data as Media[], !firstLoad);
    setCount(data.length);
    const current = active.current;
    const hidden = current && !data.some((m) => m.id === current.item.id);
    // new arrivals show right away, but never cut another new arrival short
    if (!current || hidden || (added > 0 && !current.isNew)) advance();
  }

  // Data: initial load, realtime INSERTs (self-healing), and a 15 s poll that also drops media hidden by the admin.
  useEffect(() => {
    sync();
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const subscribe = () => {
      const ch = supabase
        .channel(`media-wall-${++channelSeq}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "media" }, () => sync());
      channel = ch;
      ch.subscribe((status) => {
        if (ch !== channel) return; // an old channel being torn down
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") sync(); // catch up on anything missed while disconnected
        else {
          clearTimeout(retry);
          retry = setTimeout(() => {
            channel = null;
            supabase.removeChannel(ch);
            subscribe();
          }, 5_000);
        }
      });
    };
    subscribe();
    const poll = setInterval(sync, POLL_MS);
    return () => {
      clearTimeout(retry);
      clearInterval(poll);
      clearTimeout(timer.current);
      const ch = channel;
      channel = null;
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; these functions only touch refs and setters
  }, []);

  // Screen: QR, wake lock, fullscreen state.
  useEffect(() => {
    const url = `${(process.env.NEXT_PUBLIC_SITE_URL || location.origin).replace(/\/+$/, "")}/upload`;
    QRCode.toString(url, { type: "svg", margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((svg) => setQr({ src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, label: url.replace(/^https?:\/\//, "") }))
      .catch(() => {});

    let lock: WakeLockSentinel | null = null;
    const keepAwake = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    keepAwake();
    document.addEventListener("visibilitychange", keepAwake);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", keepAwake);
      document.removeEventListener("fullscreenchange", onFullscreen);
      lock?.release().catch(() => {});
    };
  }, []);

  function enterFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
    navigator.wakeLock?.request("screen").catch(() => {}); // retry with a user gesture
  }

  const top = slides.filter((s) => s.ready).at(-1)?.key; // the print on top of the pile
  const shown = top !== undefined;

  return (
    <main className={`legno fixed inset-0 select-none overflow-hidden ${fullscreen ? "cursor-none" : ""}`}>
      <section className="absolute inset-y-0 left-0 right-[28vw]">
        {slides.map((s) => (
          <SlideView key={s.key} slide={s} under={s.ready && s.key !== top} onReady={ready} onDone={finish} onFail={fail} />
        ))}
      </section>

      {/* Bottom right while prints are showing, big and centered until the first one lands.
          Only the paper and the text are tilted: no transform sits above the QR, so it is drawn pixel-exact. */}
      <div className={`absolute z-10 ${shown ? "bottom-[4vh] right-[3.5vw] [--qr:36vh]" : "inset-0 flex items-center justify-center [--qr:50vh]"}`}>
        <aside className="relative w-[calc(var(--qr)+7vh)] px-[3.5vh] pb-[2.4vh] pt-[3vh]">
          <span aria-hidden="true" className="carta absolute inset-0 rotate-[1.5deg] rounded-[3px]">
            <Cornice className="inset-[1.1vh] text-ink/75" />
          </span>
          <div className="relative rotate-[1.5deg]">
            <p className="font-mono text-[1.5vh] uppercase tracking-[0.3em]">{EVENT.date}</p>
            <div className="mt-[0.8vh] flex items-end justify-between gap-[1vh]">
              <Titolo className="w-[74%] text-[6.6vh]" />
              <Fujot className="w-[9.5vh] shrink-0 -rotate-[5deg]" />
            </div>
            <Riga doppia className="mt-[1.2vh]" />
            <p className="mt-[1.8vh] text-[4.3vh] leading-[1.02]">
              Inquadra e manda
              <br />
              le tue foto
            </p>
          </div>
          {/* plain black on white, 4-module quiet zone, nothing on top */}
          {qr ? (
            <img src={qr.src} alt={`QR code per ${qr.label}`} className="relative mt-[2.2vh] block size-[var(--qr)]" />
          ) : (
            <div className="relative mt-[2.2vh] size-[var(--qr)] bg-white" />
          )}
          <div className="relative rotate-[1.5deg]">
            <p className="mt-[1.6vh] font-mono text-[1.7vh] tracking-wide">{qr?.label}</p>
            <p
              className="mt-[0.4vh] font-mono text-[1.5vh] text-ink/70"
              title={live ? "Realtime connesso" : "Realtime non connesso: aggiorno ogni 15 secondi"}
            >
              {live ? "●" : "○"} {count ? `${count} ${count === 1 ? "invio" : "invii"} finora` : "in attesa del primo invio"}
            </p>
          </div>
        </aside>
      </div>

      {!fullscreen && (
        <button
          onClick={enterFullscreen}
          className="carta absolute right-[3.5vw] top-[3vh] z-20 -rotate-[1deg] rounded-[2px] px-4 py-2 font-mono text-sm uppercase tracking-[0.2em] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper"
        >
          Schermo intero
        </button>
      )}
    </main>
  );
}

function SlideView({
  slide: { key, item, isNew, ready, tilt },
  under,
  onReady,
  onDone,
  onFail,
}: {
  slide: Slide;
  under: boolean;
  onReady: (key: number) => void;
  onDone: (key: number) => void;
  onFail: (key: number) => void;
}) {
  const url = publicUrl(item.path);
  const media = "block max-h-[76vh] max-w-[62vw]";
  return (
    // a covered print fades away once the new one has landed on it
    <div
      className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
      style={{ opacity: under ? 0 : 1, transitionDelay: `${DROP_MS}ms` }}
    >
      <figure
        className={`relative bg-print p-[1.4vh] pb-0 shadow-[0_0.25vh_0.4vh_rgb(0_0_0/0.5)] ${ready ? "animate-cade" : "opacity-0"}`}
        style={{ "--r": `${tilt}deg` } as CSSProperties}
      >
        {item.type === "image" ? (
          <img
            src={url}
            alt={item.author ? `Foto di ${item.author}` : "Foto della serata"}
            onLoad={() => onReady(key)}
            onError={() => onFail(key)}
            className={media}
          />
        ) : (
          <video
            src={url}
            autoPlay
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            onPlaying={() => onReady(key)}
            onEnded={() => onDone(key)}
            onError={() => onFail(key)}
            className={media}
          />
        )}
        {/* author is guest text: rendered as a React text node, never as HTML */}
        <figcaption className="flex h-[6.5vh] items-center px-[0.6vh] font-mono text-[2.5vh] text-ink">
          <span className="w-0 flex-1 truncate">{item.author && `${item.type === "video" ? "video" : "foto"} di ${item.author}`}</span>
        </figcaption>
        {isNew && ready && (
          <span className="inchiostro pointer-events-none absolute bottom-[0.9vh] right-[2.5vh] -rotate-[4deg] animate-stampa px-[2vh] py-[1.2vh] font-mono text-[2.8vh] font-bold uppercase tracking-[0.2em] text-stamp mix-blend-multiply [animation-delay:600ms]">
            <Cornice className="inset-[0.2vh]" width={3} />
            <Cornice className="inset-[0.8vh]" width={1.2} />
            Appena {item.type === "video" ? "arrivato" : "arrivata"}
          </span>
        )}
      </figure>
    </div>
  );
}
