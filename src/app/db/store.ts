/**
 * In-memory store for session metadata (slide definitions, host secret).
 * Lives in the Worker's global scope. For production, replace with D1 or KV.
 */

import type { SlideDefinition } from "@/durableObjects/SessionDO";

export interface SessionMeta {
  sessionId: string;
  hostSecret: string;
  title: string;
  slides: SlideDefinition[];
  createdAt: number;
  shortCode: string; // 6-char uppercase code for audience join
}

// Worker-global store — persists across requests on the same isolate
const sessions = new Map<string, SessionMeta>();
const codeIndex = new Map<string, string>(); // shortCode → sessionId

function generateId(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createSession(title: string, slides: SlideDefinition[]): SessionMeta {
  const sessionId = generateId(16);
  const hostSecret = generateId(32);
  let shortCode = generateCode();
  // Ensure uniqueness
  while (codeIndex.has(shortCode)) {
    shortCode = generateCode();
  }

  const meta: SessionMeta = {
    sessionId,
    hostSecret,
    title,
    slides,
    createdAt: Date.now(),
    shortCode,
  };

  sessions.set(sessionId, meta);
  codeIndex.set(shortCode, sessionId);
  return meta;
}

export function getSession(sessionId: string): SessionMeta | undefined {
  return sessions.get(sessionId);
}

export function getSessionByCode(code: string): SessionMeta | undefined {
  const sessionId = codeIndex.get(code.toUpperCase());
  return sessionId ? sessions.get(sessionId) : undefined;
}

export function listSessions(): SessionMeta[] {
  return Array.from(sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
}
