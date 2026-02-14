"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ThemeProvider } from "@/lib/contexts/ThemeContext";
import { WorkbenchProvider } from "@/lib/contexts/WorkbenchContext";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: React.ReactNode }) {
  const app = (
    <ThemeProvider>
      <WorkbenchProvider>{children}</WorkbenchProvider>
    </ThemeProvider>
  );

  if (!convex) {
    return app;
  }

  return (
    <ConvexProvider client={convex}>{app}</ConvexProvider>
  );
}
