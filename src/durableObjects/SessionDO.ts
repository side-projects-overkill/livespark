/**
 * SessionDO — Cloudflare Durable Object
 * Holds real-time state for one presentation session.
 * Manages WebSocket connections and broadcasts state to all clients.
 */

export interface SlideDefinition {
  id: string;
  type: "multiple-choice" | "word-cloud" | "rating" | "open-text";
  question: string;
  options?: string[]; // for multiple-choice
}

export interface VoteData {
  // multiple-choice: { [optionIndex]: count }
  // rating: { [1-5]: count }
  // word-cloud / open-text: { [text]: count }
  counts: Record<string, number>;
  total: number;
}

export interface SessionState {
  sessionId: string;
  title: string;
  slides: SlideDefinition[];
  currentSlideIndex: number;
  votes: Record<string, VoteData>; // keyed by slideId
  audienceCount: number;
  isActive: boolean;
}

type IncomingMessage =
  | { type: "JOIN"; role: "host" | "audience" }
  | { type: "VOTE"; slideId: string; value: string }
  | { type: "GOTO_SLIDE"; index: number }
  | { type: "END_SESSION" }
  | { type: "INIT"; title: string; slides: SlideDefinition[] };

type OutgoingMessage =
  | { type: "STATE"; state: SessionState }
  | { type: "ERROR"; message: string };

export class SessionDO {
  private state: DurableObjectState;
  private sockets: Set<WebSocket> = new Set();
  private session: SessionState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const { 0: client, 1: server } = new WebSocketPair();
      server.accept();
      this.sockets.add(server);

      // Send current state snapshot
      if (this.session) {
        this.sendTo(server, { type: "STATE", state: this.session });
      }

      server.addEventListener("message", (evt) => {
        try {
          const msg: IncomingMessage = JSON.parse(evt.data as string);
          this.handleMessage(server, msg);
        } catch {
          this.sendTo(server, { type: "ERROR", message: "Invalid JSON" });
        }
      });

      server.addEventListener("close", () => {
        this.sockets.delete(server);
        if (this.session) {
          this.session.audienceCount = Math.max(0, this.sockets.size - 1); // -1 for host
          this.broadcast({ type: "STATE", state: this.session });
        }
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP: initialize session
    if (url.pathname.endsWith("/init") && request.method === "POST") {
      const body = (await request.json()) as { title: string; slides: SlideDefinition[] };
      this.session = {
        sessionId: url.searchParams.get("sessionId") ?? "unknown",
        title: body.title,
        slides: body.slides,
        currentSlideIndex: 0,
        votes: {},
        audienceCount: 0,
        isActive: true,
      };
      // Seed empty vote containers
      for (const slide of this.session.slides) {
        this.session.votes[slide.id] = { counts: {}, total: 0 };
      }
      await this.state.storage.put("session", this.session);
      return Response.json({ ok: true });
    }

    // HTTP: get state snapshot (for SSR initial load)
    if (url.pathname.endsWith("/state") && request.method === "GET") {
      if (!this.session) {
        const stored = await this.state.storage.get<SessionState>("session");
        if (stored) this.session = stored;
      }
      if (!this.session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }
      return Response.json(this.session);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleMessage(socket: WebSocket, msg: IncomingMessage) {
    if (!this.session) return;

    switch (msg.type) {
      case "JOIN": {
        if (msg.role === "audience") {
          this.session.audienceCount = this.sockets.size - 1; // rough estimate
        }
        this.broadcast({ type: "STATE", state: this.session });
        break;
      }

      case "VOTE": {
        const { slideId, value } = msg;
        if (!this.session.votes[slideId]) {
          this.session.votes[slideId] = { counts: {}, total: 0 };
        }
        const voteData = this.session.votes[slideId];
        voteData.counts[value] = (voteData.counts[value] ?? 0) + 1;
        voteData.total += 1;
        this.broadcast({ type: "STATE", state: this.session });
        break;
      }

      case "GOTO_SLIDE": {
        const newIndex = Math.max(
          0,
          Math.min(msg.index, this.session.slides.length - 1)
        );
        this.session.currentSlideIndex = newIndex;
        this.broadcast({ type: "STATE", state: this.session });
        break;
      }

      case "END_SESSION": {
        this.session.isActive = false;
        this.broadcast({ type: "STATE", state: this.session });
        break;
      }
    }

    // Persist updated state
    this.state.storage.put("session", this.session);
  }

  private broadcast(msg: OutgoingMessage) {
    const payload = JSON.stringify(msg);
    for (const socket of this.sockets) {
      try {
        socket.send(payload);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private sendTo(socket: WebSocket, msg: OutgoingMessage) {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      this.sockets.delete(socket);
    }
  }
}
