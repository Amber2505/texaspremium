// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GoogleTagManager } from "@next/third-parties/google"; // Keep this import

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Texas Premium Insurance Services",
  description: "We Compare, You Save!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID; // Store your GTM ID in an environment variable

  return (
    <html lang="en">
      {GTM_ID && <GoogleTagManager gtmId={GTM_ID} />}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {GTM_ID && ( // This noscript part goes inside the body
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            ></iframe>
          </noscript>
        )}
        {children}
      </body>
    </html>
  );
}
