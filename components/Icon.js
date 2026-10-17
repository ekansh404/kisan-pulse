// Stroke icons (no emoji, no icon library). Usage: <Icon name="mic" />
const P = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0" /><path d="M12 18v3" /></>,
  micOff: <><path d="M15 9.5V6a3 3 0 00-6 0v5a3 3 0 004.5 2.6" /><path d="M5 11a7 7 0 0011.3 5.5" /><path d="M19 11a7 7 0 01-.6 2.8" /><path d="M12 18v3" /><path d="M3 3l18 18" /></>,
  spkOff: <><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M16 9l5 6" /><path d="M21 9l-5 6" /></>,
  spk: <><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7" /><path d="M18.5 5.5a9 9 0 010 13" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  leaf: <><path d="M12 21V11" /><path d="M12 11C12 6 8 4 4 4c0 5 3 7 8 7z" /><path d="M12 13c0-4 3-6 8-6 0 4-3 6-8 6z" /></>,
  doc: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6" /><path d="M10 17h6" /></>,
  store: <><path d="M3 9l2-5h14l2 5" /><path d="M4 9v11h16V9" /><path d="M3 9h18" /><path d="M10 20v-6h4v6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  rain: <><path d="M7 15a4 4 0 010-8 5 5 0 019.6-1A4 4 0 0117 15z" /><path d="M9 18l-1 3" /><path d="M13 18l-1 3" /><path d="M17 18l-1 3" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5" /><path d="M12 18v.01" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  tractor: <><circle cx="7" cy="17" r="3" /><circle cx="18" cy="18" r="2" /><path d="M4 14V8h6l2 5h6v3" /><path d="M10 8V5" /></>,
  flask: <><path d="M9 3h6" /><path d="M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" /><path d="M7.5 15h9" /></>,
  people: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0112 0" /><path d="M14 20a4.5 4.5 0 017-3.7" /></>,
  rupee: <><path d="M7 4h10" /><path d="M7 9h10" /><path d="M7 4c6 0 6 10 0 10l7 6" /></>,
  phone: <path d="M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 6a2 2 0 012-2z" />,
  back: <path d="M15 18l-6-6 6-6" />,
  send: <><path d="M4 12l16-8-6 16-2-6z" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
};
export default function Icon({ name, style, className = 'i' }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
      {P[name] || null}
    </svg>
  );
}
