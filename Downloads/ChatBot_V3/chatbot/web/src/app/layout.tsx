import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Antigravity Chat - AI Hybrid Chatbot",
  description: "Enterprise-grade local RAG, Web Search, and Reasoning Chatbot powered by Gemini",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased min-h-screen selection:bg-indigo-500 selection:text-white`}>
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" closeButton theme="dark" />
        </AuthProvider>
      </body>
    </html>
  );
}

