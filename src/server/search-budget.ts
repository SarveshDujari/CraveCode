import { randomUUID } from "node:crypto";
import { getDatabase } from "./db.ts";

export const searchesPerBrowserSession = 5;
const serpApiCallsPerDay = 5;
const serpApiCallsPerMonth = 100;
const sessionLifetimeMs = 24 * 60 * 60_000;
const localSessions = new Map<string, { count: number; expiresAt: number }>();
const localCredits = new Map<string, number>();

export class SearchBudgetError extends Error {
  constructor(message: string) { super(message); this.name = "SearchBudgetError"; }
}

function validId(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(value));
}

export async function getDemoSession(cookieId: string | undefined): Promise<{ id: string; remaining: number; isNew: boolean }> {
  const now = Date.now();
  const db = getDatabase();
  if (db) {
    if (validId(cookieId)) {
      const current = await db.collection<{ _id: string; count: number; expiresAt: Date }>("demo_sessions")
        .findOne({ _id: cookieId, expiresAt: { $gt: new Date(now) } });
      if (current) return { id: cookieId, remaining: Math.max(0, searchesPerBrowserSession - current.count), isNew: false };
    }
    const id = randomUUID();
    await db.collection<{ _id: string; count: number; expiresAt: Date }>("demo_sessions")
      .insertOne({ _id: id, count: 0, expiresAt: new Date(now + sessionLifetimeMs) });
    return { id, remaining: searchesPerBrowserSession, isNew: true };
  }
  if (validId(cookieId)) {
    const current = localSessions.get(cookieId);
    if (current && current.expiresAt > now) return { id: cookieId, remaining: Math.max(0, searchesPerBrowserSession - current.count), isNew: false };
  }
  const id = randomUUID();
  localSessions.set(id, { count: 0, expiresAt: now + sessionLifetimeMs });
  for (const [key, value] of localSessions) if (value.expiresAt <= now) localSessions.delete(key);
  return { id, remaining: searchesPerBrowserSession, isNew: true };
}

export async function takeDemoSearch(id: string): Promise<number> {
  const db = getDatabase();
  if (db) {
    const updated = await db.collection<{ _id: string; count: number; expiresAt: Date }>("demo_sessions")
      .findOneAndUpdate({ _id: id, count: { $lt: searchesPerBrowserSession }, expiresAt: { $gt: new Date() } },
        { $inc: { count: 1 } }, { returnDocument: "after" });
    if (!updated) throw new SearchBudgetError("This browser session has used its five demo searches. Ask the project owner to reset the search budget.");
    return Math.max(0, searchesPerBrowserSession - updated.count);
  }
  const current = localSessions.get(id);
  if (!current || current.expiresAt <= Date.now() || current.count >= searchesPerBrowserSession) {
    throw new SearchBudgetError("This browser session has used its five demo searches. Ask the project owner to reset the search budget.");
  }
  current.count++;
  return searchesPerBrowserSession - current.count;
}

async function reserveCounter(key: string, limit: number, expiresAt: Date): Promise<void> {
  const db = getDatabase();
  if (db) {
    const collection = db.collection<{ _id: string; count: number; expiresAt: Date }>("serpapi_budgets");
    await collection.updateOne({ _id: key }, { $setOnInsert: { count: 0, expiresAt } }, { upsert: true });
    const updated = await collection.findOneAndUpdate({ _id: key, count: { $lt: limit } }, { $inc: { count: 1 } }, { returnDocument: "after" });
    if (!updated) throw new SearchBudgetError("The demo's SerpApi request budget is exhausted. Please try again after the budget resets.");
    return;
  }
  // A missing Atlas connection must never create an unbounded public key spend.
  if (process.env.RENDER === "true") throw new SearchBudgetError("Search is paused until its credit budget can be checked.");
  const count = localCredits.get(key) || 0;
  if (count >= limit) throw new SearchBudgetError("The demo's SerpApi request budget is exhausted. Please try again after the budget resets.");
  localCredits.set(key, count + 1);
}

export async function reserveSerpApiCall(): Promise<void> {
  const now = new Date();
  const scope = process.env.RENDER === "true" ? "render" : "local";
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  await reserveCounter(`${scope}:day:${day}`, serpApiCallsPerDay, new Date(now.getTime() + 3 * 24 * 60 * 60_000));
  await reserveCounter(`${scope}:month:${month}`, serpApiCallsPerMonth, new Date(now.getTime() + 40 * 24 * 60 * 60_000));
}
