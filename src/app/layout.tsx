import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Hestian — Business Operating System",
  description:
    "Hestian is a business operating system for independent creators and creator-led businesses. Foundation milestone: architecture, not financial data.",
  // The foundation shell is not a marketing surface.
  robots: { index: false, follow: false },
};

/** Every page is request-scoped: sessions and CSP nonces must be per request. */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07080a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
