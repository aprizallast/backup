import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FavoriteToken, ThesisEntry } from "@/lib/thesis/thesis-store";
import { resolveProfileIdentity } from "@/lib/auth/profile-identity";

export type RoomChatMode = "wallet" | "email";

export interface ChatMessageRow {
  id: string;
  room_id: string;
  sender: string;
  wallet_address: string;
  profile_image_url?: string | null;
  mode: RoomChatMode;
  text: string;
  created_at: string;
  kind: "user" | "system";
}

export interface ChatProfileRow {
  id?: string;
  user_id?: string | null;
  username?: string | null;
  name?: string | null;
  primary_email?: string | null;
  profile_image_url?: string | null;
  wallet_address: string;
  mode: RoomChatMode;
  joined_at?: string | null;
  updated_at?: string | null;
}

export interface AppProfileRow {
  user_id: string;
  username: string | null;
  primary_email: string | null;
  profile_image_url: string | null;
  wallet_address: string | null;
}

export interface AppPreferencesRow {
  user_id: string;
  theme: "dark" | "light";
  language: "en" | "zh" | "ja";
  favorite_token_address: string | null;
  favorite_token_symbol: string | null;
  favorite_token_name: string | null;
  updated_at?: string;
}

type ThesisDbRow = {
  id: string;
  user_id: string | null;
  wallet_address: string | null;
  username: string | null;
  primary_email: string | null;
  avatar_url: string | null;
  token_address: string;
  token_symbol: string;
  title: string;
  content: string;
  likes_count: number;
  created_at: string;
};

type ThesisLikeRow = { user_id: string };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

export const hasSupabase = Boolean(supabase);

export async function fetchMessagesForRoom(roomId: string): Promise<ChatMessageRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("room_chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Supabase room fetch failed:", error.message);
    return [];
  }

  return (data ?? []) as ChatMessageRow[];
}

export async function fetchProfileByUserId(userId: string): Promise<ChatProfileRow | null> {
  if (!supabase || !userId) return null;

  const { data: appProfile, error: appProfileError } = await supabase
    .from("user_profiles")
    .select("user_id, username, primary_email, profile_image_url, wallet_address")
    .eq("user_id", userId)
    .maybeSingle();

  if (!appProfileError && appProfile) {
    const row = appProfile as AppProfileRow;
    return {
      user_id: row.user_id,
      username: row.username,
      name: row.username || "Community Member",
      primary_email: row.primary_email,
      profile_image_url: row.profile_image_url,
      wallet_address: row.wallet_address || userId,
      mode: "email",
    };
  }

  const { data: profileSnapshot, error: snapshotError } = await supabase
    .from("user_profile_snapshots")
    .select("user_id, username, primary_email, profile_image_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!snapshotError && profileSnapshot) {
    return {
      user_id: profileSnapshot.user_id,
      name: profileSnapshot.username || "Community Member",
      username: profileSnapshot.username,
      primary_email: profileSnapshot.primary_email,
      profile_image_url: profileSnapshot.profile_image_url,
      wallet_address: userId,
      mode: "email",
    };
  }

  const { data, error } = await supabase
    .from("room_chat_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Supabase user profile fetch failed:", error.message);
    return null;
  }

  return (data as ChatProfileRow | null) ?? null;
}

export async function fetchProfilesByUserIds(userIds: string[]): Promise<Record<string, ChatProfileRow>> {
  if (!supabase || userIds.length === 0) return {};
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const profiles: Record<string, ChatProfileRow> = {};

  const { data: appProfiles, error: appProfileError } = await supabase
    .from("user_profiles")
    .select("user_id, username, primary_email, profile_image_url, wallet_address")
    .in("user_id", ids);
  if (!appProfileError) {
    for (const row of appProfiles ?? []) {
      profiles[row.user_id] = {
        user_id: row.user_id,
        username: row.username,
        name: row.username || "Community Member",
        primary_email: row.primary_email,
        profile_image_url: row.profile_image_url,
        wallet_address: row.wallet_address || row.user_id,
        mode: "email",
      };
    }
  }

  const missingIds = ids.filter((id) => !profiles[id]);
  if (missingIds.length > 0) {
    const { data: chatProfiles, error } = await supabase
      .from("room_chat_profiles")
      .select("*")
      .in("user_id", missingIds);
    if (error) {
      console.warn("Supabase chat profile fetch failed:", error.message);
    } else {
      for (const row of chatProfiles ?? []) profiles[row.user_id] = row as ChatProfileRow;
    }
  }
  return profiles;
}

