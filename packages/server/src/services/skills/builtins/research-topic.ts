import type { SkillConfig } from '@cc/shared';

export const researchTopic: { slug: string; name: string; description: string; category: string; icon: string; tags: string[]; config: SkillConfig } = {
  slug: 'research-topic',
  name: 'Research Topic',
  description: 'Gather comprehensive context on a subject including key facts, common questions, trending angles, and content gaps to inform your content strategy.',
  category: 'research',
  icon: '🔍',
  tags: ['research', 'strategy', 'planning', 'analysis'],
  config: {
    inputs: [
      { id: 'topic', key: 'topic', type: 'text', label: 'Topic', description: 'The subject you want to research', required: true },
      { id: 'audience', key: 'audience', type: 'text', label: 'Target Audience', description: 'Who is this content for?', required: false, defaultValue: 'general professional audience' },
      { id: 'depth', key: 'depth', type: 'select', label: 'Research Depth', required: false, defaultValue: 'standard', options: ['quick-overview', 'standard', 'deep-dive'] },
    ],
    outputs: [
      { key: 'research_summary', type: 'markdown', label: 'Research Summary', description: 'Comprehensive research findings' },
    ],
    promptTemplate: `Research the following topic comprehensively for content creation purposes.

Topic: {{topic}}
Target Audience: {{audience}}
Depth: {{depth}}

Provide:
1. **Key Facts & Statistics** — verifiable data points and trends
2. **Common Questions** — what people frequently ask about this topic
3. **Trending Angles** — current conversations and hot takes
4. **Content Gaps** — underserved subtopics that could differentiate content
5. **Key Terminology** — important terms and concepts to use
6. **Potential Hooks** — attention-grabbing angles for content pieces

Format as structured markdown with clear sections.`,
    systemPrompt: 'You are a content research analyst. Provide well-organized, actionable research that helps content creators develop informed, differentiated content.',
    capabilities: ['research'],
    temperature: 0.5,
    maxTokens: 3000,
  },
};
