import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/data/provider";
import { AppShell } from "@/components/AppShell";

const body = DM_Sans({ variable: "--font-dmsans", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sapor — track, rate & rank what you eat",
  description:
    "Sapor is an independent community app for tracking, rating and ranking grocery products. Not affiliated with Trader Joe's.",
};

export const viewport: Viewport = { themeColor: "#fbf6ee", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
