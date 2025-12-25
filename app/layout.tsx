import type { Metadata } from "next";
import { Roboto_Mono } from "next/font/google";
import "./globals.css";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "Domain Analytics Dashboard",
  description: "Compare performance metrics across multiple domains",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={robotoMono.variable}>
      <body className={robotoMono.className}>
        <ChunkErrorBoundary>
          <div className="min-h-screen bg-gray-50">
            {children}
          </div>
        </ChunkErrorBoundary>
      </body>
    </html>
  );
}
