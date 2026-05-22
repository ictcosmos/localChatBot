"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  idToken: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let tokenRefreshInterval: NodeJS.Timeout | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
        tokenRefreshInterval = null;
      }

      if (currentUser) {
        try {
          setUser(currentUser);
          const initialToken = await currentUser.getIdToken();
          setIdToken(initialToken);

          // Refresh token every 50 minutes (50 * 60 * 1000 ms)
          tokenRefreshInterval = setInterval(async () => {
            try {
              console.log("[AuthContext] Proactively refreshing Firebase ID token...");
              const freshToken = await currentUser.getIdToken(true);
              setIdToken(freshToken);
            } catch (err) {
              console.error("[AuthContext] Error refreshing ID token proactively:", err);
            }
          }, 50 * 60 * 1000);
        } catch (err) {
          console.error("[AuthContext] Error getting initial token:", err);
          setUser(null);
          setIdToken(null);
        }
      } else {
        setUser(null);
        setIdToken(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    };
  }, []);

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("[AuthContext] Logout failed:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, idToken, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
