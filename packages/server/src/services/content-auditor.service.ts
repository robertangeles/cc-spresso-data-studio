import { providerRegistry } from './ai/index.js';
import { getActiveRules } from './profile.service.js';
import { getSystemPromptBySlug } from './system-prompt.service.js';
import { withSessionGate } from './session-gate.service.js';
import { stripThinkingBlocks } from './flow-executor.service.js';
import { logger } from '../config/logger.js';

// --- Types ---

export interface Violation {
  type: 'mechanical' | 'subjective';
  rule: string;
  sentence: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  explanation?: string;
}

export interface AuditResult {
  violations: Violation[];
  mechanical: number;
  subjective: number;
  total: number;
}

export interface ReworkRound {
  round: number;
  fixedCount: number;
  remainingCount: number;
  revisedContent: string;
}

// --- Sentence Utilities ---

function splitSentences(text: string): Array<{ text: string; line: number }> {
  const lines = text.split('\n');
  const sentences: Array<{ text: string; line: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by sentence-ending punctuation, keeping the delimiter
    const parts = line.match(/[^.!?]+[.!?]+/g);
    if (parts) {
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 2) {
          sentences.push({ text: trimmed, line: i + 1 });
        }
      }
    } else if (line.length > 5) {
      // Line without sentence-ending punctuation (title, heading)
      sentences.push({ text: line, line: i + 1 });
    }
  }

  return sentences;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// --- Programmatic Checks ---

function checkBannedWords(
  sentences: Array<{ text: string; line: number }>,
  bannedWords: string[],
): Violation[] {
  const violations: Violation[] = [];

  for (const s of sentences) {
    const lower = s.text.toLowerCase();
    for (const word of bannedWords) {
      // Match whole word (with word boundaries)
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) {
        violations.push({
          type: 'mechanical',
          rule: 'Banned word',
          sentence: s.text,
          line: s.line,
          severity: 'high',
          explanation: `Contains banned word "${word}"`,
        });
      }
    }
  }

  return violations;
}

function checkSentenceLength(
  sentences: Array<{ text: string; line: number }>,
  maxWords = 40,
): Violation[] {
  const violations: Violation[] = [];

  for (const s of sentences) {
    const wc = countWords(s.text);
    if (wc > maxWords) {
      violations.push({
        type: 'mechanical',
        rule: 'Sentence too long',
        sentence: s.text,
        line: s.line,
        severity: 'medium',
        explanation: `${wc} words (max ${maxWords})`,
      });
    }
  }

  return violations;
}

function checkTriads(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];

  // Skip sentences with dialogue attribution — characters can speak in triads
  const isDialogue = (text: string) =>
    /\b(?:she|he|they)\s+(?:says?|said|tells?|told|asks?|asked)\b/i.test(text) ||
    /^[""\u201C]/.test(text.trim());

  // Pattern 1: "X, Y, and Z" or "X, Y, or Z"
  const commaAndTriad = /\b\w+(?:\s\w+)*,\s+\w+(?:\s\w+)*,\s+(?:and|or)\s+\w+/i;
  // Pattern 2: "X and Y and Z" (sequential and-chains)
  const andChain = /\band\b[^.!?]*\band\b[^.!?]*\band\b/i;
  // Pattern 3: Three comma-separated phrases (no "and" needed) — e.g. "pressed flat, brown at edges, smelling faintly"
  const commaList = /(?:^|[.!?]\s+)[^,]*,[^,]*,[^,]*(?:[.!?]|$)/;
  // Pattern 4: Stacked participles — "doing, seeing, feeling"
  const stackedParticiples = /\b\w+ing\b[^.]*,\s*\b\w+ing\b[^.]*,\s*\b\w+ing\b/i;

  for (const s of sentences) {
    if (isDialogue(s.text)) continue;

    let matched = false;
    let explanation = 'Three items grouped in a sentence — cut one, combine two, or break apart';

    if (stackedParticiples.test(s.text)) {
      matched = true;
      explanation = 'Stacked participles (doing, seeing, feeling) — banned pattern';
    } else if (commaAndTriad.test(s.text)) {
      matched = true;
    } else if (andChain.test(s.text)) {
      matched = true;
      explanation = 'Three "and"-chained clauses — cut one or restructure';
    } else if (commaList.test(s.text)) {
      // Only flag if there are 3+ comma-separated phrases of substance (not just short words)
      const commas = s.text.split(',').filter((p) => p.trim().split(/\s+/).length >= 2);
      if (commas.length >= 3) {
        matched = true;
        explanation = 'Three comma-separated phrases — cut one or combine two';
      }
    }

    if (matched) {
      violations.push({
        type: 'mechanical',
        rule: 'Triad (3-item list)',
        sentence: s.text,
        line: s.line,
        severity: 'medium',
        explanation,
      });
    }
  }

  return violations;
}

