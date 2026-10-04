import type { Metadata } from 'next';
import { IBM_Plex_Mono, Newsreader, Public_Sans } from 'next/font/google';

import styles from './layout.module.css';

const sans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-lab-sans',
  display: 'swap',
});

const serif = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-lab-serif',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-lab-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DCF Lab',
  description: 'Valuation memos for financial modeling and education. Not investment advice.',
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.root} ${sans.variable} ${serif.variable} ${mono.variable}`}>{children}</div>
  );
}
