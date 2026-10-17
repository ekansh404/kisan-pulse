import './globals.css';

export const metadata = {
  title: 'Kisan Pulse',
  description: 'Voice-first farming assistant',
  manifest: '/manifest.json',
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#FBF7EE' };

export default function RootLayout({ children }) {
  return (
    <html lang="hi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600;700;800&family=Tiro+Devanagari+Hindi:ital@0;1&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
