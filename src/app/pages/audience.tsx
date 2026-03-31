"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { SessionState, QuizSlideData, QASlideData, QAQuestion, LeaderboardEntry } from "@/durableObjects/SessionDO";

const MAX_POINTS = 1000;

let idCounter = 0;
const uid = () => `q-${Date.now()}-${idCounter++}`;

function getParticipant(sessionId: string) {
  try {
    const stored = localStorage.getItem(`participant:${sessionId}`);
    if (stored) return JSON.parse(stored) as { id: string; nickname: string };
  } catch {}
  return null;
}

function saveParticipant(sessionId: string, p: { id: string; nickname: string }) {
  try { localStorage.setItem(`participant:${sessionId}`, JSON.stringify(p)); } catch {}
}

function computePoints(timerStartedAt: number, timerSeconds: number, answeredAt: number): number {
  const elapsed = (answeredAt - timerStartedAt) / 1000;
  const speedFraction = Math.max(0, 1 - elapsed / timerSeconds);
  return Math.round(MAX_POINTS * (0.5 + 0.5 * speedFraction));
}

function computeLeaderboard(state: SessionState): LeaderboardEntry[] {
  const scores: Record<string, { nickname: string; totalPoints: number; correctCount: number }> = {};
  for (const qd of Object.values(state.quizData ?? {})) {
    for (const [pid, answer] of Object.entries(qd.answers ?? {})) {
      if (!scores[pid]) {
        const p = state.participants?.[pid];
        scores[pid] = { nickname: p?.nickname ?? "???", totalPoints: 0, correctCount: 0 };
      }
      scores[pid].totalPoints += answer.points;
      if (answer.isCorrect) scores[pid].correctCount += 1;
    }
  }
  return Object.entries(scores)
    .map(([pid, s]) => ({ participantId: pid, ...s }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

export function AudiencePage({ params }: any) {
  const sessionId: string = params?.sessionId ?? "";

  const [state, setState] = useSyncedState<SessionState>(
    {
      sessionId,
      title: "Loading\u2026",
      slides: [],
      currentSlideIndex: 0,
      votes: {},
      audienceCount: 0,
      isActive: true,
      participants: {},
      quizData: {},
      qaData: {},
      leaderboard: [],
    },
    "sessionState",
    sessionId
  );

  const [, setAudienceCount] = useSyncedState<number>(0, "audienceCount", sessionId);
  useEffect(() => {
    setAudienceCount((n: number) => n + 1);
    return () => { setAudienceCount((n: number) => Math.max(0, n - 1)); };
  }, [sessionId]);

  const [voted, setVoted] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`voted:${sessionId}`);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [hoverStar, setHoverStar] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [participant, setParticipant] = useState<{ id: string; nickname: string } | null>(() => getParticipant(sessionId));
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [qaInput, setQaInput] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slide = state.slides[state.currentSlideIndex];
  const needsNickname = state.slides.some((s) => s.type === "quiz" || s.type === "qa");

  // Register participant in synced state once we have one
  useEffect(() => {
    if (participant && !state.participants?.[participant.id]) {
      setState((s: SessionState) => ({
        ...s,
        participants: { ...s.participants, [participant.id]: participant },
      }));
    }
  }, [participant, state.participants]);

  // Quiz timer effect
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!slide || slide.type !== "quiz") { setTimerRemaining(null); return; }
    const qd = state.quizData?.[slide.id];
    if (!qd?.timerStartedAt || qd.timerEnded) {
      setTimerRemaining(qd?.timerStartedAt ? 0 : null);
      return;
    }
    const update = () => {
      const elapsed = (Date.now() - qd.timerStartedAt!) / 1000;
      const remaining = Math.max(0, (slide.timerSeconds ?? 20) - elapsed);
      setTimerRemaining(remaining);
    };
    update();
    timerRef.current = setInterval(update, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slide?.id, state.quizData?.[slide?.id ?? ""]?.timerStartedAt, state.quizData?.[slide?.id ?? ""]?.timerEnded]);

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
    setVoted((v) => {
      const updated = { ...v, [slideId]: true };
      try { localStorage.setItem(`voted:${sessionId}`, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function submitQuizAnswer(slideId: string, optionIndex: number) {
    if (!participant || voted[slideId]) return;
    const qd = state.quizData?.[slideId];
    if (!qd?.timerStartedAt || qd.timerEnded) return;
    if (qd.answers?.[participant.id]) return;

    const answeredAt = Date.now();
    const isCorrect = optionIndex === slide.correctAnswer;
    const points = isCorrect ? computePoints(qd.timerStartedAt, slide.timerSeconds ?? 20, answeredAt) : 0;

    setState((s: SessionState) => {
      const currentQd = s.quizData?.[slideId] ?? { answers: {}, timerStartedAt: null, timerEnded: false, revealed: false };
      const newState = {
        ...s,
        quizData: {
          ...s.quizData,
          [slideId]: {
            ...currentQd,
            answers: {
              ...currentQd.answers,
              [participant.id]: { participantId: participant.id, optionIndex, answeredAt, isCorrect, points },
            },
          },
        },
      };
      newState.leaderboard = computeLeaderboard(newState);
      return newState;
    });

    setVoted((v) => {
      const updated = { ...v, [slideId]: true };
      try { localStorage.setItem(`voted:${sessionId}`, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function submitQuestion() {
    if (!participant || !qaInput.trim() || !slide) return;
    const questionId = uid();
    setState((s: SessionState) => {
      const currentQa = s.qaData?.[slide.id] ?? { questions: [] };
      const newQ: QAQuestion = {
        id: questionId,
        text: qaInput.trim(),
        authorId: participant.id,
        authorNickname: participant.nickname,
        upvotes: 0,
        upvoterIds: [],
        status: "active",
        submittedAt: Date.now(),
      };
      return {
        ...s,
        qaData: {
          ...s.qaData,
          [slide.id]: { questions: [...currentQa.questions, newQ] },
        },
      };
    });
    setQaInput("");
  }

  function upvoteQuestion(questionId: string) {
    if (!participant || !slide) return;
    setState((s: SessionState) => {
      const currentQa = s.qaData?.[slide.id] ?? { questions: [] };
      return {
        ...s,
        qaData: {
          ...s.qaData,
          [slide.id]: {
            questions: currentQa.questions.map((q) =>
              q.id === questionId && !q.upvoterIds.includes(participant.id)
                ? { ...q, upvotes: q.upvotes + 1, upvoterIds: [...q.upvoterIds, participant.id] }
                : q
            ),
          },
        },
      };
    });
  }

  function handleJoinWithNickname() {
    if (!nickname.trim()) return;
    const p = { id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nickname: nickname.trim() };
    saveParticipant(sessionId, p);
    setParticipant(p);
  }

  // --- Screens ---

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

  // Nickname gate for quiz/Q&A sessions
  if (needsNickname && !participant) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="card" style={{ textAlign: "center", maxWidth: "400px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "16px" }}>👋</div>
          <h2 style={{ marginBottom: "8px" }}>Welcome!</h2>
          <p className="text-secondary" style={{ marginBottom: "24px" }}>Enter a nickname to join</p>
          <div className="flex-col gap-3" style={{ maxWidth: "280px", margin: "0 auto" }}>
            <input
              className="input"
              placeholder="Your nickname"
              value={nickname}
              maxLength={20}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinWithNickname()}
              style={{ textAlign: "center", fontSize: "1.2rem", fontWeight: 600 }}
              autoFocus
            />
            <button className="btn btn--primary" onClick={handleJoinWithNickname} disabled={!nickname.trim()}>
              Join Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasVoted = voted[slide.id];
  const quizData = state.quizData?.[slide.id];
  const qaData = state.qaData?.[slide.id];
  const myQuizAnswer = participant && quizData?.answers?.[participant.id];

  return (
    <div className="page">
      <nav className="navbar">
        <a href="/" className="navbar-brand">⚡ LiveSpark</a>
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

          {/* ===================== QUIZ ===================== */}
          {slide.type === "quiz" && (
            <>
              {/* Timer bar */}
              {quizData?.timerStartedAt && !quizData.timerEnded && timerRemaining !== null && (
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
              {!quizData?.timerStartedAt && !myQuizAnswer && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🧠</div>
                  <h3 style={{ marginBottom: "8px" }}>Get ready!</h3>
                  <p className="text-secondary">The host will start the timer soon…</p>
                </div>
              )}

              {/* Show options during timer (if not answered yet) */}
              {quizData?.timerStartedAt && !quizData.timerEnded && !myQuizAnswer && (
                <div className="flex-col gap-3">
                  {(slide.options || []).map((opt, i) => (
                    <button
                      key={i}
                      className="vote-option quiz-option"
                      onClick={() => submitQuizAnswer(slide.id, i)}
                    >
                      <span style={{ marginRight: "12px", color: "var(--color-primary)", fontWeight: 700 }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Timer expired, didn't answer */}
              {quizData?.timerEnded && !myQuizAnswer && !quizData.revealed && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "12px" }}>⏰</div>
                  <h3 style={{ color: "var(--color-danger)", marginBottom: "8px" }}>Time's up!</h3>
                  <p className="text-secondary">You didn't answer in time.</p>
                </div>
              )}

              {/* Answered, waiting for reveal */}
              {myQuizAnswer && !quizData?.revealed && (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🔒</div>
                  <h3 style={{ color: "var(--color-primary)", marginBottom: "8px" }}>Answer locked in!</h3>
                  <p className="text-secondary">
                    You picked: <strong>{String.fromCharCode(65 + myQuizAnswer.optionIndex)}</strong> — {slide.options?.[myQuizAnswer.optionIndex]}
                  </p>
                </div>
              )}

              {/* Revealed — show correct/wrong */}
              {quizData?.revealed && (
                <div>
                  <div className="flex-col gap-3" style={{ marginBottom: "24px" }}>
                    {(slide.options || []).map((opt, i) => {
                      const isCorrect = i === slide.correctAnswer;
                      const isMyPick = myQuizAnswer?.optionIndex === i;
                      let className = "vote-option quiz-option-result";
                      if (isCorrect) className += " quiz-option--correct";
                      else if (isMyPick) className += " quiz-option--wrong";
                      return (
                        <div key={i} className={className}>
                          <span style={{ marginRight: "12px", fontWeight: 700 }}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          {opt}
                          {isCorrect && <span style={{ marginLeft: "auto" }}>✓</span>}
                          {isMyPick && !isCorrect && <span style={{ marginLeft: "auto" }}>✗</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ textAlign: "center", padding: "16px 0" }}>
                    {myQuizAnswer ? (
                      myQuizAnswer.isCorrect ? (
                        <>
                          <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🎉</div>
                          <h3 style={{ color: "var(--color-success)" }}>Correct!</h3>
                          <p className="points-display">+{myQuizAnswer.points} pts</p>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>😔</div>
                          <h3 style={{ color: "var(--color-danger)" }}>Wrong answer</h3>
                          <p className="text-secondary">+0 pts</p>
                        </>
                      )
                    ) : (
                      <>
                        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>⏰</div>
                        <h3 className="text-secondary">No answer submitted</h3>
                        <p className="text-secondary">+0 pts</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===================== Q&A ===================== */}
          {slide.type === "qa" && participant && (
            <div>
              {/* Submit question */}
              <div className="flex gap-2" style={{ marginBottom: "24px" }}>
                <input
                  className="input"
                  placeholder="Ask a question…"
                  value={qaInput}
                  maxLength={200}
                  onChange={(e) => setQaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitQuestion()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn--primary" onClick={submitQuestion} disabled={!qaInput.trim()}>
                  Ask
                </button>
              </div>

              {/* Questions list */}
              {(() => {
                const questions = (qaData?.questions ?? [])
                  .filter((q) => q.status !== "dismissed")
                  .sort((a, b) => b.upvotes - a.upvotes);
                if (questions.length === 0) {
                  return <p className="text-muted" style={{ textAlign: "center", padding: "24px" }}>No questions yet. Be the first to ask!</p>;
                }
                return (
                  <div className="flex-col gap-3 qa-questions-list">
                    {questions.map((q) => {
                      const hasUpvoted = q.upvoterIds.includes(participant.id);
                      return (
                        <div key={q.id} className={`qa-question-card ${q.status === "answered" ? "qa-question-card--answered" : ""}`}>
                          <div className="flex gap-3 items-start">
                            <button
                              className={`qa-upvote-btn ${hasUpvoted ? "qa-upvote-btn--voted" : ""}`}
                              onClick={() => !hasUpvoted && upvoteQuestion(q.id)}
                              disabled={hasUpvoted}
                            >
                              <span className="qa-upvote-arrow">▲</span>
                              <span>{q.upvotes}</span>
                            </button>
                            <div style={{ flex: 1 }}>
                              <p style={{ marginBottom: "4px" }}>{q.text}</p>
                              <div className="flex gap-2 items-center">
                                <span className="text-muted" style={{ fontSize: "0.75rem" }}>{q.authorNickname}</span>
                                {q.status === "answered" && (
                                  <span className="qa-status-badge qa-status-badge--answered">Answered</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===================== EXISTING TYPES ===================== */}

          {slide.type !== "quiz" && slide.type !== "qa" && hasVoted ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>✅</div>
              <h3 style={{ color: "var(--color-success)", marginBottom: "8px" }}>Answer received!</h3>
              <p className="text-secondary">Waiting for the presenter to advance…</p>
            </div>
          ) : slide.type !== "quiz" && slide.type !== "qa" && (
            <>
              {/* Multiple Choice */}
              {slide.type === "multiple-choice" && (
                <div className="flex-col gap-3">
                  {(slide.options || []).map((opt, i) => (
                    <button key={i} className="vote-option" onClick={() => submitVote(slide.id, String(i))}>
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
