"use client";
/* eslint-disable @next/next/no-img-element -- hand-lettered title, multiply-blended: nothing for next/image to do */

import { useEffect, useRef, useState } from "react";
import { EVENT } from "@/lib/event";

/** Shared SVG filter: lines look traced by pen. Rendered once in the root layout. */
export function InkDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="penna" filterUnits="userSpaceOnUse" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="1" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="4.5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/** Wobbly divider; `doppia` = thick + thin, like a menu header rule. */
export function Riga({ doppia = false, className = "" }: { doppia?: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" className={`block h-[12px] w-full overflow-visible ${className}`}>
      <g filter="url(#penna)" stroke="currentColor" strokeLinecap="round">
        <line x1="1" x2="99.6%" y1="4" y2="4" strokeWidth={doppia ? 2.4 : 1.3} />
        {doppia && <line x1="2" x2="100%" y1="8.5" y2="8.5" strokeWidth="0.9" />}
      </g>
    </svg>
  );
}

/** Wobbly rectangular frame filling its positioned parent, inset by `className` (e.g. "inset-2"). */
export function Cornice({ className = "", width = 1.4 }: { className?: string; width?: number }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
      <svg className="block size-full overflow-visible">
        <rect width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth={width} filter="url(#penna)" />
      </svg>
    </span>
  );
}

/** Hand-lettered title from /public/titolo.png; serif text until that file exists. */
export function Titolo({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // load/error may fire before hydration attaches the handlers
    const i = img.current;
    if (i?.complete) setState(i.naturalWidth ? "ok" : "missing");
  }, []);

  return (
    <h1 className={className}>
      {state === "missing" ? (
        <span className="block leading-[0.88]">{EVENT.name}</span>
      ) : (
        <img
          ref={img}
          src="/titolo.png"
          alt={EVENT.name}
          onLoad={() => setState("ok")}
          onError={() => setState("missing")}
          className={`block h-auto w-full mix-blend-multiply ${state === "ok" ? "" : "invisible"}`}
        />
      )}
    </h1>
  );
}
