export const AGENTBREW_TOKEN_CONTRACT = "0xaf9f85d2ccb145d55a977c8e5cfb831cde971bf8";
export const AGENTBREW_MINIMUM_HOLDING = 24_000_000;

const CLAIMED_USERNAMES_KEY = "agent_brew_claimed_usernames_v1";
const AGENTBREW_HOLDING_KEY = "agent_brew_roomchat_balance_v1";
export const PROFILE_STORAGE_KEY = "agent-brew-profile";
export const PROFILE_STORAGE_EVENT = "agent-brew-profile-updated";
export const PROFILE_IMAGE_MAX_CHARS = 260_000;
export const SPECIAL_DEVELOPER_EMAIL = "aprizal.ingkajaya@gmail.com";

let latestStoredProfileSnapshot: ReturnType<typeof readStoredProfile> | null = null;

export function getStoredProfileSnapshot(): ReturnType<typeof readStoredProfile> | null {
  if (typeof window === "undefined") return null;

  const next = readStoredProfile();
  if (!next) {
    if (latestStoredProfileSnapshot) {
      latestStoredProfileSnapshot = null;
    }
    return null;
  }

  const serialized = JSON.stringify(next);
  if (latestStoredProfileSnapshot && JSON.stringify(latestStoredProfileSnapshot) === serialized) {
    return latestStoredProfileSnapshot;
  }

  latestStoredProfileSnapshot = next;
  return latestStoredProfileSnapshot;
}

export function prepareProfileImageForStorage(value: string, maxChars = PROFILE_IMAGE_MAX_CHARS): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("data:image/")) return trimmed;

  if (trimmed.length <= maxChars) return trimmed;

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex === -1) {
    return trimmed.slice(0, maxChars);
  }

  const prefix = trimmed.slice(0, commaIndex + 1);
  const data = trimmed.slice(commaIndex + 1);
  const ratio = Math.max(0.15, maxChars / trimmed.length);
  const nextData = data.slice(0, Math.max(32, Math.floor(data.length * ratio * 0.9)));
  const candidate = prefix + nextData;
  return candidate.length > maxChars ? candidate.slice(0, maxChars) : candidate;
}

export function writeStoredProfile(next: { displayName: string; primaryEmail: string; profileImageUrl: string } | null): void {
  if (typeof window === "undefined") return;

  if (!next) {
    try {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    } catch {
      // ignore quota/time related storage failures
    }
    window.dispatchEvent(new Event(PROFILE_STORAGE_EVENT));
    return;
  }

  const safeNext = {
    displayName: next.displayName.trim(),
    primaryEmail: next.primaryEmail.trim(),
    profileImageUrl: prepareProfileImageForStorage(next.profileImageUrl),
  };

  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(safeNext));
    latestStoredProfileSnapshot = safeNext;
  } catch {
    try {
      const fallback = {
        ...safeNext,
        profileImageUrl: "",
      };
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(fallback));
      latestStoredProfileSnapshot = fallback;
    } catch {
      // Last-resort fallback: leave the profile unset rather than freezing the browser.
      latestStoredProfileSnapshot = null;
    }
  }

  window.dispatchEvent(new Event(PROFILE_STORAGE_EVENT));
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function readStoredProfile(): { displayName: string; primaryEmail: string; profileImageUrl: string } | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<{ displayName: string; primaryEmail: string; profileImageUrl: string }>;
    if (!parsed || typeof parsed !== "object") return null;
    const displayName = typeof parsed.displayName === "string" ? parsed.displayName.trim() : "";
    const primaryEmail = typeof parsed.primaryEmail === "string" ? parsed.primaryEmail.trim() : "";
    const profileImageUrl = typeof parsed.profileImageUrl === "string" ? parsed.profileImageUrl.trim() : "";
    if (!displayName && !primaryEmail && !profileImageUrl) return null;
    return { displayName, primaryEmail, profileImageUrl };
  } catch {
    return null;
  }
}

export function isDeveloperOverrideEmail(value?: string | null): boolean {
  return (value ?? "").trim().toLowerCase() === SPECIAL_DEVELOPER_EMAIL.toLowerCase();
}

export function resolveProfileEditorState(
  userProfile?: { displayName?: string | null; primaryEmail?: string | null; profileImageUrl?: string | null } | null,
  storedProfile?: { displayName?: string | null; primaryEmail?: string | null; profileImageUrl?: string | null } | null,
  currentDraft?: { displayName?: string | null; primaryEmail?: string | null; profileImageUrl?: string | null } | null,
): { displayName: string; primaryEmail: string; profileImageUrl: string } {
  const fallback = {
    displayName: storedProfile?.displayName ?? userProfile?.displayName ?? "",
    primaryEmail: storedProfile?.primaryEmail ?? userProfile?.primaryEmail ?? "",
    profileImageUrl: storedProfile?.profileImageUrl ?? userProfile?.profileImageUrl ?? "",
  };

  if (!currentDraft) {
    return fallback;
  }

  return {
    displayName: currentDraft.displayName ?? fallback.displayName,
    primaryEmail: currentDraft.primaryEmail ?? fallback.primaryEmail,
    profileImageUrl: currentDraft.profileImageUrl ?? fallback.profileImageUrl,
  };
}

export function getClaimedUsernames(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CLAIMED_USERNAMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.toLowerCase());
  } catch {
    return [];
  }
}

export function isUsernameTaken(username: string): boolean {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  return getClaimedUsernames().includes(normalized);
}

export function reserveUsername(username: string): boolean {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;

  const claimed = new Set(getClaimedUsernames());
  if (claimed.has(normalized)) return false;

  claimed.add(normalized);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CLAIMED_USERNAMES_KEY, JSON.stringify([...claimed]));
  }
  return true;
}

export function isDisplayNameTaken(displayName: string, currentDisplayName?: string | null): boolean {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) return false;

  const currentNormalized = currentDisplayName ? normalizeDisplayName(currentDisplayName) : "";
  if (currentNormalized && normalized === currentNormalized) return false;

  return getClaimedUsernames().includes(normalized);
}

export function reserveDisplayName(displayName: string, currentDisplayName?: string | null): boolean {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) return false;

  const currentNormalized = currentDisplayName ? normalizeDisplayName(currentDisplayName) : "";
  if (currentNormalized && normalized === currentNormalized) return true;

  const claimed = new Set(getClaimedUsernames());
  if (claimed.has(normalized)) return false;

  claimed.add(normalized);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CLAIMED_USERNAMES_KEY, JSON.stringify([...claimed]));
  }
  return true;
}

export function getAgentBrewHolding(): number {
  if (typeof window === "undefined") return AGENTBREW_MINIMUM_HOLDING;

  const raw = window.localStorage.getItem(AGENTBREW_HOLDING_KEY);
  const parsed = Number(raw ?? String(AGENTBREW_MINIMUM_HOLDING));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

export function setAgentBrewHolding(value: number): number {
  const next = Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AGENTBREW_HOLDING_KEY, String(next));
  }
  return next;
}

export function hasRequiredAgentBrewHolding(balance: number = getAgentBrewHolding()): boolean {
  return Number(balance) >= AGENTBREW_MINIMUM_HOLDING;
}
