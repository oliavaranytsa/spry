import { WebStorageStateStore } from "oidc-client-ts";
import type { AuthProviderProps } from "react-oidc-context";

// All compiled into the bundle at build time by scripts/deploy-frontend.sh,
// which reads them from .env (written by make deploy-cognito). None of them is
// a secret: the client is public and the browser uses PKCE instead.
const region = process.env.NEXT_PUBLIC_COGNITO_REGION ?? "us-east-1";
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? "";

export const googleEnabled =
  process.env.NEXT_PUBLIC_COGNITO_GOOGLE_ENABLED === "true";

export const authConfigured = Boolean(userPoolId && clientId && domain);

// No trailing slash: Cognito matches the callback URL exactly, and this is
// the form infra/cognito.yaml allows.
export const CALLBACK_PATH = "/auth/callback";

const isBrowser = typeof window !== "undefined";
const origin = isBrowser ? window.location.origin : "";

export const oidcConfig: AuthProviderProps = {
  authority: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
  client_id: clientId,
  redirect_uri: `${origin}${CALLBACK_PATH}`,
  response_type: "code",
  scope: "openid email profile",
  // Keep the session across tabs and reloads. The static export prerenders
  // without a window, so the store is only created in the browser.
  ...(isBrowser
    ? { userStore: new WebStorageStateStore({ store: window.localStorage }) }
    : {}),
  // Drop ?code=&state= from the address bar once the code is exchanged.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

// Cognito has no OIDC end-session endpoint; its own /logout clears the
// managed login's cookie and sends the browser back to logout_uri, which must
// be one of the client's LogoutURLs.
export function cognitoLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: clientId,
    logout_uri: `${window.location.origin}/`,
  });
  return `https://${domain}/logout?${params.toString()}`;
}
