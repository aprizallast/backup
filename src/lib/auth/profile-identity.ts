export const PROFILE_IDENTITY_UPDATED_EVENT = "agent-brew:profile-identity-updated";

export type ProfileIdentityUpdate = {
  userId: string;
  username: string | null;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

export function publishProfileIdentityUpdate(detail: ProfileIdentityUpdate): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_IDENTITY_UPDATED_EVENT, { detail }));
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function resolveProfileIdentity(
  source?: { username?: string | null; displayName?: string | null; primaryEmail?: string | null; profileImageUrl?: string | null } | null,
  storedProfile?: { username?: string | null; displayName?: string | null; primaryEmail?: string | null; profileImageUrl?: string | null } | null,
): { username: string | null; displayName: string; primaryEmail: string | null; profileImageUrl: string | null } {
  const candidateUsername = storedProfile?.username?.trim() || source?.username?.trim() || '';
  const username = candidateUsername && !isEmailAddress(candidateUsername) ? candidateUsername : null;
  const primaryEmail = source?.primaryEmail?.trim() || storedProfile?.primaryEmail?.trim() || null;
  const savedDisplayName = storedProfile?.displayName?.trim() || '';
  const sourceDisplayName = source?.displayName?.trim() || '';
  const displayName =
    username ||
    (!isEmailAddress(savedDisplayName) && savedDisplayName.toLowerCase() !== primaryEmail?.toLowerCase() ? savedDisplayName : '') ||
    (!isEmailAddress(sourceDisplayName) && sourceDisplayName.toLowerCase() !== primaryEmail?.toLowerCase() ? sourceDisplayName : '') ||
    'Community Member';
  const profileImageUrl = storedProfile?.profileImageUrl?.trim() || source?.profileImageUrl?.trim() || null;

  return {
    username,
    displayName,
    primaryEmail,
    profileImageUrl,
  };
}
