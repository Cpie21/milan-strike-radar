export function validateFeedback(content: unknown, nickname: unknown) {
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 1000) return null;
  if (nickname !== undefined && (typeof nickname !== 'string' || nickname.trim().length > 60)) return null;
  return { content: content.trim(), nickname: typeof nickname === 'string' ? nickname.trim() : null };
}
