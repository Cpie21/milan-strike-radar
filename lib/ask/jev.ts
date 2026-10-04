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

export async function decide(state: unknown, questions: Record<string, Question>, timeoutMs = 8000): Promise<DecisionResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
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
  if (!json?.answers) throw new Error('Jev response has no answers');
  return { answers: json.answers, cost: Number(json.usage?.cost) || 0, ms: Date.now() - started };
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
