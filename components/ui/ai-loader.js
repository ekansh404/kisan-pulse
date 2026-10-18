'use client';
// "AI is speaking" animation (adapted from the ai-loader component: rotating glow ring + letters lighting up in turn).
// Plain JS + CSS (this project has no TypeScript/Tailwind); styles live in app/globals.css under "ai-loader".
// Hindi text is split into grapheme clusters so matras and conjuncts stay joined.

function graphemes(text) {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(seg.segment(text), (s) => s.segment);
  } catch {
    return Array.from(text);
  }
}

export default function AiLoader({ size = 180, text = 'Speaking' }) {
  const letters = graphemes(text);
  return (
    <div className="ai-loader" style={{ width: size, height: size }} aria-label={text} role="img">
      <span className="ai-loader-text" aria-hidden="true">
        {letters.map((letter, i) => (
          <span key={i} className="ai-loader-letter" style={{ animationDelay: `${i * 0.1}s` }}>
            {letter === ' ' ? ' ' : letter}
          </span>
        ))}
      </span>
      <span className="ai-loader-circle" aria-hidden="true" />
    </div>
  );
}
