import type { SkillConfig } from '@cc/shared';

export const extractKeyQuotes: { slug: string; name: string; description: string; category: string; icon: string; tags: string[]; config: SkillConfig } = {
  slug: 'extract-key-quotes',
  name: 'Extract Key Quotes',
  description: 'Pull out the most shareable, impactful quotes and statements from any content. Perfect for social media snippets, pull quotes, and highlight reels.',
  category: 'extract',
  icon: '💬',
  tags: ['quotes', 'extract', 'social-media', 'highlights'],
  config: {
    inputs: [
      { id: 'content', key: 'content', type: 'multiline', label: 'Source Content', description: 'Paste the content to extract quotes from', required: true },
      { id: 'count', key: 'count', type: 'text', label: 'Number of Quotes', description: 'How many quotes to extract', required: false, defaultValue: '5' },
    ],
    outputs: [
      { key: 'quotes', type: 'markdown', label: 'Key Quotes', description: 'Extracted shareable quotes' },
    ],
    promptTemplate: `Extract {{count}} key quotes from the following content. Select statements that are:
- Shareable on social media
- Thought-provoking or insightful
- Self-contained (make sense without context)
- Memorable and impactful

Content:
{{content}}

For each quote, provide:
1. The exact quote (or a lightly edited version for clarity)
2. Why it's shareable (1 sentence)
3. Best platform for this quote (Twitter, LinkedIn, Instagram, etc.)

Format as a numbered list with clear separation between quotes.`,
    systemPrompt: 'You are a content curator specializing in identifying high-impact statements. You find the gold nuggets in any piece of content.',
    capabilities: [],
    temperature: 0.4,
    maxTokens: 1500,
  },
};
