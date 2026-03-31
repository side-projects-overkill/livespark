/**
 * SessionDO — Cloudflare Durable Object
 * Holds real-time state for one presentation session.
 * Manages WebSocket connections and broadcasts state to all clients.
 */

export interface SlideDefinition {
  id: string;
  type: "multiple-choice" | "word-cloud" | "rating" | "open-text" | "quiz" | "qa";
  question: string;
  options?: string[]; // for multiple-choice and quiz
  correctAnswer?: number; // quiz only: index of the correct option
  timerSeconds?: number; // quiz only: countdown duration (10, 20, 30)
}

export interface VoteData {
  // multiple-choice: { [optionIndex]: count }
  // rating: { [1-5]: count }
  // word-cloud / open-text: { [text]: count }
  counts: Record<string, number>;
  total: number;
}

export interface Participant {
  id: string;
  nickname: string;
}

export interface QuizAnswer {
  participantId: string;
  optionIndex: number;
  answeredAt: number; // timestamp (ms)
  isCorrect: boolean;
  points: number;
}

export interface QuizSlideData {
  answers: Record<string, QuizAnswer>; // keyed by participantId
  timerStartedAt: number | null;
  timerEnded: boolean;
  revealed: boolean;
}

export interface LeaderboardEntry {
  participantId: string;
  nickname: string;
  totalPoints: number;
  correctCount: number;
}

export interface QAQuestion {
  id: string;
  text: string;
  authorId: string;
  authorNickname: string;
  upvotes: number;
  upvoterIds: string[];
  status: "active" | "answered" | "dismissed";
  submittedAt: number;
}

export interface QASlideData {
  questions: QAQuestion[];
}

export interface SessionState {
  sessionId: string;
  title: string;
  slides: SlideDefinition[];
  currentSlideIndex: number;
  votes: Record<string, VoteData>; // keyed by slideId
  audienceCount: number;
  isActive: boolean;
  participants: Record<string, Participant>; // keyed by participantId
  quizData: Record<string, QuizSlideData>; // keyed by slideId
  qaData: Record<string, QASlideData>; // keyed by slideId
  leaderboard: LeaderboardEntry[];
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
  // Track which sockets have already voted on each slide to prevent re-voting
  private votedSockets: Map<WebSocket, Set<string>> = new Map();

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
        this.votedSockets.delete(server);
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
      const sessionId = url.searchParams.get("sessionId") ?? "unknown";
      this.session = {
        sessionId,
        title: body.title,
        slides: body.slides,
        currentSlideIndex: 0,
        votes: {},
        audienceCount: 0,
        isActive: true,
        participants: {},
        quizData: {},
        qaData: {},
        leaderboard: [],
      };
      // Seed empty vote/quiz/qa containers
      for (const slide of this.session!.slides) {
        this.session!.votes[slide.id] = { counts: {}, total: 0 };
        if (slide.type === "quiz") {
          this.session!.quizData[slide.id] = { answers: {}, timerStartedAt: null, timerEnded: false, revealed: false };
        }
        if (slide.type === "qa") {
          this.session!.qaData[slide.id] = { questions: [] };
        }
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
        // Prevent re-voting: check if this socket already voted on this slide
        if (!this.votedSockets.has(socket)) {
          this.votedSockets.set(socket, new Set());
        }
        const socketVotes = this.votedSockets.get(socket)!;
        if (socketVotes.has(slideId)) {
          this.sendTo(socket, { type: "ERROR", message: "Already voted on this slide" });
          break;
        }
        socketVotes.add(slideId);

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
