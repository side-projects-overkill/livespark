import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { syncedStateRoutes, SyncedStateServer } from "rwsdk/use-synced-state/worker";

import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { HomePage } from "@/app/pages/home";
import { HostPage } from "@/app/pages/host";
import { AudiencePage } from "@/app/pages/audience";
import { ResultsPage } from "@/app/pages/results";
import { createSession, getSession, getSessionByCode } from "@/app/db/store";

export { SyncedStateServer };

export interface Env {
  ASSETS: Fetcher;
  SYNCED_STATE: DurableObjectNamespace<SyncedStateServer>;
}

export type AppContext = Record<string, never>;

export default defineApp([
  setCommonHeaders(),

  // rwsdk built-in synced-state routes (WebSocket + DO wiring)
  ...syncedStateRoutes((e: any) => (e as Env).SYNCED_STATE),

  // API: Create session
  route("/api/sessions", async ({ request }) => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const body = (await request.json()) as {
      title: string;
      slides: Array<{
        id: string;
        type: string;
        question: string;
        options?: string[];
      }>;
    };
    const meta = createSession(body.title, body.slides as any);
    return Response.json(meta);
  }),

  // API: Get session by ID
  route("/api/sessions/:id", ({ params }) => {
    const session = getSession(params.id);
    if (!session) return new Response("Not found", { status: 404 });
    return Response.json(session);
  }),

  // API: Join by short code
  route("/api/join/:code", ({ params }) => {
    const session = getSessionByCode(params.code);
    if (!session) return new Response("Not found", { status: 404 });
    return Response.json({ sessionId: session.sessionId });
  }),

  render(Document, [
    route("/", HomePage),
    route("/host/:sessionId", HostPage),
    route("/join/:sessionId", AudiencePage),
    route("/results/:sessionId", ResultsPage),
  ]),
]);

