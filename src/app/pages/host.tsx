"use client";

import { useState, useEffect } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { SessionState } from "@/durableObjects/SessionDO";

interface HostPageProps {
  sessionId: string;
  hostSecret: string;
  title: string;
  shortCode: string;
}

const VOTE_COLORS = ["#6c63ff", "#ff6b9d", "#00d4aa", "#ffd166", "#ff6b6b", "#7ec8e3", "#b5838d"];

function BarChart({ slide, votes }: { slide: SessionState["slides"][0]; votes: SessionState["votes"][string] }) {
  const items = slide.type === "multiple-choice" ? (slide.options || []) : [];
  const maxCount = Math.max(1, ...items.map((_, i) => votes?.counts?.[String(i)] ?? 0));

  return (
    <div className="bar-chart">
      {items.map((label, i) => {
        const count = votes?.counts?.[String(i)] ?? 0;
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
      {items.length === 0 && (
        <p className="text-muted" style={{ textAlign: "center", padding: "24px" }}>No options defined</p>
      )}
    </div>
  );
}

function RatingChart({ votes }: { votes: SessionState["votes"][string] }) {
  if (!votes || votes.total === 0) {
    return <p className="text-muted" style={{ textAlign: "center", padding: "24px" }}>Waiting for responses…</p>;
  }
  const avg = Object.entries(votes.counts).reduce((acc, [k, v]) => acc + Number(k) * v, 0) / votes.total;
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "4rem", fontWeight: 800, color: "var(--color-accent-3)" }}>
        {avg.toFixed(1)}
      </div>
      <div style={{ fontSize: "1.5rem", marginBottom: "16px" }}>
        {"⭐".repeat(Math.round(avg))}{"☆".repeat(5 - Math.round(avg))}
      </div>
      <p className="text-secondary">{votes.total} response{votes.total !== 1 ? "s" : ""}</p>
      <div className="bar-chart" style={{ marginTop: "24px" }}>
        {[1, 2, 3, 4, 5].map((star) => {
          const count = votes.counts?.[String(star)] ?? 0;
          const pct = votes.total > 0 ? Math.round((count / votes.total) * 100) : 0;
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

function WordCloudDisplay({ votes }: { votes: SessionState["votes"][string] }) {
  const entries = Object.entries(votes?.counts ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 40);
  if (entries.length === 0) {
    return <p className="text-muted" style={{ textAlign: "center", padding: "24px" }}>Waiting for responses…</p>;
  }
  const max = entries[0][1];
  return (
    <div className="word-cloud">
      {entries.map(([word, count]) => {
        const size = 0.8 + (count / max) * 2.5;
        const opacity = 0.5 + (count / max) * 0.5;
        const color = VOTE_COLORS[Math.floor(Math.random() * VOTE_COLORS.length)];
        return (
          <span
            key={word}
            className="word-cloud-word"
            style={{ fontSize: `${size}rem`, opacity, color }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

function OpenTextDisplay({ votes }: { votes: SessionState["votes"][string] }) {
  const entries = Object.keys(votes?.counts ?? {});
  if (entries.length === 0) {
    return <p className="text-muted" style={{ textAlign: "center", padding: "24px" }}>Waiting for responses…</p>;
  }
  return (
    <div className="text-feed">
      {entries.map((text, i) => (
        <div key={i} className="text-feed-item">{text}</div>
      ))}
    </div>
  );
}

export function HostPage({ params }: any) {
  const sessionId: string = params?.sessionId ?? "";
  const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${sessionId}` : "";

  const initialState: SessionState = {
    sessionId,
    title: "Loading…",
    slides: [],
    currentSlideIndex: 0,
    votes: {},
    audienceCount: 0,
    isActive: true,
  };

  const [state, setState] = useSyncedState<SessionState>(initialState, "sessionState", sessionId);
  // Local state for the join code (fetched from the store; NOT derived from sessionId)
  const [shortCode, setShortCode] = useState<string>("");
  // Read the live audience count that audience.tsx increments/decrements
  const [audienceCount] = useSyncedState<number>(0, "audienceCount", sessionId);

  const slide = state.slides[state.currentSlideIndex];
  const votes = slide ? state.votes[slide.id] : undefined;
  const isFirst = state.currentSlideIndex === 0;
  const isLast = state.currentSlideIndex >= state.slides.length - 1;

  // Load session metadata on mount.
  // Use functional updater so we only seed state when the DO has no data yet
  // (slides.length === 0). On a host refresh the DO already has votes + current
  // slide, so the updater returns `current` unchanged and nothing is lost.
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((meta: any) => {
        // Always expose the real shortCode for the join panel
        setShortCode(meta.shortCode ?? sessionId.slice(0, 6).toUpperCase());
        // Only initialise the synced state when the DO is genuinely empty
        setState((current: SessionState) => {
          if (current.slides.length > 0) return current; // DO state already loaded — don't overwrite
          return {
            sessionId,
            title: meta.title,
            slides: meta.slides,
            currentSlideIndex: 0,
            votes: Object.fromEntries(
              meta.slides.map((s: any) => [s.id, { counts: {}, total: 0 }])
            ),
            audienceCount: 0,
            isActive: true,
          };
        });
      })
      .catch(() => {});
  }, [sessionId]);

  function prev() {
    setState((s: SessionState) => ({ ...s, currentSlideIndex: Math.max(0, s.currentSlideIndex - 1) }));
  }

  function next() {
    setState((s: SessionState) => ({ ...s, currentSlideIndex: Math.min(s.slides.length - 1, s.currentSlideIndex + 1) }));
  }

  function endSession() {
    setState((s: SessionState) => ({ ...s, isActive: false }));
    window.location.href = `/results/${sessionId}`;
  }

  async function copyJoinUrl() {
    await navigator.clipboard.writeText(joinUrl);
  }

  return (
    <div className="page">
      <nav className="navbar">
        <div className="flex items-center gap-3">
          <span className="navbar-brand">⚡ LiveSpark</span>
          <span className="navbar-hide-mobile" style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>{state.title}</span>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-secondary navbar-hide-mobile" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
            👥 {audienceCount} connected
          </span>
          <span className="live-dot">Live</span>
          <button className="btn btn--danger btn--sm" onClick={endSession}>End Session</button>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: "32px", paddingBottom: "40px" }}>
        <div className="grid-2" style={{ alignItems: "start" }}>

          {/* Left: slide display */}
          <div>
            {slide ? (
              <div className="card card--elevated">
                <div className="flex justify-between items-center" style={{ marginBottom: "8px" }}>
                  <span className={`slide-type-tag slide-type-tag--${slide.type}`}>{slide.type.replace("-", " ")}</span>
                  <span className="text-muted" style={{ fontSize: "0.82rem" }}>
                    {state.currentSlideIndex + 1} / {state.slides.length}
                  </span>
                </div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: "24px" }}>{slide.question}</h2>

                {slide.type === "multiple-choice" && (
                  <BarChart slide={slide} votes={votes ?? { counts: {}, total: 0 }} />
                )}
                {slide.type === "rating" && (
                  <RatingChart votes={votes ?? { counts: {}, total: 0 }} />
                )}
                {slide.type === "word-cloud" && (
                  <WordCloudDisplay votes={votes ?? { counts: {}, total: 0 }} />
                )}
                {slide.type === "open-text" && (
                  <OpenTextDisplay votes={votes ?? { counts: {}, total: 0 }} />
                )}

                <div className="divider" />
                <p className="text-secondary" style={{ fontSize: "0.85rem", textAlign: "right" }}>
                  {votes?.total ?? 0} response{votes?.total !== 1 ? "s" : ""}
                </p>
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: "64px" }}>
                <div className="spinner" style={{ margin: "0 auto" }} />
                <p style={{ marginTop: "16px" }}>Loading session…</p>
              </div>
            )}

            {/* Prev / Next */}
            <div className="flex justify-between" style={{ marginTop: "16px" }}>
              <button className="btn btn--ghost" onClick={prev} disabled={isFirst}>← Prev</button>
              <button className="btn btn--primary" onClick={next} disabled={isLast}>Next →</button>
            </div>
          </div>

          {/* Right: join info */}
          <div className="flex-col gap-4">
            <div className="card" style={{ textAlign: "center" }}>
              <p className="text-secondary" style={{ marginBottom: "8px", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Join at livespark.app/join</p>
              <div className="session-code">{shortCode || "------"}</div>
              <p className="text-muted" style={{ marginTop: "4px", fontSize: "0.78rem" }}>or scan the QR code</p>
              <button className="btn btn--ghost btn--sm" style={{ marginTop: "12px" }} onClick={copyJoinUrl}>
                📋 Copy Link
              </button>
            </div>

            <div className="card">
              <h4 style={{ marginBottom: "12px" }}>All Slides</h4>
              {state.slides.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => setState((prev) => ({ ...prev, currentSlideIndex: i }))}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    marginBottom: "6px",
                    background: i === state.currentSlideIndex ? "rgba(108,99,255,0.15)" : "transparent",
                    border: i === state.currentSlideIndex ? "1px solid var(--color-primary)" : "1px solid transparent",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  <div className="flex gap-2 items-center">
                    <span className={`slide-type-tag slide-type-tag--${s.type}`} style={{ fontSize: "0.65rem" }}>
                      {s.type.replace("-", " ")}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.question || "Untitled"}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      {state.votes[s.id]?.total ?? 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