export async function insertMessage(message: {
  room_id: string;
  sender: string;
  wallet_address: string;
  profile_image_url?: string;
  mode: RoomChatMode;
  text: string;
  kind: "user" | "system";
}) {
  if (!supabase) return null;

  const { data, error } = await supabase.from("room_chat_messages").insert({
    room_id: message.room_id,
    sender: message.sender,
    wallet_address: message.wallet_address,
    profile_image_url: message.profile_image_url ?? "",
    mode: message.mode,
    text: message.text,
    kind: message.kind,
    created_at: new Date().toISOString(),
  }).select();

  if (error) {
    console.warn("Supabase insert failed:", error.message);
    return null;
  }

  return data?.[0] ?? null;
}

export async function upsertProfile(profile: {
  userId?: string;
  username?: string;
  name?: string;
  displayName?: string;
  primaryEmail?: string;
  profileImageUrl?: string;
  wallet_address: string;
  mode: RoomChatMode;
}) {
  if (!supabase || !profile.userId) return false;

  const userId = profile.userId;
  const username = profile.username ?? profile.displayName ?? profile.name ?? "";
  const displayName = profile.displayName ?? profile.name ?? "Community Member";
  const primaryEmail = profile.primaryEmail ?? null;
  const profileImageUrl = profile.profileImageUrl ?? null;
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.rpc("save_profile_identity", {
    p_user_id: userId,
    p_username: username.trim().toLowerCase(),
    p_name: displayName,
    p_primary_email: primaryEmail,
    p_profile_image_url: profileImageUrl,
    p_wallet_address: profile.wallet_address,
    p_mode: profile.mode,
  });
  if (error) {
    console.warn(
      "Supabase profile sync failed. Apply FINAL.sql or supabase/schema.sql before saving profiles:",
      error.message,
    );
  }
  return !error;
}

export async function fetchUserAppPreferences(userId: string): Promise<AppPreferencesRow | null> {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("user_app_preferences")
    .select("user_id, theme, language, favorite_token_address, favorite_token_symbol, favorite_token_name, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("Supabase app preference fetch failed:", error.message);
    return null;
  }
  return (data as AppPreferencesRow | null) ?? null;
}

export async function saveUserAppPreferences(
  userId: string,
  update: Partial<Omit<AppPreferencesRow, "user_id" | "updated_at">>,
): Promise<boolean> {
  if (!supabase || !userId) return false;
  const existing = await fetchUserAppPreferences(userId);
  const { error } = await supabase.from("user_app_preferences").upsert({
    user_id: userId,
    theme: update.theme ?? existing?.theme ?? "dark",
    language: update.language ?? existing?.language ?? "en",
    favorite_token_address: update.favorite_token_address === undefined
      ? existing?.favorite_token_address ?? null
      : update.favorite_token_address,
    favorite_token_symbol: update.favorite_token_symbol === undefined
      ? existing?.favorite_token_symbol ?? null
      : update.favorite_token_symbol,
    favorite_token_name: update.favorite_token_name === undefined
      ? existing?.favorite_token_name ?? null
      : update.favorite_token_name,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) console.warn("Supabase app preference save failed:", error.message);
  return !error;
}

export async function fetchFavoriteTokenForUser(userId: string): Promise<FavoriteToken | null> {
  if (!supabase || !userId) return null;
  const preferences = await fetchUserAppPreferences(userId);
  if (preferences) {
    if (preferences.favorite_token_address) {
      const { data, error } = await supabase
        .from("favorite_tokens")
        .select("token_address, token_symbol, token_name")
        .eq("user_id", userId)
        .eq("token_address", preferences.favorite_token_address)
        .maybeSingle();
      if (error) console.warn("Supabase favorite token fetch failed:", error.message);
      return {
        address: data?.token_address ?? preferences.favorite_token_address,
        symbol: data?.token_symbol ?? preferences.favorite_token_symbol ?? "",
        name: data?.token_name ?? preferences.favorite_token_name ?? undefined,
      };
    }
  }

  const { data, error } = await supabase
    .from("favorite_tokens")
    .select("token_address, token_symbol, token_name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Supabase favorite token fetch failed:", error.message);
    return null;
  }
  return data
    ? { address: data.token_address, symbol: data.token_symbol, name: data.token_name ?? undefined }
    : null;
}

