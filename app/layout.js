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
        <link rel="icon" href="/favicon.ico?v=2" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
      </head>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
