"use client";

import { useState, useEffect } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { SessionState } from "@/durableObjects/SessionDO";

const STAR_COLORS = ["#ffd166", "#ffd166", "#ffd166", "#ffd166", "#ffd166"];

export function AudiencePage({ params }: any) {
  const sessionId: string = params?.sessionId ?? "";

  const [state, setState] = useSyncedState<SessionState>(
    {
      sessionId,
      title: "Loading…",
      slides: [],
      currentSlideIndex: 0,
      votes: {},
      audienceCount: 0,
      isActive: true,
    },
    "sessionState",
    sessionId
  );

  // Track live audience headcount in its own synced key
  const [, setAudienceCount] = useSyncedState<number>(0, "audienceCount", sessionId);
  useEffect(() => {
    setAudienceCount((n: number) => n + 1);
    return () => { setAudienceCount((n: number) => Math.max(0, n - 1)); };
  }, [sessionId]);

  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [hoverStar, setHoverStar] = useState(0);
  const [textInput, setTextInput] = useState("");

  const slide = state.slides[state.currentSlideIndex];

  function submitVote(slideId: string, value: string) {
    if (voted[slideId]) return;
    setState((s: SessionState) => {
      const vd = s.votes[slideId] ?? { counts: {}, total: 0 };
      return {
        ...s,
        votes: {
          ...s.votes,
          [slideId]: {
            counts: { ...vd.counts, [value]: (vd.counts[value] ?? 0) + 1 },
            total: vd.total + 1,
          },
        },
      };
    });
    setVoted((v) => ({ ...v, [slideId]: true }));
  }

  if (!state.isActive) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="card" style={{ textAlign: "center", maxWidth: "400px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "16px" }}>🏁</div>
          <h2>Session Ended</h2>
          <p style={{ marginTop: "8px" }}>Thanks for participating!</p>
          <a href="/" className="btn btn--primary" style={{ marginTop: "24px", display: "inline-flex" }}>← Go Home</a>
        </div>
      </div>
    );
  }

  if (!slide) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <p className="text-secondary">Connecting to session…</p>
        </div>
      </div>
    );
  }

  const hasVoted = voted[slide.id];

  return (
    <div className="page">
      <nav className="navbar">
        <span className="navbar-brand">⚡ LiveSpark</span>
        <div className="flex gap-3 items-center">
          <span className="text-secondary" style={{ fontSize: "0.82rem" }}>{state.title}</span>
          <span className="live-dot">Live</span>
        </div>
      </nav>

      <div className="container--narrow" style={{ paddingTop: "48px", paddingBottom: "48px" }}>
        <div className="card card--elevated">
          <div className="flex justify-between items-center" style={{ marginBottom: "12px" }}>
            <span className={`slide-type-tag slide-type-tag--${slide.type}`}>{slide.type.replace("-", " ")}</span>
            <span className="text-muted" style={{ fontSize: "0.82rem" }}>
              {state.currentSlideIndex + 1} / {state.slides.length}
            </span>
          </div>

          <h2 style={{ fontSize: "1.6rem", marginBottom: "32px", lineHeight: 1.3 }}>{slide.question}</h2>

          {hasVoted ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>✅</div>
              <h3 style={{ color: "var(--color-success)", marginBottom: "8px" }}>Answer received!</h3>
              <p className="text-secondary">Waiting for the presenter to advance…</p>
            </div>
          ) : (
            <>
              {/* Multiple Choice */}
              {slide.type === "multiple-choice" && (
                <div className="flex-col gap-3">
                  {(slide.options || []).map((opt, i) => (
                    <button
                      key={i}
                      className="vote-option"
                      onClick={() => submitVote(slide.id, String(i))}
                    >
                      <span style={{ marginRight: "12px", color: "var(--color-primary)", fontWeight: 700 }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Rating */}
              {slide.type === "rating" && (
                <div style={{ textAlign: "center" }}>
                  <div className="star-rating" style={{ justifyContent: "center", marginBottom: "24px" }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className={`star ${star <= hoverStar ? "active" : ""}`}
                        onMouseEnter={() => setHoverStar(star)}
                        onMouseLeave={() => setHoverStar(0)}
                        onClick={() => submitVote(slide.id, String(star))}
                        style={{ background: "none", border: "none", padding: 0 }}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                  {hoverStar > 0 && (
                    <p className="text-secondary" style={{ marginBottom: "16px" }}>
                      {["", "Poor", "Fair", "Good", "Great", "Excellent"][hoverStar]}
                    </p>
                  )}
                </div>
              )}

              {/* Word Cloud */}
              {slide.type === "word-cloud" && (
                <div className="flex-col gap-3">
                  <input
                    className="input"
                    placeholder="Type one word or phrase…"
                    value={textInput}
                    maxLength={30}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && textInput.trim()) {
                        submitVote(slide.id, textInput.trim().toLowerCase());
                        setTextInput("");
                      }
                    }}
                  />
                  <button
                    className="btn btn--primary"
                    disabled={!textInput.trim()}
                    onClick={() => {
                      submitVote(slide.id, textInput.trim().toLowerCase());
                      setTextInput("");
                    }}
                  >
                    Submit →
                  </button>
                </div>
              )}

              {/* Open Text */}
              {slide.type === "open-text" && (
                <div className="flex-col gap-3">
                  <textarea
                    className="textarea"
                    placeholder="Share your thoughts…"
                    value={textInput}
                    rows={4}
                    maxLength={280}
                    onChange={(e) => setTextInput(e.target.value)}
                  />
                  <button
                    className="btn btn--primary"
                    disabled={!textInput.trim()}
                    onClick={() => {
                      submitVote(slide.id, textInput.trim());
                      setTextInput("");
                    }}
                  >
                    Submit →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
