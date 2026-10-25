import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShadowLLM // Production AI Shadow-Testing & Live Drift Engine',
  description:
    'Drop-in reverse proxy that bifurcates production LLM traffic to test experimental models and prompts with side-effect virtualization and live drift detection.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen font-sans antialiased bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
