import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";
import { jetbrainsMono, instrumentSerif, geistSans } from "./fonts";

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
        {/* Inline script to prevent theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('dcf-theme');
                  if (theme === 'light' || theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', theme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
