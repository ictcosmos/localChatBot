"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Loader2,
  LogIn,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { continueAsGuest, continueWithGoogle } from "@/lib/authActions";

export default function SigninPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const [loadingAction, setLoadingAction] = useState<"google" | "guest" | null>(
    null
  );

  useEffect(() => {
    if (!loading && user) {
      router.replace("/chat");
    }
  }, [loading, user, router]);

  const handleGoogle = async () => {
    setLoadingAction("google");

    try {
      await continueWithGoogle();
      toast.success("Signed in with Google.");
      router.replace("/chat");
    } catch (err: any) {
      toast.error(err?.message || "Google sign-in failed.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGuest = async () => {
    setLoadingAction("guest");

    try {
      await continueAsGuest();
      toast.success("Continuing as guest.");
      router.replace("/chat");
    } catch (err: any) {
      toast.error(err?.message || "Anonymous sign-in failed.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out.");
    router.replace("/");
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-100">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow">
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm text-neutral-600">Checking session...</span>
        </div>
      </main>
    );
  }

  if (user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4">
        <div className="rounded-3xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-black">You are already signed in</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Redirecting you to chat...
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/chat">
              <Button>Go to Chat</Button>
            </Link>
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_transparent_35%),linear-gradient(135deg,_#f8fafc,_#eef2ff,_#f5f3ff)] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-2xl backdrop-blur lg:grid-cols-2">
          <section className="hidden bg-neutral-950 p-10 text-white lg:block">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-neutral-950">
                <Sparkles size={22} />
              </div>
              <div>
                <p className="font-bold">Local AI Chatbot</p>
                <p className="text-sm text-neutral-400">
                  Gemini + RAG + Firebase
                </p>
              </div>
            </div>

            <div className="mt-20">
              <h1 className="text-4xl font-black leading-tight">
                Welcome back.
              </h1>
              <p className="mt-5 text-base leading-7 text-neutral-300">
                Sign in with Google or continue as a guest. Your chats,
                documents, reasoning traces, and token usage are stored under
                your Firebase user account.
              </p>
            </div>

            <div className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-3">
                <Bot className="text-blue-300" />
                <div>
                  <p className="font-semibold">Local document workflow</p>
                  <p className="text-sm text-neutral-400">
                    Files are saved locally through FastAPI, not Firebase
                    Storage.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="p-6 sm:p-10">
            <Link
              href="/"
              className="text-sm font-medium text-neutral-500 hover:text-neutral-900"
            >
              ← Back home
            </Link>

            <div className="mt-8">
              <h2 className="text-3xl font-black text-neutral-950">Sign in</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Choose one Firebase authentication method.
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full gap-3"
                onClick={handleGoogle}
                disabled={loadingAction !== null}
              >
                {loadingAction === "google" ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <LogIn size={18} />
                )}
                Continue with Google
              </Button>

              <Button
                type="button"
                size="lg"
                className="w-full gap-3"
                onClick={handleGuest}
                disabled={loadingAction !== null}
              >
                {loadingAction === "guest" ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <UserRound size={18} />
                )}
                Continue as Guest
              </Button>
            </div>

            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-semibold">Guest mode note</p>
              <p className="mt-1 leading-6">
                Anonymous login is useful for testing. If the browser session is
                cleared, the guest account may be harder to recover.
              </p>
            </div>

            <p className="mt-6 text-center text-sm text-neutral-500">
              New here?{" "}
              <Link
                href="/signup"
                className="font-semibold text-neutral-950 hover:underline"
              >
                Go to sign up
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
