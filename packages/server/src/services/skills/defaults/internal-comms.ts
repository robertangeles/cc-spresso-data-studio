import type { SkillCategory, SkillConfig, SkillCapability } from '@cc/shared';

export const internal_comms_skill = {
  slug: 'internal-comms',
  name: 'Internal Comms',
  description:
    'A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to write some sort of internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates, etc.).',
  category: 'generate' as SkillCategory,
  icon: '🔍',
  tags: ['imported', 'anthropic', 'communications'],
  config: {
    inputs: [
      {
        id: 'content',
        key: 'content',
        type: 'multiline' as const,
        label: 'Input Content',
        description: 'Provide the content or context for this skill',
        required: true,
      },
    ],
    outputs: [
      {
        key: 'result',
        type: 'markdown' as const,
        label: 'Result',
        description: 'The skill output',
      },
    ],
    promptTemplate: `Follow the instructions below to process the user's input.

## Skill Instructions

## When to use this skill
To write internal communications, use this skill for:
- 3P updates (Progress, Plans, Problems)
- Company newsletters
- FAQ responses
- Status reports
- Leadership updates
- Project updates
- Incident reports

## How to use this skill

To write any internal communication:

1. **Identify the communication type** from the request
2. **Load the appropriate guideline file** from the \`examples/\` directory:
    - \`examples/3p-updates.md\` - For Progress/Plans/Problems team updates
    - \`examples/company-newsletter.md\` - For company-wide newsletters
    - \`examples/faq-answers.md\` - For answering frequently asked questions
    - \`examples/general-comms.md\` - For anything else that doesn't explicitly match one of the above
3. **Follow the specific instructions** in that file for formatting, tone, and content gathering

If the communication type doesn't match any existing guideline, ask for clarification or more context about the desired format.

## Keywords
3P updates, company newsletter, company comms, weekly update, faqs, common questions, updates, internal comms

## User Input

{{content}}`,
    systemPrompt:
      'You are an AI assistant executing the "Internal Comms" skill. A set of resources to help me write all kinds of internal communications, using the formats that my company likes to use. Claude should use this skill whenever asked to write some sort of internal communications (status reports, leadership updates, 3P updates, company newsletters, FAQs, incident reports, project updates, etc.).. Follow the skill instructions precisely and produce high-quality output.',
    capabilities: [] as SkillCapability[],
    temperature: 0.7,
    maxTokens: 4000,
  } satisfies SkillConfig,
};
