import assert from "node:assert/strict";
import test from "node:test";

import {
  addRecentThesis,
  cacheRecentThesis,
  likeThesis,
  readFavoriteToken,
  readRecentTheses,
  setFavoriteToken,
} from "./thesis-store.ts";

function withStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };

  return { storage, previous: globalThis.localStorage, previousWindow: globalThis.window };
}

test("sets and reads a favorite token for the user", () => {
  const { storage, previous, previousWindow } = withStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

  setFavoriteToken("0xabc123", "BrewBot");
  assert.equal(readFavoriteToken()?.address, "0xabc123");
  assert.equal(readFavoriteToken()?.symbol, "BrewBot");

  Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
});

test("stores and returns recent theses for a favorite token", () => {
  const { storage, previous, previousWindow } = withStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

  setFavoriteToken("0xabc123", "BrewBot");
  const first = addRecentThesis({ tokenAddress: "0xabc123", tokenSymbol: "BrewBot", title: "Momentum thesis", content: "Price is holding the 20MA." });
  const second = addRecentThesis({ tokenAddress: "0xabc123", tokenSymbol: "BrewBot", title: "Breakout thesis", content: "Fresh liquidity supports continuation." });

  const thesisList = readRecentTheses("0xabc123");
  assert.deepEqual(thesisList.map((item) => item.id), [second.id, first.id]);
  assert.equal(thesisList[0]?.title, "Breakout thesis");

  Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
});

test("persists the thesis author's username and avatar metadata", () => {
  const { storage, previous, previousWindow } = withStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

  const thesis = addRecentThesis({
    tokenAddress: "0xabc123",
    tokenSymbol: "BrewBot",
    title: "Trend thesis",
    content: "Breakout still intact.",
    createdBy: "dean",
    createdByDisplayName: "Dean Brew",
    createdByEmail: "dean@example.com",
    createdByAvatarUrl: "https://cdn.example.com/profile.png",
  });

  assert.equal(thesis.createdBy, "dean");
  assert.equal(thesis.createdByDisplayName, "Dean Brew");
  assert.equal(thesis.createdByEmail, "dean@example.com");
  assert.equal(thesis.createdByAvatarUrl, "https://cdn.example.com/profile.png");
  assert.equal(readRecentTheses("0xabc123")[0]?.createdByDisplayName, "Dean Brew");
  assert.equal(readRecentTheses("0xabc123")[0]?.createdByEmail, "dean@example.com");
  assert.equal(readRecentTheses("0xabc123")[0]?.createdByAvatarUrl, "https://cdn.example.com/profile.png");

  Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
});

test("preserves remote thesis IDs and timestamps when refreshing the local cache", () => {
  const { storage, previous, previousWindow } = withStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

  const remote = addRecentThesis({
    id: "8c08f720-8a55-4e71-beb8-b4d97e128424",
    createdAt: 1_700_000_000_000,
    tokenAddress: "0xabc123",
    tokenSymbol: "BrewBot",
    title: "Remote thesis",
    content: "Loaded from Supabase.",
    createdBy: "dean",
  });
  cacheRecentThesis({ ...remote, likes: 3, likedBy: ["user-2"] });

  const saved = readRecentTheses("0xabc123");
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.id, remote.id);
  assert.equal(saved[0]?.createdAt, 1_700_000_000_000);
  assert.equal(saved[0]?.likes, 3);
  assert.deepEqual(saved[0]?.likedBy, ["user-2"]);

  Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
});

test("sorts recent theses by like count before newest creation time", () => {
  const { storage, previous, previousWindow } = withStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

  const older = addRecentThesis({ tokenAddress: "0xabc123", tokenSymbol: "BrewBot", title: "Older thesis", content: "One note." });
  const newer = addRecentThesis({ tokenAddress: "0xabc123", tokenSymbol: "BrewBot", title: "Newer thesis", content: "More popular note." });
  const liked = readRecentTheses("0xabc123").find((entry) => entry.id === newer.id)!;
  const mutated = { ...liked, likes: 12 };
  const next = readRecentTheses("0xabc123").map((entry) => entry.id === newer.id ? mutated : entry);
  const sorted = [...next].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0));

  assert.ok(sorted[0]?.id === newer.id);
  assert.ok(sorted[1]?.id === older.id || sorted[1]?.id === newer.id);

  Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
});

test("only allows one like per user for another user's thesis", () => {
  const { storage, previous, previousWindow } = withStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });

  const thesis = addRecentThesis({
    tokenAddress: "0xabc123",
    tokenSymbol: "BrewBot",
    title: "Trend thesis",
    content: "Breakout still intact.",
    createdBy: "creator",
    createdById: "user-creator",
  });

  assert.equal(likeThesis("0xabc123", thesis.id, "user-creator"), null);
  assert.equal(likeThesis("0xabc123", thesis.id, "user-1")?.likes, 1);
  assert.equal(likeThesis("0xabc123", thesis.id, "user-1"), null);
  assert.equal(readRecentTheses("0xabc123")[0]?.likes, 1);

  Object.defineProperty(globalThis, "localStorage", { value: previous, configurable: true });
  Object.defineProperty(globalThis, "window", { value: previousWindow, configurable: true });
});
