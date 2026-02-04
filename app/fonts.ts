import { JetBrains_Mono, Instrument_Serif } from 'next/font/google';
import localFont from 'next/font/local';

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const instrumentSerif = Instrument_Serif({
  weight: ['400'],
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

export const geistSans = localFont({
  src: './fonts/GeistVF.woff2',
  variable: '--font-sans',
  display: 'swap',
});
