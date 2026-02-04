"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is required (see .env.example)");
}

const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <ThemeProvider>{children}</ThemeProvider>
    </ConvexProvider>
  );
}
