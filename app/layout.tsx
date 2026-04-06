import type { Metadata } from "next";
import { Share_Tech_Mono, IBM_Plex_Mono, Courier_Prime } from "next/font/google";
import "./globals.css";
import { initTelegramBot } from "@/lib/telegram/init";

initTelegramBot();

const shareTechMono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-share-tech-mono",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
});

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-courier-prime",
});

export const metadata: Metadata = {
  title: "Calendar",
  description: "Personal calendar application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${shareTechMono.variable} ${ibmPlexMono.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-tactical bg-dr-bg text-dr-text">
        {children}
      </body>
    </html>
  );
}
