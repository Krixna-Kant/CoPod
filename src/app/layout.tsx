import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Footer, Nav } from "@/components/SiteChrome";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CoPod - Autonomous compute escrow for fractional GPU pools",
  description:
    "Pool funds for dedicated GPU capacity. PayPal authorization holds as escrow, real-time token metering, and an autonomous Gemini treasurer that prices, protects and settles.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="relative flex min-h-full flex-col font-sans text-slate-900 selection:bg-blue-100 selection:text-copod-700">
        <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
          <div className="ambient-glow absolute -top-[15%] left-1/2 h-[580px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-200/50 via-sky-100/30 to-transparent blur-3xl" />
          <div className="absolute -right-[15%] top-[25%] h-[600px] w-[600px] rounded-full bg-sky-200/35 blur-3xl" />
          <div className="absolute -left-[10%] top-[60%] h-[550px] w-[550px] rounded-full bg-blue-100/40 blur-3xl" />
          <div className="bg-grid-pattern absolute inset-0 opacity-80" />
        </div>
        <Nav />
        <div className="flex flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
