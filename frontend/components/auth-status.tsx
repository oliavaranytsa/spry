"use client";

import Link from "next/link";
import { useAuth } from "react-oidc-context";

import { AvatarPicker } from "@/components/avatars";
import { cognitoLogoutUrl, googleEnabled } from "@/lib/auth";

// Header corner: who is signed in, or the way to sign in.
export function AuthStatus() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <span className="text-xs text-cream/60">…</span>;
  }

  if (auth.isAuthenticated) {
    const email = auth.user?.profile.email ?? auth.user?.profile.sub;
    const signOut = async () => {
      // Forget the tokens here, then let Cognito drop its own session cookie.
      await auth.removeUser();
      window.location.href = cognitoLogoutUrl();
    };
    const userId = auth.user?.profile.sub ?? "me";
    return (
      <div className="flex items-center gap-3">
        <AvatarPicker userId={userId} />
        <span
          className="hidden sm:inline text-sm font-semibold text-cream/90"
          title="Signed in"
        >
          {email}
        </span>
        <button
          onClick={signOut}
          className="text-xs font-bold border-2 border-cream text-cream hover:bg-cream hover:text-ink px-3 py-1.5 rounded-full transition-colors"
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
          className="text-xs font-bold border-2 border-cream text-cream hover:bg-cream hover:text-ink px-3 py-1.5 rounded-full transition-colors"
        >
          Sign in with Google
        </button>
      )}
      <Link
        href="/login"
        className="text-xs font-bold bg-lime text-ink border-2 border-lime hover:border-cream px-3 py-1.5 rounded-full transition-colors"
      >
        Sign in
      </Link>
    </div>
  );
}
