import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Instrument_Serif } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: BRAND.siteTitle,
  description: BRAND.siteDescription,
  applicationName: BRAND.fullName,
  openGraph: { title: BRAND.siteTitle, description: BRAND.siteDescription, type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0c0b10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        {children}
        {process.env.NODE_ENV !== "production" && <Script src="/dev-wallet.js" strategy="beforeInteractive" />}
      </body>
    </html>
  );
}
