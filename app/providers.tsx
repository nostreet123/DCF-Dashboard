"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: React.ReactNode }) {
  const app = <ThemeProvider>{children}</ThemeProvider>;

  if (!convex) {
    return app;
  }

  return (
    <ConvexProvider client={convex}>{app}</ConvexProvider>
  );
}
