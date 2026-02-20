import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";
import { jetbrainsMono, instrumentSerif, dmSans } from "./fonts";

export const metadata: Metadata = {
  title: "DCF Dashboard",
  description: "Prototype DCF dashboard with Convex + Python services.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script src="/theme-init.js" />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
