import {
  User,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithPopup,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

function cleanUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

async function createOrUpdateUserProfile(user: User, provider: "google" | "anonymous") {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);

  if (existing.exists()) {
    await setDoc(
      userRef,
      {
        updatedAt: serverTimestamp(),
        lastLoginProvider: provider,
        isAnonymous: user.isAnonymous,
      },
      { merge: true }
    );
    return;
  }

  const emailBase = user.email ? user.email.split("@")[0] : "guest";
  const baseUsername = cleanUsername(emailBase) || "guest";
  const username = `${baseUsername}_${user.uid.slice(0, 6)}`;

  await setDoc(userRef, {
    uid: user.uid,
    fullName:
      user.displayName ||
      (provider === "anonymous" ? "Guest User" : "Google User"),
    username,
    email: user.email || "",
    photoURL: user.photoURL || "",
    authProvider: provider,
    isAnonymous: user.isAnonymous,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function continueWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  const result = await signInWithPopup(auth, provider);
  await createOrUpdateUserProfile(result.user, "google");

  return result.user;
}

export async function continueAsGuest() {
  const result = await signInAnonymously(auth);
  await createOrUpdateUserProfile(result.user, "anonymous");

  return result.user;
}
