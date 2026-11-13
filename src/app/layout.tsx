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
