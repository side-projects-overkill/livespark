"use client";

import { useState } from "react";
import type { SlideDefinition } from "@/durableObjects/SessionDO";

let idCounter = 0;
const uid = () => `slide-${Date.now()}-${idCounter++}`;

const SLIDE_TYPES: { type: SlideDefinition["type"]; label: string; emoji: string; desc: string }[] = [
  { type: "multiple-choice", label: "Multiple Choice", emoji: "📊", desc: "Vote for one option" },
  { type: "word-cloud", label: "Word Cloud", emoji: "☁️", desc: "One-word responses" },
  { type: "rating", label: "Rating", emoji: "⭐", desc: "Rate 1 to 5 stars" },
  { type: "open-text", label: "Open Text", emoji: "💬", desc: "Free-form answers" },
  { type: "quiz", label: "Quiz", emoji: "🧠", desc: "Timed quiz with scoring" },
  { type: "qa", label: "Q&A", emoji: "🙋", desc: "Live audience questions" },
];

function defaultSlide(): SlideDefinition {
  return {
    id: uid(),
    type: "multiple-choice",
    question: "",
    options: ["", ""],
  };
}

export function HomePage() {
  const [mode, setMode] = useState<"landing" | "create" | "join">("landing");
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<SlideDefinition[]>([defaultSlide()]);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setError("");
    if (!title.trim()) { setError("Please enter a presentation title."); return; }
    if (slides.some((s) => !s.question.trim())) { setError("All slides need a question."); return; }
    if (slides.some((s) => s.type === "multiple-choice" && (!s.options || s.options.filter(Boolean).length < 2))) {
      setError("Multiple choice slides need at least 2 options."); return;
    }
    if (slides.some((s) => s.type === "quiz" && (!s.options || s.options.filter(Boolean).length < 2))) {
      setError("Quiz slides need at least 2 options."); return;
    }
    if (slides.some((s) => s.type === "quiz" && (s.correctAnswer == null || !s.timerSeconds))) {
      setError("Quiz slides need a correct answer and timer duration."); return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slides }),
      });
      const data = await res.json() as { sessionId: string; hostSecret: string };
      window.location.href = `/host/${data.sessionId}?secret=${data.hostSecret}`;
    } catch {
      setError("Failed to create session. Please try again.");
      setLoading(false);
    }
  }

  async function handleJoin() {
    setError("");
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError("Enter your 6-character join code."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/join/${code}`);
      if (!res.ok) { setError("Code not found. Check and try again."); setLoading(false); return; }
      const { sessionId } = await res.json() as { sessionId: string };
      window.location.href = `/join/${sessionId}`;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function addSlide() {
    setSlides((prev) => [...prev, defaultSlide()]);
  }

  function removeSlide(idx: number) {
    setSlides((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateSlide(idx: number, patch: Partial<SlideDefinition>) {
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const typeChanged = patch.type && patch.type !== s.type;
        const newType = patch.type ?? s.type;
        const needsOptions = newType === "multiple-choice" || newType === "quiz";
        return {
          ...s,
          ...patch,
          options: typeChanged
            ? (needsOptions ? ["", ""] : undefined)
            : (patch.options ?? s.options),
          correctAnswer: typeChanged
            ? (newType === "quiz" ? 0 : undefined)
            : (patch.correctAnswer ?? s.correctAnswer),
          timerSeconds: typeChanged
            ? (newType === "quiz" ? 20 : undefined)
            : (patch.timerSeconds ?? s.timerSeconds),
        };
      })
    );
  }

  function updateOption(slideIdx: number, optIdx: number, val: string) {
    setSlides((prev) =>
      prev.map((s, i) =>
        i === slideIdx ? { ...s, options: s.options!.map((o, j) => (j === optIdx ? val : o)) } : s
      )
    );
  }

  function addOption(slideIdx: number) {
    setSlides((prev) =>
      prev.map((s, i) => (i === slideIdx ? { ...s, options: [...(s.options || []), ""] } : s))
    );
  }

  function removeOption(slideIdx: number, optIdx: number) {
    setSlides((prev) =>
      prev.map((s, i) =>
        i === slideIdx ? { ...s, options: s.options!.filter((_, j) => j !== optIdx) } : s
      )
    );
  }

  if (mode === "join") {
    return (
      <div className="page">
        <nav className="navbar">
          <a href="/" className="navbar-brand" onClick={(e) => { e.preventDefault(); setMode("landing"); }}>⚡ LiveSpark</a>
          <button className="btn btn--ghost btn--sm" onClick={() => setMode("landing")}>← Back</button>
        </nav>
        <div className="container--narrow" style={{ paddingTop: "80px" }}>
          <div className="card" style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "2rem", marginBottom: "8px" }}>Join a Session</h1>
            <p style={{ marginBottom: "32px" }}>Enter the 6-character code shown on the presenter's screen</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "320px", margin: "0 auto" }}>
              <input
                className="input"
                placeholder="ABC123"
                value={joinCode}
                maxLength={6}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                style={{ textAlign: "center", fontSize: "2rem", letterSpacing: "0.3em", fontWeight: 700 }}
              />
              {error && <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>}
              <button className="btn btn--primary btn--lg" onClick={handleJoin} disabled={loading}>
                {loading ? "Joining…" : "Join →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="page">
        <nav className="navbar">
          <a href="/" className="navbar-brand" onClick={(e) => { e.preventDefault(); setMode("landing"); }}>⚡ LiveSpark</a>
          <div className="flex gap-3 items-center">
            <button className="btn btn--ghost btn--sm" onClick={() => setMode("landing")}>← Back</button>
            <button className="btn btn--primary" onClick={handleCreate} disabled={loading}>
              {loading ? "Creating…" : "🚀 Start Session"}
            </button>
          </div>
        </nav>
        <div className="container--narrow" style={{ padding: "24px var(--space-6)" }}>
          <h2 style={{ marginBottom: "24px" }}>Create Presentation</h2>

          <div className="form-group" style={{ marginBottom: "32px" }}>
            <label className="form-label">Presentation Title</label>
            <input
              className="input"
              placeholder="My awesome presentation"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <h3 style={{ marginBottom: "16px", fontSize: "1rem" }}>Slides ({slides.length})</h3>
          <div className="flex-col gap-4">
            {slides.map((slide, idx) => (
              <div key={slide.id} className="slide-item">
                <div className="flex justify-between items-center" style={{ marginBottom: "12px" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    Slide {idx + 1}
                  </span>
                  <div className="flex gap-2 items-center">
                    <select
                      className="select"
                      style={{ width: "auto", padding: "4px 8px", fontSize: "0.82rem" }}
                      value={slide.type}
                      onChange={(e) => updateSlide(idx, { type: e.target.value as SlideDefinition["type"] })}
                    >
                      {SLIDE_TYPES.map((t) => (
                        <option key={t.type} value={t.type}>{t.emoji} {t.label}</option>
                      ))}
                    </select>
                    {slides.length > 1 && (
                      <button className="btn btn--ghost btn--sm" onClick={() => removeSlide(idx)}>✕</button>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: "12px" }}>
                  <input
                    className="input"
                    placeholder="Enter your question…"
                    value={slide.question}
                    onChange={(e) => updateSlide(idx, { question: e.target.value })}
                  />
                </div>

                {(slide.type === "multiple-choice" || slide.type === "quiz") && (
                  <div className="flex-col gap-2">
                    {(slide.options || []).map((opt, optIdx) => (
                      <div key={optIdx} className="flex gap-2 items-center">
                        {slide.type === "quiz" && (
                          <input
                            type="radio"
                            name={`correct-${slide.id}`}
                            checked={slide.correctAnswer === optIdx}
                            onChange={() => updateSlide(idx, { correctAnswer: optIdx })}
                            title="Mark as correct answer"
                            style={{ accentColor: "var(--color-success)" }}
                          />
                        )}
                        <input
                          className="input"
                          placeholder={`Option ${optIdx + 1}`}
                          value={opt}
                          onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                          style={slide.type === "quiz" && slide.correctAnswer === optIdx ? { borderColor: "var(--color-success)" } : {}}
                        />
                        {(slide.options || []).length > 2 && (
                          <button className="btn btn--ghost btn--sm" onClick={() => removeOption(idx, optIdx)}>✕</button>
                        )}
                      </div>
                    ))}
                    <button className="btn btn--ghost btn--sm" style={{ width: "max-content" }} onClick={() => addOption(idx)}>
                      + Add Option
                    </button>
                    {slide.type === "quiz" && (
                      <div className="flex gap-3 items-center" style={{ marginTop: "8px" }}>
                        <label className="text-secondary" style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}>Timer:</label>
                        <select
                          className="select"
                          style={{ width: "auto", padding: "4px 8px", fontSize: "0.82rem" }}
                          value={slide.timerSeconds ?? 20}
                          onChange={(e) => updateSlide(idx, { timerSeconds: Number(e.target.value) })}
                        >
                          <option value={10}>10 seconds</option>
                          <option value={20}>20 seconds</option>
                          <option value={30}>30 seconds</option>
                          <option value={45}>45 seconds</option>
                          <option value={60}>60 seconds</option>
                        </select>
                        <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                          Correct: Option {String.fromCharCode(65 + (slide.correctAnswer ?? 0))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            className="btn btn--ghost"
            style={{ marginTop: "16px", width: "100%" }}
            onClick={addSlide}
          >
            + Add Slide
          </button>

          {error && <p style={{ marginTop: "16px", color: "var(--color-danger)" }}>{error}</p>}
        </div>
      </div>
    );
  }

  // Landing
  return (
    <div className="page">
      <nav className="navbar">
        <a href="/" className="navbar-brand">⚡ LiveSpark</a>
        <span className="badge badge--primary">Beta</span>
      </nav>
      <div className="container hero">
        <h1 className="hero-title">Real-time polls &amp;<br />interactive presentations</h1>
        <p className="hero-subtitle">
          Engage your audience live — create polls, word clouds, and ratings that update instantly on every screen.
        </p>
        <div className="flex gap-4 justify-center" style={{ flexWrap: "wrap" }}>
          <button className="btn btn--primary btn--lg" onClick={() => setMode("create")}>
            🚀 Create Presentation
          </button>
          <button className="btn btn--ghost btn--lg" onClick={() => setMode("join")}>
            🎯 Join a Session
          </button>
        </div>

        <div className="grid-3" style={{ marginTop: "80px" }}>
          {SLIDE_TYPES.map((t) => (
            <div key={t.type} className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>{t.emoji}</div>
              <h4 style={{ marginBottom: "6px" }}>{t.label}</h4>
              <p style={{ fontSize: "0.85rem" }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
      <footer className="footer">
        <p>
          Made with{" "}
          <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">Claude Code</a>
          {" "}by Yash Oswal
        </p>
        <a href="https://github.com/side-projects-overkill/livespark" target="_blank" rel="noopener noreferrer" className="footer-github">
          GitHub
        </a>
      </footer>
    </div>
  );
}
