export type FavoriteToken = {
  address: string;
  symbol: string;
  name?: string;
};

export type ThesisDraft = {
  id?: string;
  createdAt?: number;
  tokenAddress: string;
  tokenSymbol: string;
  title: string;
  content: string;
  likes?: number;
  likedBy?: string[];
  createdBy?: string | null;
  createdById?: string | null;
  createdByDisplayName?: string | null;
  createdByEmail?: string | null;
  createdByAvatarUrl?: string | null;
};

export type ThesisEntry = ThesisDraft & {
  id: string;
  createdAt: number;
  likes: number;
};

const FAVORITE_KEY = "agent-brew.favorite-token";
const RECENT_KEY_PREFIX = "agent-brew.recent-theses.";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

function sortRecentTheses(entries: ThesisEntry[]): ThesisEntry[] {
  return [...entries].sort((a, b) => {
    const likeDelta = (b.likes ?? 0) - (a.likes ?? 0);
    if (likeDelta !== 0) return likeDelta;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
}

export function setFavoriteToken(address: string, symbol: string, name?: string) {
  if (!address) return;
  writeJson(FAVORITE_KEY, { address: address.toLowerCase(), symbol, name } satisfies FavoriteToken);
}

export function readFavoriteToken(): FavoriteToken | null {
  return readJson<FavoriteToken>(FAVORITE_KEY);
}

export function readRecentTheses(tokenAddress?: string): ThesisEntry[] {
  const target = (tokenAddress ?? readFavoriteToken()?.address ?? "").toLowerCase();
  if (!target) return [];
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(`${RECENT_KEY_PREFIX}${target}`);
    const parsed = raw ? (JSON.parse(raw) as ThesisEntry[]) : [];
    const normalized = Array.isArray(parsed)
      ? parsed.map((entry) => ({
          ...entry,
          likes: Number.isFinite(entry.likes) ? Number(entry.likes) : 0,
          likedBy: Array.isArray(entry.likedBy) ? Array.from(new Set(entry.likedBy.filter(Boolean))) : [],
          createdById: typeof entry.createdById === "string" ? entry.createdById : null,
        }))
      : [];
    return sortRecentTheses(normalized as ThesisEntry[]);
  } catch {
    return [];
  }
}

export function addRecentThesis(draft: ThesisDraft): ThesisEntry {
  const tokenAddress = draft.tokenAddress.toLowerCase();
  const createdBy = typeof draft.createdBy === "string" ? draft.createdBy.trim() || "Anonymous" : "Anonymous";
  const createdById = typeof draft.createdById === "string" ? draft.createdById.trim() || null : null;
  const createdByDisplayName = typeof draft.createdByDisplayName === "string"
    ? draft.createdByDisplayName.trim() || createdBy
    : createdBy;
  const createdByAvatarUrl = typeof draft.createdByAvatarUrl === "string"
    ? draft.createdByAvatarUrl.trim() || undefined
    : undefined;
  const entry: ThesisEntry = {
    ...draft,
    likes: Number.isFinite(draft.likes) ? Number(draft.likes) : 0,
    likedBy: Array.isArray(draft.likedBy) ? Array.from(new Set(draft.likedBy.filter(Boolean))) : [],
    tokenAddress,
    createdBy,
    createdById,
    createdByDisplayName,
    createdByAvatarUrl,
    id: draft.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: draft.createdAt ?? Date.now(),
  };

  return cacheRecentThesis(entry);
}

export function cacheRecentThesis(entry: ThesisEntry): ThesisEntry {
  const tokenAddress = entry.tokenAddress.toLowerCase();
  const existing = readRecentTheses(tokenAddress);
  const next = sortRecentTheses([
    entry,
    ...existing.filter((item) => item.id !== entry.id),
  ]).slice(0, 8);
  writeJson(`${RECENT_KEY_PREFIX}${tokenAddress}`, next);
  return entry;
}

export function likeThesis(tokenAddress: string, thesisId: string, userId?: string | null) {
  const target = (tokenAddress || "").toLowerCase();
  if (!target || !thesisId || !userId) return null;

  const existing = readRecentTheses(target);
  const thesis = existing.find((entry) => entry.id === thesisId);
  if (!thesis) return null;
  if (thesis.createdById === userId) return null;
  if ((thesis.likedBy ?? []).includes(userId)) return null;

  const nextEntries = existing.map((entry) => {
    if (entry.id !== thesisId) return entry;
    return {
      ...entry,
      likes: (entry.likes ?? 0) + 1,
      likedBy: Array.from(new Set([...(entry.likedBy ?? []), userId])),
    };
  });

  const sorted = sortRecentTheses(nextEntries);
  writeJson(`${RECENT_KEY_PREFIX}${target}`, sorted.slice(0, 8));
  return sorted.find((entry) => entry.id === thesisId) ?? null;
}

export function removeFavoriteToken() {
  const storage = safeStorage();
  storage?.removeItem(FAVORITE_KEY);
}
