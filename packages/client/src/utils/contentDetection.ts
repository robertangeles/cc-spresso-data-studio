/**
 * Heuristics for detecting whether an AI response is substantial content
 * (suitable for auto-populating the editor) vs. a question or refusal.
 */

const REFUSAL_PREFIXES = [
  "i'm sorry",
  'i cannot',
  "i can't",
  "i'm unable",
  'i am unable',
  'i apologize',
  'an error occurred',
  'sorry, i',
];

/**
 * Returns true if the AI response looks like substantial generated content
 * rather than a clarifying question, refusal, or error message.
 *
 * Heuristic:
 * - Must be >100 chars (short responses are likely questions)
 * - Must not start with a refusal phrase
 * - Must not be primarily questions (>50% of sentences end with ?)
 */
export function isContentResponse(text: string): boolean {
  const trimmed = text.trim();

  // Empty or whitespace-only
  if (!trimmed) return false;

  // Too short to be meaningful content
  if (trimmed.length < 100) return false;

  // Starts with a refusal phrase
  const lower = trimmed.toLowerCase();
  if (REFUSAL_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;

  // Split into lines to analyze structure
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);

  // Count lines that end with a question mark (ignoring trailing whitespace)
  const questionLines = lines.filter((l) => l.trim().endsWith('?')).length;

  // If more than 40% of lines are questions, this is an interrogation, not content
  if (lines.length > 1 && questionLines / lines.length > 0.4) return false;

  // Count question marks vs total sentence-enders (. ! ?)
  // Exclude numbered list markers (e.g., "1." "2.") from period count
  const cleanedText = trimmed.replace(/\b\d+\./g, '');
  const questionMarks = (cleanedText.match(/\?/g) || []).length;
  const totalEnders = (cleanedText.match(/[.!?]/g) || []).length || 1;

  // If more than 50% of sentence-enders are questions, it's asking, not generating
  if (questionMarks / totalEnders > 0.5) return false;

  return true;
}

/**
 * Creates the synthesized user-facing trigger message when a prompt is auto-sent.
 * The actual prompt body is sent as the systemPrompt (invisible to chat).
 */
export function synthesizeTriggerMessage(promptName: string): string {
  const name = promptName.length > 80 ? promptName.slice(0, 77) + '...' : promptName;
  return `I'd like to use the "${name}" prompt. Please follow its instructions.`;
}
