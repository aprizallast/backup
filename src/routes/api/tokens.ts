import { createFileRoute } from "@tanstack/react-router";
import { getTokensPayload } from "@/brew/server/feed.server";
import { persistTokenSnapshot, readTokenSnapshot } from "@/brew/server/supabase-storage.server";

export const Route = createFileRoute("/api/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const force = new URL(request.url).searchParams.get("force") === "true";
        try {
          let payload;
          try {
            payload = await getTokensPayload(force);
          } catch (error) {
            const snapshot = await readTokenSnapshot();
            if (snapshot) return Response.json(snapshot, { headers: { "cache-control": "public, max-age=15" } });
            throw error;
          }
          if (payload.tokens.length <= 5) {
            const snapshot = await readTokenSnapshot();
            if (snapshot) return Response.json(snapshot, { headers: { "cache-control": "public, max-age=15" } });
          }
          try {
            await persistTokenSnapshot(payload.tokens);
          } catch (error) {
            console.warn("[supabase] token snapshot persistence failed:", error);
          }
          return Response.json(payload, {
            headers: { "cache-control": "public, max-age=15" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Feed unavailable";
          return Response.json({ error: message, tokens: [] }, { status: 502 });
        }
      },
    },
  },
});
