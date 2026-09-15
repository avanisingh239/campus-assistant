import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter } from "next/font/google";
import { RegisterServiceWorker } from "./register-service-worker";
import "./globals.css";

// Baloo 2 (headings) + Inter (body) — the type system from the Student
// Dashboard prototype (docs/decision-log.md doesn't record this yet, but
// see CLAUDE.md: this is the first real UI pass, and its visual language —
// forest green + gold, Baloo 2 + Inter, the pin/card motif — is now the
// app's actual design system, not a placeholder). Self-hosted via
// next/font/google (no runtime request to Google Fonts, no layout shift),
// exposed as CSS variables so any component can reach them without
// re-importing next/font.
const baloo2 = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Campus Assistant",
  description: "What actually matters to me — a campus announcement assistant.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0C3B2E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${baloo2.variable} ${inter.variable}`}>
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
