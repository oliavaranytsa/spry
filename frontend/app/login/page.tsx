"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";

import { authConfigured } from "@/lib/auth";

// The URL to submit. It starts the sign-in here, in the app, so the library
// can store its random state and PKCE verifier before the browser leaves for
// Cognito's managed login (email + password, and "Continue with Google").
// /login/?provider=Google skips Cognito's page and goes straight to Google.
export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (auth.isLoading || started.current) return;
    if (auth.isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!authConfigured || auth.error) return;

    started.current = true;
    const provider = new URLSearchParams(window.location.search).get(
      "provider",
    );
    void auth.signinRedirect(
      provider ? { extraQueryParams: { identity_provider: provider } } : {},
    );
  }, [auth, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-700">
      {!authConfigured ? (
        <p className="text-sm">
          Sign-in is not configured: run make deploy-cognito, then rebuild.
        </p>
      ) : auth.error ? (
        <p className="text-sm text-red-700">
          Could not start sign-in: {auth.error.message}
        </p>
      ) : (
        <p className="text-sm">Redirecting to sign-in…</p>
      )}
    </div>
  );
}
