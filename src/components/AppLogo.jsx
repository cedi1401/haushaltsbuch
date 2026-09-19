import React, { useId } from "react";

// App-Logo als Inline-SVG — Vektor-Variante des Icons (public/icon.png).
// Geometrie ist auf ein 1024er-Raster normiert, Grösse wird über `size` gesteuert.
// Die Verlaufs-IDs sind pro Instanz eindeutig, damit mehrere Logos auf einer
// Seite sich nicht gegenseitig die <defs> überschreiben.

export default function AppLogo({ size = 32, title, ...props }) {
  const uid = useId().replace(/:/g, "");
  const bgId = `hb-logo-bg-${uid}`;
  const barId = `hb-logo-bar-${uid}`;
  const lineId = `hb-logo-line-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00effc" />
          <stop offset="0.14" stopColor="#03d2fc" />
          <stop offset="0.25" stopColor="#017cfc" />
          <stop offset="0.38" stopColor="#023881" />
          <stop offset="0.55" stopColor="#03224e" />
          <stop offset="1" stopColor="#010f36" />
        </linearGradient>
        <linearGradient id={barId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6bf1fc" />
          <stop offset="1" stopColor="#0570fc" />
        </linearGradient>
        <linearGradient id={lineId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef7ff" />
        </linearGradient>
      </defs>

      {/* Abgerundeter Hintergrund mit diagonalem Cyan-zu-Navy-Verlauf */}
      <rect x="12" y="13" width="1000" height="998" rx="279" fill={`url(#${bgId})`} />

      {/* Vier aufsteigende Balken */}
      <g fill={`url(#${barId})`}>
        <rect x="154" y="634" width="158" height="200" rx="49" />
        <rect x="347" y="540" width="158" height="294" rx="49" />
        <rect x="537" y="445" width="158" height="389" rx="49" />
        <rect x="732" y="339" width="158" height="495" rx="49" />
      </g>

      {/* Trendlinie */}
      <path
        d="M188 577L819 234"
        stroke={`url(#${lineId})`}
        strokeWidth="41"
        strokeLinecap="round"
      />
    </svg>
  );
}