export async function saveFavoriteTokenForUser(userId: string, token: FavoriteToken): Promise<boolean> {
  if (!supabase || !userId || !token.address || !token.symbol) return false;
  const now = new Date().toISOString();
  const { error } = await supabase.from("favorite_tokens").upsert({
    user_id: userId,
    token_address: token.address.toLowerCase(),
    token_symbol: token.symbol,
    token_name: token.name ?? null,
    updated_at: now,
  }, { onConflict: "user_id,token_address" });
  if (error) {
    console.warn("Supabase favorite token save failed:", error.message);
    return false;
  }
  return saveUserAppPreferences(userId, {
    favorite_token_address: token.address.toLowerCase(),
    favorite_token_symbol: token.symbol,
    favorite_token_name: token.name ?? null,
  });
}

export async function clearFavoriteTokenForUser(userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { error } = await supabase.from("favorite_tokens").delete().eq("user_id", userId);
  if (error) console.warn("Supabase favorite token clear failed:", error.message);
  const savedPreferences = await saveUserAppPreferences(userId, {
    favorite_token_address: null,
    favorite_token_symbol: null,
    favorite_token_name: null,
  });
  return !error && savedPreferences;
}

function mapThesisRow(
  row: ThesisDbRow,
  likes: ThesisLikeRow[] = [],
  currentProfile?: ChatProfileRow,
): ThesisEntry {
  const likedBy = Array.from(new Set(likes.map((like) => like.user_id).filter(Boolean)));
  const authorEmail = currentProfile?.primary_email || row.primary_email || null;
  const authorIdentity = resolveProfileIdentity(
    {
      username: row.username,
      primaryEmail: authorEmail,
      profileImageUrl: row.avatar_url,
    },
    currentProfile,
  );
  return {
    id: row.id,
    tokenAddress: row.token_address.toLowerCase(),
    tokenSymbol: row.token_symbol,
    title: row.title,
    content: row.content,
    likes: Math.max(Number(row.likes_count) || 0, likedBy.length),
    likedBy,
    createdBy: authorIdentity.displayName || "Anonymous",
    createdById: row.user_id,
    createdByDisplayName: authorIdentity.displayName || "Anonymous",
    createdByEmail: authorEmail || undefined,
    createdByAvatarUrl: authorIdentity.profileImageUrl || undefined,
    createdAt: Date.parse(row.created_at) || Date.now(),
  };
}

async function fetchThesisLikes(thesisIds: string[]): Promise<Record<string, ThesisLikeRow[]>> {
  if (!supabase || thesisIds.length === 0) return {};
  const { data, error } = await supabase
    .from("thesis_likes")
    .select("thesis_id, user_id")
    .in("thesis_id", thesisIds);
  if (error) {
    console.warn("Supabase thesis likes fetch failed:", error.message);
    return {};
  }
  const grouped: Record<string, ThesisLikeRow[]> = {};
  for (const row of data ?? []) {
    (grouped[row.thesis_id] ??= []).push({ user_id: row.user_id });
  }
  return grouped;
}

