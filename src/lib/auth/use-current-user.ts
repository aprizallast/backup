import { useEffect, useState } from "react";
import { authClient, authEnabled } from "./client";
import { useAppAuth } from "./provider";
import { fetchProfileByUserId } from "@/lib/supabase";
import {
  PROFILE_IDENTITY_UPDATED_EVENT,
  resolveProfileIdentity,
  type ProfileIdentityUpdate,
} from "./profile-identity";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True when this is the sandbox/dev fallback (auth not configured). */
  isDevFallback: boolean;
};

/**
 * Stable fallback user, used ONLY when auth is disabled
 * (`VITE_AUTH_ENABLED=false`, the shipped default). With auth on, the sandbox
 * live preview does real sign-in via the baked preview client. Its id is
 * `"dev-user"` — the SAME id `verify.server.ts` returns server-side — so per-user
 * rows written in that mode belong to one consistent owner.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  username: null,
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/**
 * Current user + loading state. Same behavior in live preview and when deployed:
 *   - Auth enabled -> the real signed-in user; `user` is `null` while
 *                            the session resolves (`isPending: true`) and when
 *                            signed out (`isPending: false`). Session comes from
 *                            Better Auth `useSession()` → `/api/auth/get-session`
 *                            (cookie when deployed; bearer in live preview).
 *   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
 *
 * Protect a route by waiting out `isPending` before acting on `user` —
 * redirecting on `user: null` alone bounces signed-in visitors to sign-in on
 * every hard reload:
 *
 *   import { RedirectToSignIn } from "@/lib/auth/gates";
 *   const { user, isPending } = useCurrentUserState();
 *   if (isPending) return null;              // still resolving — don't redirect yet
 *   if (!user) return <RedirectToSignIn />;  // definitely signed out
 *
 * `authEnabled` is a module-level constant fixed at load, so the guarded hook
 * call keeps a stable hook order across every render of a given component.
 */
export { resolveProfileIdentity } from "./profile-identity";

export function useCurrentUserState(): CurrentUserState {
  const privy = useAppAuth();
  const privySessionUser = privy.user
    ? { ...privy.user, username: null, isDevFallback: false }
    : null;

  const [remoteProfile, setRemoteProfile] = useState<{
    username: string | null;
    displayName: string | null;
    primaryEmail: string | null;
    profileImageUrl: string | null;
  } | null>(null);
  const fallbackUser = privySessionUser ?? DEV_USER;

  useEffect(() => {
    if (authEnabled) return;
    let cancelled = false;

    const applyProfileUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ProfileIdentityUpdate>).detail;
      if (!detail || detail.userId !== fallbackUser.id) return;
      setRemoteProfile({
        username: detail.username,
        displayName: detail.displayName,
        primaryEmail: detail.primaryEmail,
        profileImageUrl: detail.profileImageUrl,
      });
    };

    window.addEventListener(PROFILE_IDENTITY_UPDATED_EVENT, applyProfileUpdate);
    void fetchProfileByUserId(fallbackUser.id).then((remote) => {
      if (cancelled || !remote) return;
      setRemoteProfile({
        username: remote.username || null,
        displayName: remote.username || remote.name || null,
        primaryEmail: remote.primary_email || null,
        profileImageUrl: remote.profile_image_url || null,
      });
    });

    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_IDENTITY_UPDATED_EVENT, applyProfileUpdate);
    };
  }, [fallbackUser.id]);

  if (!authEnabled) {
    const resolved = resolveProfileIdentity(
      {
        username: fallbackUser.username,
        displayName: fallbackUser.displayName,
        primaryEmail: fallbackUser.primaryEmail,
        profileImageUrl: fallbackUser.profileImageUrl,
      },
      remoteProfile,
    );

    return {
      user: {
        ...fallbackUser,
        username: resolved.username,
        displayName: resolved.displayName,
        primaryEmail: resolved.primaryEmail,
        profileImageUrl: resolved.profileImageUrl,
      },
      isPending: false,
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime
  const { data, isPending } = authClient.useSession();
  const authUser = data?.user
    ? {
        id: data.user.id,
        username: null,
        displayName: data.user.name || (data.user.email ? data.user.email.split("@")[0] : null),
        primaryEmail: data.user.email || null,
        profileImageUrl: data.user.image || null,
        isDevFallback: false,
      }
    : null;
  const user = authUser ?? privySessionUser;

  useEffect(() => {
    let cancelled = false;
    let profileUpdateVersion = 0;

    const handleProfileIdentityUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ProfileIdentityUpdate>).detail;
      if (!detail || detail.userId !== user?.id) return;
      profileUpdateVersion += 1;
      setRemoteProfile({
        username: detail.username,
        displayName: detail.displayName,
        primaryEmail: detail.primaryEmail,
        profileImageUrl: detail.profileImageUrl,
      });
    };

    if (typeof window !== "undefined") {
      window.addEventListener(PROFILE_IDENTITY_UPDATED_EVENT, handleProfileIdentityUpdate);
    }
    const requestVersion = profileUpdateVersion;

    async function hydrateRemoteProfile() {
      if (!user?.id) {
        if (!cancelled) setRemoteProfile(null);
        return;
      }

      const remote = await fetchProfileByUserId(user.id);
        if (cancelled || profileUpdateVersion !== requestVersion) return;

      if (!remote) {
        setRemoteProfile(null);
        return;
      }

      setRemoteProfile({
        username: remote.username || null,
        displayName: remote.username || remote.name || null,
        primaryEmail: remote.primary_email || null,
        profileImageUrl: remote.profile_image_url || null,
      });
    }

    void hydrateRemoteProfile();
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(PROFILE_IDENTITY_UPDATED_EVENT, handleProfileIdentityUpdate);
      }
    };
  }, [user?.id]);

  const emailName = user?.primaryEmail ? user.primaryEmail.split("@")[0] : "";
  const resolved = resolveProfileIdentity(
    {
      username: user?.username || null,
      displayName: user?.displayName || emailName || user?.primaryEmail || null,
      primaryEmail: user?.primaryEmail || null,
      profileImageUrl: user?.profileImageUrl || null,
    },
    remoteProfile,
  );

  return {
    user: user
      ? {
          id: user.id,
          username: resolved.username,
          displayName: resolved.displayName,
          primaryEmail: resolved.primaryEmail,
          profileImageUrl: resolved.profileImageUrl,
          isDevFallback: false,
        }
      : privySessionUser,
    isPending,
  };
}

/**
 * Convenience view of `useCurrentUserState().user` for display (e.g.
 * `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
 * for redirects/guards use `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
