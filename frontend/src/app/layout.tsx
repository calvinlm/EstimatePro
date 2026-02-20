import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SetupGate } from "@/components/setup-gate";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "EstimatePro PH",
  description: "Formula-driven estimating for Philippine construction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <SetupGate>{children}</SetupGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
