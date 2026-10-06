import { randomUUID } from 'node:crypto';
import { objectRecord } from '../apiGuard';
import { AiBudgetError, reserveAiBudget, settleAiBudget } from '../aiBudget';
// Minimal client for the Jev decision model via OpenRouter. Jev answers typed
// questions about a state with calibrated probabilities and never writes text.

const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const MODEL = 'typesafe/jev-1.13';

export type NoulQuestion = { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQuestion<K extends string = string> = { type: 'choice'; instructions: string; criteria: Record<K, string> };
export type Question = NoulQuestion | ChoiceQuestion;

export type NoulAnswer = { type: 'noul'; noul: number };
export type ChoiceAnswer = { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> };
export type Answer = NoulAnswer | ChoiceAnswer;

export type DecisionResult = { answers: Record<string, Answer>; cost: number; ms: number };

export function validateAnswers(value: unknown, questions: Record<string, Question>): Record<string, Answer> {
  if (!objectRecord(value)) throw new Error('Invalid decisions');
  const probability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  const out: Record<string, Answer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const a = value[key];
    if (!objectRecord(a) || a.type !== question.type) throw new Error('Invalid decision type');
    if (question.type === 'noul') {
      if (!probability(a.noul)) throw new Error('Invalid probability');
      out[key] = { type: 'noul', noul: a.noul };
    } else {
      if (typeof a.choice !== 'string' || !Object.prototype.hasOwnProperty.call(question.criteria, a.choice) || !probability(a.confidence) || !objectRecord(a.probabilities)) throw new Error('Invalid choice');
      const probabilities: Record<string, number> = {};
      for (const choice of Object.keys(question.criteria)) {
        const p = a.probabilities[choice];
        if (!probability(p)) throw new Error('Invalid choice probability');
        probabilities[choice] = p;
      }
      if (Math.abs(Object.values(probabilities).reduce((sum,p) => sum+p,0)-1)>0.02) throw new Error('Invalid distribution');
      out[key] = { type: 'choice', choice: a.choice, confidence: a.confidence, probabilities };
    }
  }
  return out;
}

export async function decide(state: unknown, questions: Record<string, Question>, timeoutMs = 8000): Promise<DecisionResult> {
  const key = process.env.STRIKE_REVIEW_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('Jev API key is not configured');
  const reservation = await reserveAiBudget('ask', `ask:${randomUUID()}`, 2000);
  if (!reservation.ok) throw new AiBudgetError(reservation.reason);
  const started = Date.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Jev returned HTTP ${response.status}`);
  const json = await response.json();
  const rawCost = json?.usage?.cost;
  const actualCost = typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0 ? rawCost : null;
  await settleAiBudget(reservation, actualCost);
  const answers = validateAnswers(json?.answers, questions);
  return { answers, cost: actualCost ?? 0, ms: Date.now() - started };
}

export function noul(result: DecisionResult | null, key: string): number | null {
  const answer = result?.answers[key];
  return answer?.type === 'noul' ? answer.noul : null;
}

export function choice(result: DecisionResult | null, key: string): { value: string; p: number } | null {
  const answer = result?.answers[key];
  if (answer?.type !== 'choice') return null;
  return { value: answer.choice, p: answer.probabilities?.[answer.choice] ?? answer.confidence };
}
