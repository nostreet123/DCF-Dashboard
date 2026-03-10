import type { Metadata } from "next";
import { headers } from "next/headers";

import "./globals.css";
import { Providers } from "./providers";
import { geist, jetbrainsMono } from "./fonts";

export const metadata: Metadata = {
  title: "DCF Dashboard",
  description: "Prototype DCF dashboard with Convex + Python services.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- intentional: must block render to set theme before first paint */}
        <script src="/theme-init.js" nonce={nonce} suppressHydrationWarning />
      </head>
      <body
        className={`${geist.variable} ${jetbrainsMono.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
