import { providerRegistry } from './ai/index.js';
import { getActiveRules } from './profile.service.js';
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

function checkBannedWords(sentences: Array<{ text: string; line: number }>, bannedWords: string[]): Violation[] {
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

function checkSentenceLength(sentences: Array<{ text: string; line: number }>, maxWords = 40): Violation[] {
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
  // Pattern: "X, Y, and Z" or "X, Y, or Z"
  const triadRegex = /\b\w+(?:\s\w+)*,\s+\w+(?:\s\w+)*,\s+(?:and|or)\s+\w+/i;

  for (const s of sentences) {
    if (triadRegex.test(s.text)) {
      violations.push({
        type: 'mechanical',
        rule: 'Triad (3-item list)',
        sentence: s.text,
        line: s.line,
        severity: 'medium',
        explanation: 'Three items grouped in a sentence — cut one, combine two, or break apart',
      });
    }
  }

  return violations;
}

function checkConsecutiveOpeners(sentences: Array<{ text: string; line: number }>): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < sentences.length - 1; i++) {
    const word1 = sentences[i].text.split(/\s/)[0].toLowerCase().replace(/[^a-z]/g, '');
    const word2 = sentences[i + 1].text.split(/\s/)[0].toLowerCase().replace(/[^a-z]/g, '');

    if (word1 === word2 && word1.length > 1) {
      // Check for 3 in a row (hard ban)
      if (i + 2 < sentences.length) {
        const word3 = sentences[i + 2].text.split(/\s/)[0].toLowerCase().replace(/[^a-z]/g, '');
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
  const passiveRegex = /\b(?:is|are|was|were|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|written|made|done|given|taken|known|seen|shown|found|told|thought|built|held|kept|left|meant|put|run|set|understood)\b/i;

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

    // Skip short sentences (under 10 words) — they naturally cluster in length
    if (len1 < 10 || len2 < 10 || len3 < 10) continue;

    if (Math.abs(len1 - len2) <= 5 && Math.abs(len2 - len3) <= 5 && Math.abs(len1 - len3) <= 5) {
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
  const match = rulesText.match(/\*?\*?[Bb]anned\s+words\*?\*?:?\s*\n?([\s\S]*?)(?:\n\n|\n\*|\n#|$)/);
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

export async function aiAudit(content: string, userId: string): Promise<Violation[]> {
  const rules = await getActiveRules(userId);
  const rulesText = rules
    .filter((r) => r.name !== 'Banned Words and Style Violations') // Handled programmatically
    .map((r) => r.rules)
    .join('\n\n');

  if (!rulesText.trim()) return [];

  const prompt = `You are a content quality auditor. Check the following text against the rules below. Return ONLY a JSON array of violations found. If no violations, return [].

Each violation object:
{"rule": "rule name", "sentence": "the exact sentence that violates", "explanation": "why this violates the rule"}

Focus on SUBJECTIVE rules only — things that require judgment:
- Narrator thesis statements (narrator directly stating a cultural insight)
- Decorative metaphors (not grounded in physical reality)
- Polished wrap-ups (tidy lessons, rhythmic callbacks, inspirational reframes)
- Lyrical balance (sentences that feel rhythmically "pretty")
- Setup-and-pivot patterns ("Most people think... but actually...")
- Mirrored sentences (A then B then restate in reverse)

RULES:
${rulesText}

TEXT:
${content}

Return ONLY the JSON array. No explanation outside the array.`;

  try {
    const response = await providerRegistry.complete({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2000,
    });

    const cleaned = stripThinkingBlocks(response.content).trim();

    // Parse JSON array
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ rule: string; sentence: string; explanation: string }>;

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

export async function fullAudit(content: string, userId: string): Promise<AuditResult> {
  const programmatic = await auditContent(content, userId);
  const subjective = await aiAudit(content, userId);

  const allViolations = [...programmatic.violations, ...subjective];

  return {
    violations: allViolations,
    mechanical: programmatic.mechanical,
    subjective: subjective.length,
    total: allViolations.length,
  };
}

// --- Rework ---

export async function reworkViolations(
  content: string,
  violations: Violation[],
  model: string,
): Promise<string> {
  if (violations.length === 0) return content;

  const violationList = violations
    .map((v, i) => `${i + 1}. ${v.rule}: "${v.sentence}" — ${v.explanation ?? v.rule}`)
    .join('\n');

  const prompt = `The following text has specific rule violations. Fix ONLY the listed violations. Preserve everything else — voice, structure, facts, flow, paragraph breaks.

Do NOT add new content. Do NOT remove content that isn't violated. Do NOT change the overall structure. Just fix the specific violations listed below.

VIOLATIONS TO FIX:
${violationList}

TEXT:
${content}

Return the full revised text with only the violations fixed. No commentary, no explanation — just the revised text.`;

  const response = await providerRegistry.complete({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 8000,
  });

  return stripThinkingBlocks(response.content);
}

// --- Rework Loop (auto-fix with re-audit) ---

export async function reworkLoop(
  content: string,
  userId: string,
  model: string,
  maxRounds = 3,
  onRound?: (round: ReworkRound) => void,
): Promise<{ finalContent: string; rounds: ReworkRound[]; remainingViolations: Violation[] }> {
  const rounds: ReworkRound[] = [];
  let currentContent = content;

  for (let round = 1; round <= maxRounds; round++) {
    // Audit current content
    const audit = await auditContent(currentContent, userId);
    if (audit.total === 0) break;

    const beforeCount = audit.total;

    // Rework
    currentContent = await reworkViolations(currentContent, audit.violations, model);

    // Re-audit
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

    // If no improvement, stop
    if (fixedCount <= 0) break;
    // If clean, stop
    if (afterAudit.total === 0) break;
  }

  // Final audit
  const finalAudit = await auditContent(currentContent, userId);

  return {
    finalContent: currentContent,
    rounds,
    remainingViolations: finalAudit.violations,
  };
}
