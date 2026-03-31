"use client";

import { useState, useEffect, useRef } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import { QRCodeSVG } from "qrcode.react";
import type { SessionState, QuizSlideData, LeaderboardEntry } from "@/durableObjects/SessionDO";

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

function QuizHostView({ slide, quizData, audienceCount, setState }: {
  slide: SessionState["slides"][0];
  quizData: QuizSlideData | undefined;
  audienceCount: number;
  setState: (fn: (s: SessionState) => SessionState) => void;
}) {
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qd = quizData ?? { answers: {}, timerStartedAt: null, timerEnded: false, revealed: false };
  const answerCount = Object.keys(qd.answers).length;

  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!qd.timerStartedAt || qd.timerEnded) {
      setTimerRemaining(qd.timerStartedAt ? 0 : null);
      return;
    }
    const update = () => {
      const elapsed = (Date.now() - qd.timerStartedAt!) / 1000;
      const remaining = Math.max(0, (slide.timerSeconds ?? 20) - elapsed);
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        // Host ends the timer
        setState((s: SessionState) => ({
          ...s,
          quizData: {
            ...s.quizData,
            [slide.id]: { ...s.quizData[slide.id], timerEnded: true },
          },
        }));
      }
    };
    update();
    timerRef.current = setInterval(update, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [qd.timerStartedAt, qd.timerEnded, slide.id]);

  function startTimer() {
    setState((s: SessionState) => ({
      ...s,
      quizData: {
        ...s.quizData,
        [slide.id]: {
          ...(s.quizData[slide.id] ?? { answers: {}, timerEnded: false, revealed: false }),
          timerStartedAt: Date.now(),
        },
      },
    }));
  }

  function revealAnswer() {
    setState((s: SessionState) => ({
      ...s,
      quizData: {
        ...s.quizData,
        [slide.id]: { ...s.quizData[slide.id], revealed: true },
      },
    }));
  }

  return (
    <div>
      {/* Timer bar */}
      {qd.timerStartedAt && !qd.timerEnded && timerRemaining !== null && (
        <div className="timer-container" style={{ marginBottom: "24px" }}>
          <div className="timer-bar">
            <div
              className={`timer-bar-fill ${timerRemaining < 5 ? "timer-bar-fill--urgent" : ""}`}
              style={{ width: `${(timerRemaining / (slide.timerSeconds ?? 20)) * 100}%` }}
            />
          </div>
          <div className="timer-display">{Math.ceil(timerRemaining)}s</div>
        </div>
      )}

      {/* Before timer starts */}
      {!qd.timerStartedAt && (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <p className="text-secondary" style={{ marginBottom: "16px" }}>
            {slide.timerSeconds ?? 20}s timer · {(slide.options || []).length} options
          </p>
          <button className="btn btn--primary btn--lg" onClick={startTimer}>
            Start Timer
          </button>
        </div>
      )}

      {/* During / after timer: show answer distribution */}
      {qd.timerStartedAt && (
        <>
          <div className="bar-chart" style={{ marginBottom: "16px" }}>
            {(slide.options || []).map((label, i) => {
              const count = Object.values(qd.answers).filter((a) => a.optionIndex === i).length;
              const maxCount = Math.max(1, answerCount);
              const pct = Math.round((count / maxCount) * 100);
              const isCorrect = i === slide.correctAnswer;
              const barColor = qd.revealed
                ? (isCorrect ? "linear-gradient(90deg, #00d4aa, #00b894)" : "linear-gradient(90deg, #636e72, #2d3436)")
                : `linear-gradient(90deg, ${VOTE_COLORS[i % VOTE_COLORS.length]}, ${VOTE_COLORS[(i + 1) % VOTE_COLORS.length]})`;
              return (
                <div key={i} className="bar-row">
                  <span className="bar-label" style={qd.revealed && isCorrect ? { color: "var(--color-success)", fontWeight: 700 } : {}}>
                    {qd.revealed && isCorrect && "✓ "}{label || `Option ${i + 1}`}
                  </span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: barColor }}>
                      {pct > 15 ? `${pct}%` : ""}
                    </div>
                  </div>
                  <span className="bar-count">{count}</span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center" style={{ marginTop: "16px" }}>
            <span className="text-secondary" style={{ fontSize: "0.85rem" }}>
              {answerCount} / {audienceCount} answered
            </span>
            {qd.timerEnded && !qd.revealed && (
              <button className="btn btn--primary" onClick={revealAnswer}>
                Reveal Answer
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LeaderboardDisplay({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  const top = leaderboard.slice(0, 8);
  if (top.length === 0) return null;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="card" style={{ marginTop: "16px" }}>
      <h4 style={{ marginBottom: "12px" }}>Leaderboard</h4>
      <div className="leaderboard">
        {top.map((entry, i) => (
          <div key={entry.participantId} className={`leaderboard-entry ${i < 3 ? "leaderboard-entry--top3" : ""}`}>
            <span className="leaderboard-rank">{medals[i] ?? `#${i + 1}`}</span>
            <span className="leaderboard-name">{entry.nickname}</span>
            <span className="leaderboard-stats">
              {entry.totalPoints} pts · {entry.correctCount} correct
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QAHostView({ slide, qaData, setState }: {
  slide: SessionState["slides"][0];
  qaData: SessionState["qaData"][string] | undefined;
  setState: (fn: (s: SessionState) => SessionState) => void;
}) {
  const [tab, setTab] = useState<"active" | "answered">("active");
  const questions = qaData?.questions ?? [];
  const activeQuestions = questions.filter((q) => q.status === "active").sort((a, b) => b.upvotes - a.upvotes);
  const answeredQuestions = questions.filter((q) => q.status === "answered").sort((a, b) => b.upvotes - a.upvotes);

  function setQuestionStatus(questionId: string, status: "answered" | "dismissed") {
    setState((s: SessionState) => {
      const currentQa = s.qaData?.[slide.id] ?? { questions: [] };
      return {
        ...s,
        qaData: {
          ...s.qaData,
          [slide.id]: {
            questions: currentQa.questions.map((q) =>
              q.id === questionId ? { ...q, status } : q
            ),
          },
        },
      };
    });
  }

  const displayQuestions = tab === "active" ? activeQuestions : answeredQuestions;

  return (
    <div>
      <div className="flex gap-2" style={{ marginBottom: "16px" }}>
        <button
          className={`btn btn--sm ${tab === "active" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setTab("active")}
        >
          Active ({activeQuestions.length})
        </button>
        <button
          className={`btn btn--sm ${tab === "answered" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setTab("answered")}
        >
          Answered ({answeredQuestions.length})
        </button>
      </div>

      {displayQuestions.length === 0 ? (
        <p className="text-muted" style={{ textAlign: "center", padding: "24px" }}>
          {tab === "active" ? "No questions yet. Waiting for audience…" : "No answered questions yet."}
        </p>
      ) : (
        <div className="flex-col gap-3 qa-questions-list">
          {displayQuestions.map((q) => (
            <div key={q.id} className="qa-question-card">
              <div className="flex gap-3 items-start">
                <div className="qa-upvote-btn qa-upvote-btn--voted" style={{ cursor: "default" }}>
                  <span className="qa-upvote-arrow">▲</span>
                  <span>{q.upvotes}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ marginBottom: "4px" }}>{q.text}</p>
                  <span className="text-muted" style={{ fontSize: "0.75rem" }}>{q.authorNickname}</span>
                </div>
                {tab === "active" && (
                  <div className="flex gap-2">
                    <button className="btn btn--ghost btn--sm" onClick={() => setQuestionStatus(q.id, "answered")} title="Mark as answered">
                      ✓
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setQuestionStatus(q.id, "dismissed")} title="Dismiss" style={{ color: "var(--color-danger)" }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
    participants: {},
    quizData: {},
    qaData: {},
    leaderboard: [],
  };

  const [state, setState] = useSyncedState<SessionState>(initialState, "sessionState", sessionId);
  const [shortCode, setShortCode] = useState<string>("");
  const [audienceCount] = useSyncedState<number>(0, "audienceCount", sessionId);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const slide = state.slides[state.currentSlideIndex];
  const votes = slide ? state.votes[slide.id] : undefined;
  const isFirst = state.currentSlideIndex === 0;
  const isLast = state.currentSlideIndex >= state.slides.length - 1;

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.json())
      .then((meta: any) => {
        setShortCode(meta.shortCode ?? sessionId.slice(0, 6).toUpperCase());
        setState((current: SessionState) => {
          if (current.slides.length > 0) return current;
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
            participants: {},
            quizData: Object.fromEntries(
              meta.slides
                .filter((s: any) => s.type === "quiz")
                .map((s: any) => [s.id, { answers: {}, timerStartedAt: null, timerEnded: false, revealed: false }])
            ),
            qaData: Object.fromEntries(
              meta.slides
                .filter((s: any) => s.type === "qa")
                .map((s: any) => [s.id, { questions: [] }])
            ),
            leaderboard: [],
          };
        });
      })
      .catch(() => {});
  }, [sessionId]);

  // Reset leaderboard toggle when changing slides
  useEffect(() => { setShowLeaderboard(false); }, [state.currentSlideIndex]);

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

  const hasQuizSlides = state.slides.some((s) => s.type === "quiz");
  const quizRevealed = slide?.type === "quiz" && state.quizData?.[slide.id]?.revealed;

  return (
    <div className="page">
      <nav className="navbar">
        <div className="flex items-center gap-3">
          <a href="/" className="navbar-brand">⚡ LiveSpark</a>
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
                {slide.type === "quiz" && (
                  <QuizHostView
                    slide={slide}
                    quizData={state.quizData?.[slide.id]}
                    audienceCount={audienceCount}
                    setState={setState}
                  />
                )}
                {slide.type === "qa" && (
                  <QAHostView
                    slide={slide}
                    qaData={state.qaData?.[slide.id]}
                    setState={setState}
                  />
                )}

                {slide.type !== "quiz" && slide.type !== "qa" && (
                  <>
                    <div className="divider" />
                    <p className="text-secondary" style={{ fontSize: "0.85rem", textAlign: "right" }}>
                      {votes?.total ?? 0} response{votes?.total !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: "64px" }}>
                <div className="spinner" style={{ margin: "0 auto" }} />
                <p style={{ marginTop: "16px" }}>Loading session…</p>
              </div>
            )}

            {/* Leaderboard toggle for quiz slides */}
            {quizRevealed && (
              <button
                className="btn btn--ghost"
                style={{ marginTop: "8px", width: "100%" }}
                onClick={() => setShowLeaderboard(!showLeaderboard)}
              >
                {showLeaderboard ? "Hide Leaderboard" : "Show Leaderboard"}
              </button>
            )}
            {showLeaderboard && hasQuizSlides && (
              <LeaderboardDisplay leaderboard={state.leaderboard} />
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
              <div className="qr-wrapper" style={{ marginTop: "16px" }}>
                {joinUrl && (
                  <QRCodeSVG
                    value={joinUrl}
                    size={160}
                    bgColor="#ffffff"
                    fgColor="#1a1a2e"
                    level="M"
                  />
                )}
              </div>
              <p className="text-muted" style={{ marginTop: "8px", fontSize: "0.78rem" }}>Scan to join</p>
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
                      {s.type === "quiz"
                        ? Object.keys(state.quizData?.[s.id]?.answers ?? {}).length
                        : s.type === "qa"
                          ? (state.qaData?.[s.id]?.questions?.length ?? 0)
                          : (state.votes[s.id]?.total ?? 0)}
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
