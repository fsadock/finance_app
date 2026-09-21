import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker-registration";
import { PullToRefresh } from "@/components/layout/pull-to-refresh";
import { getLastSync } from "@/lib/data/connections";
import { getPluggyCredentials } from "@/lib/infra/settings";
import { SetupBanner } from "@/components/setup/setup-banner";
import { connection } from "next/server";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finanças",
  description: "Personal finance dashboard",
  appleWebApp: { capable: true, title: "Finanças", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  viewportFit: "cover",
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
          <ServiceWorkerRegistration />
          <Sidebar lastSync={lastSync?.toISOString() ?? null} setupPending={!pluggy.configured} />
          <main className="flex-1 min-w-0">
            <MobileNav lastSync={lastSync?.toISOString() ?? null} setupPending={!pluggy.configured} />
            <PullToRefresh />
            <div className="mx-auto max-w-[1400px] px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-8">
              {!pluggy.configured && <SetupBanner />}
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
