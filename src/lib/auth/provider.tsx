import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { usePrivy } from "@privy-io/react-auth";

type AuthIdentity = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
} | null;

type AppAuthState = {
  authenticated: boolean;
  ready: boolean;
  user: AuthIdentity;
  login: () => void;
  logout: () => Promise<void>;
};

const defaultAuthState: AppAuthState = {
  authenticated: false,
  ready: true,
  user: null,
  login: async () => {},
  logout: async () => {},
};

const AppAuthContext = createContext<AppAuthState>(defaultAuthState);

function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const identity: AuthIdentity = authenticated && user
    ? {
        id: user.id ?? user.wallet?.address ?? "privy-user",
        displayName:
          user.email?.address ??
          user.wallet?.address ??
          user.google?.name ??
          user.apple?.email ??
          "Privy User",
        primaryEmail: user.email?.address ?? user.google?.email ?? null,
        profileImageUrl: user.twitter?.profilePictureUrl ?? null,
      }
    : null;

  return (
    <AppAuthContext.Provider value={{ authenticated, ready, user: identity, login, logout }}>
      {children}
    </AppAuthContext.Provider>
  );
}

export function useAppAuth() {
  return useContext(AppAuthContext);
}

/**
 * App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
 *
 *   <AuthProvider><Outlet /></AuthProvider>
 *
 * Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
 * its `useSession()` works standalone — so this is a passthrough today. It's
 * kept as the single, stable mount point for any future client-side providers
 * (e.g. a toast or theme provider) without churning the root shell.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

  if (!appId) {
    return <AppAuthContext.Provider value={defaultAuthState}>{children}</AppAuthContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#f59e0b",
        },
        loginMethods: ["email", "wallet", "google"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <PrivyAuthBridge>{children}</PrivyAuthBridge>
    </PrivyProvider>
  );
}