function checkConsecutiveOpeners(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < sentences.length - 1; i++) {
    const word1 = sentences[i].text
      .split(/\s/)[0]
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    const word2 = sentences[i + 1].text
      .split(/\s/)[0]
      .toLowerCase()
      .replace(/[^a-z]/g, '');

    if (word1 === word2 && word1.length > 1) {
      // Check for 3 in a row (hard ban)
      if (i + 2 < sentences.length) {
        const word3 = sentences[i + 2].text
          .split(/\s/)[0]
          .toLowerCase()
          .replace(/[^a-z]/g, '');
        if (word1 === word3) {
          violations.push({
            type: 'mechanical',
            rule: 'Three consecutive same openers',
            sentence: `"${sentences[i].text}" / "${sentences[i + 1].text}" / "${sentences[i + 2].text}"`,
            line: sentences[i].line,
            severity: 'high',
            explanation: `Three sentences start with "${word1}" — hard ban`,
          });
          continue;
        }
      }
      violations.push({
        type: 'mechanical',
        rule: 'Consecutive same openers',
        sentence: `"${sentences[i].text}" / "${sentences[i + 1].text}"`,
        line: sentences[i].line,
        severity: 'medium',
        explanation: `Two consecutive sentences start with "${word1}"`,
      });
    }
  }

  return violations;
}

function checkSemicolons(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];

  for (const s of sentences) {
    if (s.text.includes(';')) {
      violations.push({
        type: 'mechanical',
        rule: 'Semicolon',
        sentence: s.text,
        line: s.line,
        severity: 'medium',
        explanation: 'No semicolons allowed — use a period or rewrite',
      });
    }
  }

  return violations;
}

function checkPassiveVoice(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];
  const passiveRegex =
    /\b(?:is|are|was|were|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|written|made|done|given|taken|known|seen|shown|found|told|thought|built|held|kept|left|meant|put|run|set|understood)\b/i;

  for (const s of sentences) {
    if (passiveRegex.test(s.text)) {
      violations.push({
        type: 'mechanical',
        rule: 'Passive voice',
        sentence: s.text,
        line: s.line,
        severity: 'low',
        explanation: 'Use active voice unless the actor is unknown or irrelevant',
      });
    }
  }

  return violations;
}

function checkSimilarLengths(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < sentences.length - 2; i++) {
    const len1 = countWords(sentences[i].text);
    const len2 = countWords(sentences[i + 1].text);
    const len3 = countWords(sentences[i + 2].text);

    // Skip short sentences (under 12 words) — they naturally cluster in length
    if (len1 < 12 || len2 < 12 || len3 < 12) continue;

    if (Math.abs(len1 - len2) <= 4 && Math.abs(len2 - len3) <= 4 && Math.abs(len1 - len3) <= 4) {
      violations.push({
        type: 'mechanical',
        rule: 'Three similar-length sentences',
        sentence: `Lines ${sentences[i].line}-${sentences[i + 2].line}: ${len1}, ${len2}, ${len3} words`,
        line: sentences[i].line,
        severity: 'low',
        explanation: 'Three consecutive sentences within 5 words of each other — vary rhythm',
      });
    }
  }

  return violations;
}

