"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

// Cognito sends the browser here with ?code=&state=. AuthProvider notices the
// parameters on its own, checks the state against the one /login/ stored, and
// trades the code plus the PKCE verifier for tokens. This page only waits for
// that and then goes home.
export default function AuthCallbackPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated) router.replace("/");
  }, [auth.isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-700">
      {auth.error ? (
        <div className="text-center space-y-2">
          <p className="text-sm text-red-700">
            Sign-in failed: {auth.error.message}
          </p>
          <Link href="/login" className="text-sm text-blue-600 underline">
            Try again
          </Link>
        </div>
      ) : (
        <p className="text-sm">Signing you in…</p>
      )}
    </div>
  );
}
