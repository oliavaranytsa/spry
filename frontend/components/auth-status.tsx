"use client";

import Link from "next/link";
import { useAuth } from "react-oidc-context";

import { cognitoLogoutUrl, googleEnabled } from "@/lib/auth";

// Header corner: who is signed in, or the way to sign in.
export function AuthStatus() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <span className="text-xs text-slate-400">…</span>;
  }

  if (auth.isAuthenticated) {
    const email = auth.user?.profile.email ?? auth.user?.profile.sub;
    const signOut = async () => {
      // Forget the tokens here, then let Cognito drop its own session cookie.
      await auth.removeUser();
      window.location.href = cognitoLogoutUrl();
    };
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700" title="Signed in">
          {email}
        </span>
        <button
          onClick={signOut}
          className="text-xs border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded-lg"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {googleEnabled && (
        // Skips Cognito's page and goes straight to Google.
        <button
          onClick={() =>
            void auth.signinRedirect({
              extraQueryParams: { identity_provider: "Google" },
            })
          }
          className="text-xs border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded-lg"
        >
          Sign in with Google
        </button>
      )}
      <Link
        href="/login"
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"
      >
        Sign in
      </Link>
    </div>
  );
}
