"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileText,
  History,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const features = [
  {
    icon: Bot,
    title: "Gemini Chatbot",
    description: "Answer technical and general questions using Gemini.",
  },
  {
    icon: FileText,
    title: "Document RAG",
    description: "Upload PDF, DOCX, or TXT and ask questions from it.",
  },
  {
    icon: History,
    title: "Chat History",
    description: "Maintain user-specific conversations and follow-up context.",
  },
  {
    icon: Search,
    title: "Search Ready",
    description: "Prepared for current-information routing later.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [loading, user, router]);

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully.");
    router.replace("/");
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#dbeafe,_transparent_35%),linear-gradient(135deg,_#f8fafc,_#eef2ff,_#f5f3ff)] px-4 py-8 text-neutral-950">
      <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/70 bg-white/70 px-5 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white shadow">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="text-sm font-bold">Local AI Chatbot</p>
            <p className="text-xs text-neutral-500">Gemini + RAG + Firebase</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!loading && user ? (
            <>
              <Link href="/chat">
                <Button>Open Chat</Button>
              </Link>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut size={16} />
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link href="/signin">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button>Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl items-center gap-10 pb-14 pt-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/70 px-4 py-2 text-sm text-blue-700 shadow-sm backdrop-blur">
            <ShieldCheck size={16} />
            Google sign-in + anonymous guest mode
          </div>

          <h1 className="max-w-3xl text-5xl font-black tracking-tight text-neutral-950 md:text-6xl">
            Build your own{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              smart AI chatbot
            </span>{" "}
            with documents.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
            A local chatbot system with Gemini, Firebase Authentication,
            Firestore chat history, local file upload, Chroma vector database,
            RAG-based document answers, reasoning trace, and token usage.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {!loading && user ? (
              <>
                <Link href="/chat">
                  <Button size="lg">Continue to Chat</Button>
                </Link>
                <Button size="lg" variant="outline" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link href="/signup">
                  <Button size="lg">Get Started</Button>
                </Link>
                <Link href="/signin">
                  <Button size="lg" variant="outline">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-4 text-sm text-neutral-500">
            <span>✓ No Firebase Storage billing</span>
            <span>✓ Local uploads</span>
            <span>✓ Local Chroma DB</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-r from-blue-300/40 to-purple-300/40 blur-3xl" />

          <div className="relative rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-2xl backdrop-blur">
            <div className="rounded-2xl bg-neutral-950 p-4 text-white">
              <div className="mb-4 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
                <p className="ml-3 text-xs text-neutral-400">chat.local</p>
              </div>

              <div className="space-y-3">
                <div className="max-w-[80%] rounded-2xl bg-white/10 px-4 py-3 text-sm">
                  Upload this proposal and tell me who the secretary is.
                </div>
                <div className="ml-auto max-w-[85%] rounded-2xl bg-blue-600 px-4 py-3 text-sm">
                  I found the answer from the uploaded document. The ICT Club
                  Secretary is listed in the proposal context.
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-neutral-300">
                  Route: RAG · Tools: chat_history, rag_search, gemini · Tokens:
                  786 / 49 / 835
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                  >
                    <Icon className="mb-3 text-blue-600" size={22} />
                    <h3 className="text-sm font-bold">{feature.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
