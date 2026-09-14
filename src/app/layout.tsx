import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Email Hub", template: "%s · Email Hub" },
  description: "Unified Gmail + Outlook inbox with AI analysis, assistant, calendar scheduling and a secure API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