function checkThereIsAre(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];
  const regex = /\bthere\s+(?:is|are|was|were)\b/i;

  for (const s of sentences) {
    if (regex.test(s.text)) {
      violations.push({
        type: 'mechanical',
        rule: '"There is/are" construction',
        sentence: s.text,
        line: s.line,
        severity: 'medium',
        explanation: 'Rewrite with a concrete subject performing an action',
      });
    }
  }

  return violations;
}

// --- Extract banned words from rules ---

function extractBannedWords(rulesText: string): string[] {
  // Look for "Banned words:" or "**Banned words:**" followed by a comma-separated list
  const match = rulesText.match(
    /\*?\*?[Bb]anned\s+words\*?\*?:?\s*\n?([\s\S]*?)(?:\n\n|\n\*|\n#|$)/,
  );
  if (!match) return [];

  return match[1]
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0 && w.length < 30);
}

// --- Main Audit Function ---

export async function auditContent(content: string, userId: string): Promise<AuditResult> {
  const sentences = splitSentences(content);
  if (sentences.length === 0) {
    return { violations: [], mechanical: 0, subjective: 0, total: 0 };
  }

  // Load user rules to extract banned words
  const rules = await getActiveRules(userId);
  const allRulesText = rules.map((r) => r.rules).join('\n\n');
  const bannedWords = extractBannedWords(allRulesText);

  // Run all programmatic checks
  const violations: Violation[] = [
    ...checkBannedWords(sentences, bannedWords),
    ...checkSentenceLength(sentences),
    ...checkTriads(sentences),
    ...checkConsecutiveOpeners(sentences),
    ...checkSemicolons(sentences),
    ...checkPassiveVoice(sentences),
    ...checkSimilarLengths(sentences),
    ...checkThereIsAre(sentences),
  ];

  const mechanical = violations.length;

  return {
    violations,
    mechanical,
    subjective: 0,
    total: violations.length,
  };
}

// --- AI Audit (subjective rules) ---

export async function aiAudit(
  content: string,
  userId: string,
  role: string = 'Subscriber',
): Promise<Violation[]> {
  const rules = await getActiveRules(userId);
  const rulesText = rules
    .filter((r) => r.name !== 'Banned Words and Style Violations') // Handled programmatically
    .map((r) => r.rules)
    .join('\n\n');

  if (!rulesText.trim()) return [];

  // Load audit prompt from DB (Settings > System Prompts)
  let promptTemplate: string;
  try {
    const systemPrompt = await getSystemPromptBySlug('content-audit');
    promptTemplate = systemPrompt.body;
  } catch {
    logger.warn(
      'content-audit system prompt not found in DB — run seed or add via Settings > System Prompts',
    );
    return [];
  }

  // Hydrate template variables
  const prompt = promptTemplate.replace('{{rules}}', rulesText).replace('{{content}}', content);

  try {
    const response = await withSessionGate(userId, role, () =>
      providerRegistry.complete({
        model: 'anthropic/claude-haiku-4-5',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 2000,
      }),
    );

    const cleaned = stripThinkingBlocks(response.content).trim();

    // Parse JSON array
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      rule: string;
      sentence: string;
      explanation: string;
    }>;

    return parsed.map((v) => ({
      type: 'subjective' as const,
      rule: v.rule,
      sentence: v.sentence,
      line: findLineNumber(content, v.sentence),
      severity: 'medium' as const,
      explanation: v.explanation,
    }));
  } catch (err) {
    logger.warn({ err }, 'AI audit failed — returning programmatic results only');
    return [];
  }
}

function findLineNumber(content: string, sentence: string): number {
  const lines = content.split('\n');
  const sentenceClean = sentence.toLowerCase().trim().slice(0, 50);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(sentenceClean)) {
      return i + 1;
    }
  }
  return 0;
}