export async function fetchRecentTokenTheses(tokenAddress?: string, limit = 300): Promise<ThesisEntry[]> {
  if (!supabase) return [];
  let query = supabase
    .from("token_theses")
    .select("id, user_id, wallet_address, username, primary_email, avatar_url, token_address, token_symbol, title, content, likes_count, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (tokenAddress) query = query.eq("token_address", tokenAddress.toLowerCase());
  const { data, error } = await query;
  if (error) {
    console.warn("Supabase thesis fetch failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as ThesisDbRow[];
  const likes = await fetchThesisLikes(rows.map((row) => row.id));
  const profiles = await fetchProfilesByUserIds(rows.map((row) => row.user_id ?? ""));
  return rows.map((row) => mapThesisRow(row, likes[row.id] ?? [], row.user_id ? profiles[row.user_id] : undefined));
}

async function syncRecentThesisCache(entry: ThesisEntry, viewerId: string | null): Promise<void> {
  if (!supabase) return;
  const { data: existing, error: lookupError } = await supabase
    .from("recent_thesis_cache")
    .select("id")
    .eq("thesis_id", entry.id)
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    console.warn("Supabase recent thesis cache lookup failed:", lookupError.message);
    return;
  }
  const row = {
    user_id: viewerId,
    token_address: entry.tokenAddress.toLowerCase(),
    token_symbol: entry.tokenSymbol,
    thesis_id: entry.id,
    thesis_title: entry.title,
    thesis_content: entry.content,
    thesis_author_user_id: entry.createdById ?? null,
    thesis_author_username: entry.createdBy?.toLowerCase() ?? null,
    thesis_author_email: entry.createdByEmail ?? null,
    thesis_author_avatar_url: entry.createdByAvatarUrl ?? null,
    likes_count: entry.likes,
    liked_by: entry.likedBy ?? [],
    updated_at: new Date().toISOString(),
  };
  const result = existing
    ? await supabase.from("recent_thesis_cache").update(row).eq("id", existing.id)
    : await supabase.from("recent_thesis_cache").insert(row);
  if (result.error) console.warn("Supabase recent thesis cache sync failed:", result.error.message);
}

export async function insertTokenThesis(input: {
  userId: string | null;
  username: string;
  primaryEmail: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  title: string;
  content: string;
}): Promise<ThesisEntry | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("token_theses").insert({
    user_id: input.userId,
    username: input.username.toLowerCase(),
    primary_email: input.primaryEmail,
    avatar_url: input.avatarUrl,
    wallet_address: input.walletAddress,
    token_address: input.tokenAddress.toLowerCase(),
    token_symbol: input.tokenSymbol,
    title: input.title,
    content: input.content,
    likes_count: 0,
  }).select("id, user_id, wallet_address, username, primary_email, avatar_url, token_address, token_symbol, title, content, likes_count, created_at").single();
  if (error || !data) {
    console.warn("Supabase thesis save failed:", error?.message);
    return null;
  }
  const entry = mapThesisRow(data as ThesisDbRow);
  await syncRecentThesisCache(entry, input.userId);
  return entry;
}

export async function likeSupabaseThesis(thesisId: string, userId: string): Promise<ThesisEntry | null> {
  if (!supabase || !userId) return null;
  const { data: owner, error: ownerError } = await supabase
    .from("token_theses")
    .select("user_id")
    .eq("id", thesisId)
    .maybeSingle();
  if (ownerError || !owner || owner.user_id === userId) return null;

  const { error: insertError } = await supabase.from("thesis_likes").insert({
    thesis_id: thesisId,
    user_id: userId,
  });
  if (insertError) {
    if (insertError.code !== "23505") console.warn("Supabase thesis like failed:", insertError.message);
    return null;
  }

  const { count, error: countError } = await supabase
    .from("thesis_likes")
    .select("id", { count: "exact", head: true })
    .eq("thesis_id", thesisId);
  if (!countError) {
    await supabase.from("token_theses").update({ likes_count: count ?? 0 }).eq("id", thesisId);
  }

  const { data: row, error: thesisError } = await supabase
    .from("token_theses")
    .select("id, user_id, wallet_address, username, primary_email, avatar_url, token_address, token_symbol, title, content, likes_count, created_at")
    .eq("id", thesisId)
    .maybeSingle();
  if (thesisError || !row) return null;
  const likes = await fetchThesisLikes([thesisId]);
  const entry = mapThesisRow(row as ThesisDbRow, likes[thesisId] ?? []);
  await syncRecentThesisCache(entry, userId);
  return entry;
}
