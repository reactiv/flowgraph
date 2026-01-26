import type { Metadata } from 'next';
import { DM_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { AppShell } from '@/components/layout';
import { Toaster } from '@/components/ui/toaster';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Curie Omni',
  description: 'Turn workflow templates into working apps with realistic data and polished UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${dmSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
