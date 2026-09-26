import { createFileRoute } from "@tanstack/react-router";
import { pingVisitor } from "@/brew/server/visitors.server";

export const Route = createFileRoute("/api/visitors/ping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let sessionId = "";
        let path = "/";
        let referrer = "";
        try {
          const body = (await request.json()) as {
            sessionId?: string;
            path?: string;
            referrer?: string;
            userId?: string;
            username?: string;
            primaryEmail?: string;
            profileImageUrl?: string;
          };
          sessionId = String(body?.sessionId || "");
          path = String(body?.path || "/");
          referrer = String(body?.referrer || "");
          const userId = body?.userId ? String(body.userId) : undefined;
          const username = body?.username ? String(body.username) : undefined;
          const primaryEmail = body?.primaryEmail ? String(body.primaryEmail) : undefined;
          const profileImageUrl = body?.profileImageUrl ? String(body.profileImageUrl) : undefined;
          return Response.json(await pingVisitor(sessionId, path, referrer, { userId, username, primaryEmail, profileImageUrl }));
        } catch {
          sessionId = "";
        }
        return Response.json(await pingVisitor(sessionId, path, referrer));
      },
    },
  },
});
