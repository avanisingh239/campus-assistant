import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "./register-service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Assistant",
  description: "What actually matters to me — a campus announcement assistant.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2f5fdb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
