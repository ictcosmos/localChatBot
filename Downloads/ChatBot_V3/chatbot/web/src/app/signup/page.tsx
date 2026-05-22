"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

import { auth, db, API_BASE_URL } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const signupSchema = z.object({
  fullName: z.string().min(1, "Full Name is required"),
  username: z.string().min(3, "Username must be at least 3 characters").max(30).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
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
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true);
    try {
      // 1. Proactively check if the username is available
      const checkRes = await fetch(`${API_BASE_URL}/auth/check-username`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: data.username.toLowerCase() }),
      });

      if (!checkRes.ok) {
        throw new Error("Could not check username availability.");
      }

      const { available } = await checkRes.json();
      if (!available) {
        toast.error("Username is already taken.");
        setIsLoading(false);
        return;
      }

      // 2. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      
      const firebaseUser = userCredential.user;

      // 3. Write user profile document in Firestore
      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        fullName: data.fullName,
        username: data.username.toLowerCase(),
        email: data.email,
        createdAt: new Date().toISOString(), // Fallback local string before SERVER_TIMESTAMP
        updatedAt: new Date().toISOString(),
      });

      toast.success("Account created successfully!");
      router.push("/chat");
    } catch (error: any) {
      console.error("[Signup] Error:", error);
      toast.error(error.message || "Sign up failed. Please try again.");
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
            Create Account
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign up to get started with Antigravity Chat
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Full Name"
            placeholder="John Doe"
            error={errors.fullName?.message}
            disabled={isLoading}
            {...register("fullName")}
          />

          <Input
            label="Username"
            placeholder="johndoe"
            error={errors.username?.message}
            disabled={isLoading}
            {...register("username")}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="john@example.com"
            error={errors.email?.message}
            disabled={isLoading}
            {...register("email")}
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
            Sign Up
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link
            href="/signin"
            className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
