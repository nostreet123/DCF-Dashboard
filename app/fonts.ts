import localFont from 'next/font/local';
import { JetBrains_Mono } from 'next/font/google';

export const geist = localFont({
  src: './fonts/GeistVF.woff2',
  variable: '--font-sans',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});
