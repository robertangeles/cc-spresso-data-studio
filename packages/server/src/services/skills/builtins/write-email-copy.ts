import type { SkillConfig } from '@cc/shared';

export const writeEmailCopy: { slug: string; name: string; description: string; category: string; icon: string; tags: string[]; config: SkillConfig } = {
  slug: 'write-email-copy',
  name: 'Write Email Copy',
  description: 'Generate compelling email or newsletter content from a topic, brief, or existing content. Outputs subject line, preview text, and body.',
  category: 'generate',
  icon: '📧',
  tags: ['email', 'newsletter', 'copywriting', 'marketing'],
  config: {
    inputs: [
      { id: 'brief', key: 'brief', type: 'multiline', label: 'Email Brief', description: 'Describe what the email should communicate, or paste source content to adapt', required: true },
      { id: 'type', key: 'type', type: 'select', label: 'Email Type', required: false, defaultValue: 'newsletter', options: ['newsletter', 'promotional', 'welcome', 'announcement', 'follow-up'] },
      { id: 'cta', key: 'cta', type: 'text', label: 'Call to Action', description: 'What action should the reader take?', required: false, defaultValue: 'Learn more' },
    ],
    outputs: [
      { key: 'email_copy', type: 'markdown', label: 'Email Copy', description: 'Complete email with subject, preview, and body' },
    ],
    promptTemplate: `Write a compelling {{type}} email based on the following brief.

Brief:
{{brief}}

Call to Action: {{cta}}

Deliver:
1. **Subject Line** — 3 options, each under 60 characters
2. **Preview Text** — 1-2 sentences that complement the subject line
3. **Email Body** — well-structured, scannable copy with:
   - A strong opening hook
   - Clear value proposition
   - Supporting details
   - A prominent call to action: "{{cta}}"
4. **P.S. Line** — optional but effective closer

Keep the tone conversational and professional. Use short paragraphs and clear formatting.`,
    systemPrompt: 'You are an email marketing copywriter. You write emails that get opened, read, and clicked. Your copy is clear, compelling, and conversion-focused.',
    capabilities: [],
    temperature: 0.7,
    maxTokens: 2000,
  },
};
