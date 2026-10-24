import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShadowLLM // Production AI Shadow-Testing & Live Drift Engine',
  description:
    'Drop-in reverse proxy that bifurcates production LLM traffic to test experimental models and prompts with side-effect virtualization and live drift detection.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-[#e6edf3] font-sans antialiased selection:bg-accent/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
