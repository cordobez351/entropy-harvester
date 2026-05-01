import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['500'],
  display: 'swap',
  variable: '--font-ibm',
});

const serif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
  variable: '--font-ibm-serif',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-jb',
});

export const metadata: Metadata = {
  title: 'ENTROP · entropy harvester',
  description:
    'Browser entropy harvester: fluid ASCII viz, prose on entropy & empowerment; SHA-256 from rAF.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
