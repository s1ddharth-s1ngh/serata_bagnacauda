// The bagna cauda pot (fujot) over its candle, as a pen-and-ink engraving: lines only, currentColor.
// Render at most once per page (clipPath ids).
export default function Fujot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <clipPath id="fujot-bowl">
          <path d="M22 40C22 62 36 78 60 78C84 78 98 62 98 40Z" />
        </clipPath>
        <clipPath id="fujot-stand">
          <path d="M38 70L33 126H87L82 70Z" />
        </clipPath>
      </defs>
      <g filter="url(#penna)">
        {/* steam */}
        <path strokeWidth="1.1" d="M47 31c-5-5 4-9-1-15s3-9 0-12" />
        <path strokeWidth="1.1" d="M61 28c-5-6 5-9 0-15s3-8 0-11" />
        <path strokeWidth="1.1" d="M74 31c-5-5 4-9-1-14" />
        {/* stand, its opening and the candle */}
        <path strokeWidth="1.8" d="M38 72L33 124M82 72L87 124M33 124C33 131 87 131 87 124" />
        <path strokeWidth="1.5" d="M50 125V107C50 96 70 96 70 107V125" />
        <path strokeWidth="1.1" d="M55 126V116H65V126M60 113C56 109 57 104 60 99C63 104 64 109 60 113Z" />
        <g clipPath="url(#fujot-stand)" strokeWidth="0.75">
          {[73, 75.5, 78, 80.5, 83, 85.5].map((x) => (
            <path key={x} d={`M${x} 68L${x + 1.5} 130`} />
          ))}
          <path d="M37 70L35 128M40 70L38.5 128" />
          <path d="M52 105C55 100 65 100 68 105M51 109C55 104 65 104 69 109" />
        </g>
        {/* bowl, rim, oil line, handles */}
        <path strokeWidth="2" d="M22 40C22 62 36 78 60 78C84 78 98 62 98 40" />
        <ellipse strokeWidth="1.8" cx="60" cy="40" rx="38" ry="7.5" />
        <ellipse strokeWidth="0.9" cx="60" cy="41" rx="31" ry="4.6" />
        <path strokeWidth="1.6" d="M22.5 47c-7 0-8 9-1 10M97.5 47c7 0 8 9 1 10" />
        <g clipPath="url(#fujot-bowl)" strokeWidth="0.75">
          {[50, 54, 58, 62, 66, 70, 74].map((y) => (
            <path key={y} d={`M64 ${y}Q82 ${y + 2} 100 ${y - 6}`} />
          ))}
          <path d="M24 52Q30 54 34 52M27 60Q33 62 37 60" />
        </g>
      </g>
    </svg>
  );
}
