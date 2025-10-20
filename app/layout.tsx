import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic App",
  description: "Autonomous AI agent for digital tasks"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
