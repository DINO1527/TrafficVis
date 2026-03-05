import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import Sidebar from '@/components/Sidebar';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TrafficVis AI - Admin Portal',
  description: 'Sri Lanka Traffic Violation Detection System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-950 text-slate-200`}>
        <div className="flex h-screen overflow-hidden">
          {/* Fixed Sidebar */}
          <Sidebar />
          
          {/* Scrollable Main Content */}
          <main className="flex-1 ml-64 overflow-y-auto h-full p-8 bg-slate-950">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}