// --- Full Audit (programmatic + AI) ---

export async function fullAudit(
  content: string,
  userId: string,
  role: string = 'Subscriber',
): Promise<AuditResult> {
  const programmatic = await auditContent(content, userId);
  const subjective = await aiAudit(content, userId, role);

  const allViolations = [...programmatic.violations, ...subjective];

  return {
    violations: allViolations,
    mechanical: programmatic.mechanical,
    subjective: subjective.length,
    total: allViolations.length,
  };
}

// --- Programmatic Pre-Fix ---
// Handles trivially removable banned words without an AI call.
//
//   violations → programmaticBannedWordFix (delete trivial words)
//     → re-audit (reduced violations)
//       → if remaining → AI rework (improved prompt + escalation)

export function programmaticBannedWordFix(content: string, violations: Violation[]): string {
  const bannedWordViolations = violations.filter((v) => v.rule === 'Banned word');
  if (bannedWordViolations.length === 0) return content;

  let result = content;

  for (const v of bannedWordViolations) {
    // Extract the banned word from explanation: 'Contains banned word "that"'
    const wordMatch = v.explanation?.match(/banned word "([^"]+)"/i);
    if (!wordMatch) continue;
    const word = wordMatch[1];

    // Safety: skip if the banned word starts a sentence (needs restructuring, not deletion)
    // e.g. "That was the problem" — can't just delete "That"
    const sentenceLower = v.sentence.trim().toLowerCase();
    if (sentenceLower.startsWith(word.toLowerCase())) continue;

    // Build a regex to delete the banned word (whole word, case-insensitive)
    // Match the word with optional surrounding whitespace, preserving one space
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const deleteRegex = new RegExp(`\\s+${escaped}\\b`, 'gi');

    // Only apply to the specific sentence from the violation (not the whole content)
    const originalSentence = v.sentence;
    const fixedSentence = originalSentence.replace(deleteRegex, '');

    // Safety: don't accept if it created orphaned punctuation or empty content
    if (fixedSentence.trim().length < 3) continue;
    if (/\s{2,}/.test(fixedSentence)) {
      // Clean double spaces and try again
      const cleaned = fixedSentence.replace(/\s{2,}/g, ' ').trim();
      if (cleaned.length < 3) continue;
      result = result.replace(originalSentence, cleaned);
    } else {
      result = result.replace(originalSentence, fixedSentence);
    }
  }

  return result;
}

// --- Rework ---

