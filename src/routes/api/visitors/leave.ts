import { createFileRoute } from "@tanstack/react-router";
import { leaveVisitor } from "@/brew/server/visitors.server";

export const Route = createFileRoute("/api/visitors/leave")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let sessionId = "";
        try {
          const raw = await request.text();
          const body = JSON.parse(raw) as { sessionId?: string };
          sessionId = String(body?.sessionId || "");
        } catch {
          sessionId = "";
        }
        return Response.json(await leaveVisitor(sessionId));
      },
    },
  },
});
