/**
 * The QUILL mark: a fountain-pen nib, gold on nothing. Drawn inline so it
 * inherits nothing and renders identically at 28px and at 300px.
 */
export function Nib({ className, title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="nib-gold" x1="12" y1="6" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe3a0" />
          <stop offset="0.45" stopColor="#e9b64a" />
          <stop offset="1" stopColor="#9a6b1c" />
        </linearGradient>
        <linearGradient id="nib-sheen" x1="20" y1="8" x2="44" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff7dc" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff7dc" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* nib body */}
      <path d="M32 3.5c11.6 0 21 8.6 21 21.4 0 3.2-.6 6-1.8 8.7L32 61.5 12.8 33.6C11.6 30.9 11 28.1 11 24.9 11 12.1 20.4 3.5 32 3.5Z" fill="url(#nib-gold)" />
      {/* sheen */}
      <path d="M32 6.5c8.4 0 15.6 5.4 17.6 13.5-4.2-4.9-10.3-7.5-17.6-7.5-7.3 0-13.4 2.6-17.6 7.5 2-8.1 9.2-13.5 17.6-13.5Z" fill="url(#nib-sheen)" />
      {/* slit and breather hole, cut in ink */}
      <path d="M32 61.5V33.2" stroke="#0c0b10" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="32" cy="29.6" r="3.6" fill="#0c0b10" />
      {/* tine edges */}
      <path d="M19.5 40.5 32 58.5l12.5-18" fill="none" stroke="#0c0b10" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}