export async function reworkViolations(
  content: string,
  violations: Violation[],
  model: string,
  userId?: string,
  role: string = 'Subscriber',
  round: number = 1,
): Promise<string> {
  if (violations.length === 0) return content;

  // Strip SEO metadata before reworking — re-attach after
  // Matches "## SEO METADATA" or "## SEO META" section at the end of content
  const seoMarkerRegex = /\n---\s*\n\s*## SEO META(?:DATA)?[\s\S]*$/i;
  const seoMatch = content.match(seoMarkerRegex);
  const seoBlock = seoMatch ? seoMatch[0] : '';
  const contentWithoutSeo = seoBlock ? content.slice(0, content.length - seoBlock.length) : content;

  const violationList = violations
    .map((v, i) => `${i + 1}. ${v.rule}: "${v.sentence}" — ${v.explanation ?? v.rule}`)
    .join('\n');

  const wordCount = contentWithoutSeo.split(/\s+/).filter((w) => w.length > 0).length;

  // Proportional word count guard: account for expected word removal from banned words
  const expectedWordReduction = violations.filter((v) => v.rule === 'Banned word').length;
  const adjustedFloor = wordCount - expectedWordReduction - Math.ceil(wordCount * 0.05);
  const minWords = Math.max(adjustedFloor, Math.floor(wordCount * 0.8)); // hard floor at 80%
  const maxWords = Math.ceil(wordCount * 1.05);

  // Load rework prompt from DB (Settings > System Prompts)
  let promptTemplate: string;
  try {
    const systemPrompt = await getSystemPromptBySlug('content-rework');
    promptTemplate = systemPrompt.body;
  } catch {
    logger.warn(
      'content-rework system prompt not found in DB — run seed or add via Settings > System Prompts',
    );
    return content;
  }

  // Hydrate template variables
  let prompt = promptTemplate
    .replace(/\{\{wordCount\}\}/g, String(wordCount))
    .replace('{{minWords}}', String(minWords))
    .replace('{{maxWords}}', String(maxWords))
    .replace('{{violationList}}', violationList)
    .replace('{{content}}', contentWithoutSeo);

  // Round escalation: if previous rounds failed to fix, be more aggressive
  if (round > 1) {
    prompt += `\n\nIMPORTANT: This is Round ${round}. The violations listed above were NOT fixed in previous rounds. You MUST fix every single one this time. For banned words, delete them outright — do not try to preserve them. A shorter text is acceptable.`;
  }

  const reworkFn = () =>
    providerRegistry.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 8000,
    });

  const response = userId ? await withSessionGate(userId, role, reworkFn) : await reworkFn();

  const result = stripThinkingBlocks(response.content);

  // Word count guard: reject if result dropped below hard floor (80%)
  const resultWordCount = result.split(/\s+/).filter((w) => w.length > 0).length;
  if (resultWordCount < wordCount * 0.8) {
    logger.warn(
      {
        original: wordCount,
        result: resultWordCount,
        drop: `${Math.round((1 - resultWordCount / wordCount) * 100)}%`,
      },
      'Rework dropped too many words — keeping original',
    );
    return content;
  }

  // Re-attach SEO metadata block (untouched)
  return seoBlock ? result + seoBlock : result;
}

// --- Rework Loop (auto-fix with re-audit) ---
//
//   for each round:
//     1. Audit → 2. Programmatic pre-fix → 3. Re-audit → 4. AI rework → 5. Re-audit
//   escalation on round > 1, break after 2 consecutive stalls

export async function reworkLoop(
  content: string,
  userId: string,
  model: string,
  maxRounds = 3,
  onRound?: (round: ReworkRound) => void,
  role: string = 'Subscriber',
): Promise<{ finalContent: string; rounds: ReworkRound[]; remainingViolations: Violation[] }> {
  const rounds: ReworkRound[] = [];
  let currentContent = content;
  let consecutiveStalls = 0;

  for (let round = 1; round <= maxRounds; round++) {
    // Audit current content
    const audit = await auditContent(currentContent, userId);
    if (audit.total === 0) break;

    const beforeCount = audit.total;

    // Step 1: Programmatic pre-fix for banned words (zero AI cost)
    currentContent = programmaticBannedWordFix(currentContent, audit.violations);

    // Step 2: AI rework for remaining violations (with escalation on round > 1)
    const postFixAudit = await auditContent(currentContent, userId);
    if (postFixAudit.total > 0) {
      currentContent = await reworkViolations(
        currentContent,
        postFixAudit.violations,
        model,
        userId,
        role,
        round,
      );
    }

    // Re-audit to measure progress
    const afterAudit = await auditContent(currentContent, userId);
    const fixedCount = beforeCount - afterAudit.total;

    const roundResult: ReworkRound = {
      round,
      fixedCount: Math.max(fixedCount, 0),
      remainingCount: afterAudit.total,
      revisedContent: currentContent,
    };

    rounds.push(roundResult);
    onRound?.(roundResult);

    // If clean, stop
    if (afterAudit.total === 0) break;

    // Stall detection: allow one stall (next round has escalation), break on second
    if (fixedCount <= 0) {
      consecutiveStalls++;
      if (consecutiveStalls >= 2) break;
    } else {
      consecutiveStalls = 0;
    }
  }

  // Final audit
  const finalAudit = await auditContent(currentContent, userId);

  return {
    finalContent: currentContent,
    rounds,
    remainingViolations: finalAudit.violations,
  };
}
