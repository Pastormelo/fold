/**
 * The Fold mark, from `Fold Logo.dc.html`.
 *
 * A rounded pen with four sheep inside it and a fifth outside — the one that
 * wandered off. It is the whole product in a glyph, and it stands in for the "O"
 * in FOLD rather than sitting beside the word. I had shipped a plain orange
 * letter O instead, which loses the only part of the logo that means anything.
 *
 * `overflow: visible` matters: the stray dot sits outside the viewBox on purpose.
 */
export function FoldMark({
  size = 27,
  tone = 'inverse',
}: {
  size?: number
  /** `inverse` for the ink rail, `ink` for a light background. */
  tone?: 'inverse' | 'ink'
}) {
  const stroke = tone === 'inverse' ? 'var(--ofc-paper)' : 'var(--ofc-ink)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        verticalAlign: 'baseline',
        overflow: 'visible',
        margin: '0 0.04em',
      }}
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="15"
        stroke={stroke}
        strokeWidth="6.5"
      />
      <circle cx="23" cy="24" r="5.4" fill={stroke} />
      <circle cx="41" cy="24" r="5.4" fill={stroke} />
      <circle cx="23" cy="42" r="5.4" fill={stroke} />
      <circle cx="41" cy="42" r="5.4" fill={stroke} />
      {/* The one that left. Always brand orange, in both tones. */}
      <circle cx="77" cy="-9" r="7" fill="var(--brand)" />
    </svg>
  )
}

/** The horizontal lockup: F, the mark as the O, then LD. */
export function FoldLogo({
  fontSize = 26,
  tone = 'inverse',
}: {
  fontSize?: number
  tone?: 'inverse' | 'ink'
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-display)',
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.03em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: tone === 'inverse' ? 'var(--ofc-paper)' : 'var(--ofc-ink)',
      }}
    >
      F<FoldMark size={fontSize * 0.72} tone={tone} />
      LD
    </div>
  )
}
