import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { getLastSync } from "@/lib/data/queries";
import { getPluggyCredentials } from "@/lib/infra/settings";
import { SetupBanner } from "@/components/setup/setup-banner";
import { connection } from "next/server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finanças",
  description: "Personal finance dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Every page shows live personal data: never prerender at build time
  await connection();
  const [lastSync, pluggy] = await Promise.all([getLastSync(), getPluggyCredentials()]);
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg font-sans">
        <div className="flex min-h-screen">
          <Sidebar lastSync={lastSync?.toISOString() ?? null} setupPending={!pluggy.configured} />
          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-[1400px] px-8 py-8">
              {!pluggy.configured && <SetupBanner />}
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
