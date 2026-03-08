"use client";

import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { SessionState } from "@/durableObjects/SessionDO";

const VOTE_COLORS = ["#6c63ff", "#ff6b9d", "#00d4aa", "#ffd166", "#ff6b6b", "#7ec8e3", "#b5838d"];

function SlideResults({ slide, votes }: { slide: SessionState["slides"][0]; votes: SessionState["votes"][string] }) {
  if (!votes || votes.total === 0) {
    return <p className="text-muted" style={{ textAlign: "center", padding: "24px 0" }}>No responses recorded</p>;
  }

  if (slide.type === "multiple-choice") {
    const maxCount = Math.max(1, ...(slide.options || []).map((_, i) => votes.counts?.[String(i)] ?? 0));
    return (
      <div className="bar-chart">
        {(slide.options || []).map((label, i) => {
          const count = votes.counts?.[String(i)] ?? 0;
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div key={i} className="bar-row">
              <span className="bar-label">{label || `Option ${i + 1}`}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${VOTE_COLORS[i % VOTE_COLORS.length]}, ${VOTE_COLORS[(i + 1) % VOTE_COLORS.length]})` }}
                >
                  {pct > 15 ? `${pct}%` : ""}
                </div>
              </div>
              <span className="bar-count">{count}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (slide.type === "rating") {
    const avg = Object.entries(votes.counts).reduce((acc, [k, v]) => acc + Number(k) * v, 0) / votes.total;
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "3rem", fontWeight: 800, color: "var(--color-accent-3)" }}>{avg.toFixed(1)}</div>
          <div style={{ fontSize: "1.2rem" }}>{"⭐".repeat(Math.round(avg))}{"☆".repeat(5 - Math.round(avg))}</div>
          <p className="text-secondary" style={{ marginTop: "4px" }}>{votes.total} votes</p>
        </div>
        <div className="bar-chart">
          {[1, 2, 3, 4, 5].map((star) => {
            const count = votes.counts?.[String(star)] ?? 0;
            const pct = Math.round((count / votes.total) * 100);
            return (
              <div key={star} className="bar-row">
                <span className="bar-label">{"⭐".repeat(star)}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--color-accent-3), var(--color-accent))" }}>
                    {pct > 15 ? `${pct}%` : ""}
                  </div>
                </div>
                <span className="bar-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (slide.type === "word-cloud") {
    const entries = Object.entries(votes.counts).sort((a, b) => b[1] - a[1]).slice(0, 50);
    const max = entries[0]?.[1] ?? 1;
    return (
      <div className="word-cloud">
        {entries.map(([word, count]) => (
          <span
            key={word}
            className="word-cloud-word"
            style={{
              fontSize: `${0.8 + (count / max) * 2.2}rem`,
              color: VOTE_COLORS[Math.floor(Math.random() * VOTE_COLORS.length)],
            }}
          >
            {word}
          </span>
        ))}
      </div>
    );
  }

  if (slide.type === "open-text") {
    return (
      <div className="text-feed">
        {Object.keys(votes.counts).map((text, i) => (
          <div key={i} className="text-feed-item">{text}</div>
        ))}
      </div>
    );
  }

  return null;
}

export function ResultsPage({ params }: any) {
  const sessionId: string = params?.sessionId ?? "";

  const [state] = useSyncedState<SessionState>(
    {
      sessionId,
      title: "Loading…",
      slides: [],
      currentSlideIndex: 0,
      votes: {},
      audienceCount: 0,
      isActive: false,
    },
    "sessionState",
    sessionId
  );

  const totalResponses = Object.values(state.votes).reduce((acc, v) => acc + (v?.total ?? 0), 0);

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">⚡ LiveSpark</span>
        <div className="flex gap-3 items-center">
          <span className="badge badge--success">Session Complete</span>
          <a href="/" className="btn btn--ghost btn--sm">← New Session</a>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
        <div style={{ marginBottom: "40px" }}>
          <h1>{state.title}</h1>
          <p className="text-secondary" style={{ marginTop: "8px" }}>
            {state.slides.length} slides · {totalResponses} total responses
          </p>
        </div>

        <div className="flex-col gap-6">
          {state.slides.map((slide, i) => (
            <div key={slide.id} className="card card--elevated">
              <div className="flex gap-3 items-center" style={{ marginBottom: "16px" }}>
                <span className="text-muted" style={{ fontSize: "0.82rem", fontWeight: 700 }}>#{i + 1}</span>
                <span className={`slide-type-tag slide-type-tag--${slide.type}`}>{slide.type.replace("-", " ")}</span>
                <h3 style={{ fontSize: "1.1rem", flex: 1 }}>{slide.question}</h3>
                <span className="text-muted" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                  {state.votes[slide.id]?.total ?? 0} responses
                </span>
              </div>
              <SlideResults slide={slide} votes={state.votes[slide.id] ?? { counts: {}, total: 0 }} />
            </div>
          ))}
        </div>

        {state.slides.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "64px" }}>
            <div className="spinner" style={{ margin: "0 auto 16px" }} />
            <p className="text-secondary">Loading results…</p>
          </div>
        )}
      </div>
    </div>
  );
}
