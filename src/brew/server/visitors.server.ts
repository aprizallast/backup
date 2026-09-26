import { persistVisitorLeave, persistVisitorPing } from "./supabase-storage.server.ts";

const sessions = new Map<string, number>();
const known = new Set<string>();
let totalVisits = 0;
const ACTIVE_MS = 45_000;

function prune(now: number) {
  for (const [id, seen] of sessions) {
    if (now - seen > ACTIVE_MS) sessions.delete(id);
  }
}

export async function pingVisitor(
  sessionId: string,
  path = "/",
  referrer = "",
  userProfile?: {
    userId?: string;
    username?: string;
    primaryEmail?: string;
    profileImageUrl?: string;
  },
) {
  const id = sessionId.slice(0, 80) || "anon";
  const now = Date.now();
  if (!known.has(id)) {
    known.add(id);
    totalVisits += 1;
  }
  sessions.set(id, now);
  prune(now);
  try {
    const persisted = await persistVisitorPing({
      sessionId: id,
      path,
      referrer,
      userId: userProfile?.userId,
      username: userProfile?.username,
      primaryEmail: userProfile?.primaryEmail,
      profileImageUrl: userProfile?.profileImageUrl,
    });
    if (persisted) {
      return {
        activeVisitors: Math.max(Number(persisted.active_visitors) || 0, 1),
        totalVisits: Number(persisted.total_visits) || 0,
        uniqueVisitors: Number(persisted.unique_visitors) || 0,
        lastVisitAt: persisted.last_visit_at || undefined,
      };
    }
  } catch (error) {
    console.warn("[supabase] visitor ping persistence failed:", error);
  }
  return {
    activeVisitors: Math.max(1, sessions.size),
    totalVisits,
    uniqueVisitors: known.size,
  };
}

export async function leaveVisitor(sessionId: string) {
  if (sessionId) sessions.delete(sessionId.slice(0, 80));
  prune(Date.now());
  try {
    const persisted = await persistVisitorLeave(sessionId);
    if (persisted) {
      return {
        activeVisitors: Math.max(Number(persisted.active_visitors) || 0, 0),
        totalVisits: Number(persisted.total_visits) || 0,
        uniqueVisitors: Number(persisted.unique_visitors) || 0,
        lastVisitAt: persisted.last_visit_at || undefined,
      };
    }
  } catch (error) {
    console.warn("[supabase] visitor leave persistence failed:", error);
  }
  return {
    activeVisitors: Math.max(0, sessions.size),
    totalVisits,
    uniqueVisitors: known.size,
  };
}
