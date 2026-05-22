"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";

import { auth, API_BASE_URL } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const signinSchema = z.object({
  identifier: z.string().min(3, "Email or Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SigninFormValues = z.infer<typeof signinSchema>;

export default function SigninPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already signed in
  useEffect(() => {
    if (!authLoading && user) {
      router.push("/chat");
    }
  }, [user, authLoading, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SigninFormValues>({
    resolver: zodResolver(signinSchema),
  });

  const onSubmit = async (data: SigninFormValues) => {
    setIsLoading(true);
    let email = data.identifier.trim();

    try {
      // 1. If identifier is not an email (does not contain @), resolve username
      if (!email.includes("@")) {
        const resolveRes = await fetch(`${API_BASE_URL}/auth/resolve-username`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username: email.toLowerCase() }),
        });

        if (resolveRes.status === 404) {
          toast.error("Username not found.");
          setIsLoading(false);
          return;
        }

        if (!resolveRes.ok) {
          throw new Error("Could not resolve username to email.");
        }

        const resolved = await resolveRes.json();
        email = resolved.email;
      }

      // 2. Perform Firebase Auth email/password sign-in
      await signInWithEmailAndPassword(auth, email, data.password);
      toast.success("Successfully signed in!");
      router.push("/chat");
    } catch (error: any) {
      console.error("[Signin] Error:", error);
      let errorMsg = "Sign in failed. Please verify your credentials.";
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        errorMsg = "Incorrect email/username or password.";
      } else if (error.message) {
        errorMsg = error.message;
      }
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      {/* Background ambient glowing blobs */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

      <div className="z-10 w-full max-w-md bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 p-8 rounded-2xl shadow-2xl shadow-black/50">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to access your chats and documents
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Email or Username"
            placeholder="johndoe or john@example.com"
            error={errors.identifier?.message}
            disabled={isLoading}
            {...register("identifier")}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            disabled={isLoading}
            {...register("password")}
          />

          <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
            Sign In
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
