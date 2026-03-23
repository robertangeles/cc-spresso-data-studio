import type { SkillConfig } from '@cc/shared';

export const repurposeBlogToTweets: { slug: string; name: string; description: string; category: string; icon: string; tags: string[]; config: SkillConfig } = {
  slug: 'repurpose-blog-to-tweets',
  name: 'Repurpose Blog to Tweets',
  description: 'Transform a long-form blog post or article into a series of engaging tweet variations, maintaining key messages while adapting tone for social media.',
  category: 'repurpose',
  icon: '🐦',
  tags: ['social-media', 'twitter', 'repurpose', 'content'],
  config: {
    inputs: [
      { id: 'content', key: 'content', type: 'multiline', label: 'Blog Content', description: 'Paste your blog post or article text', required: true },
      { id: 'tone', key: 'tone', type: 'select', label: 'Tone', description: 'Select the tone for the tweets', required: false, defaultValue: 'professional', options: ['professional', 'casual', 'witty', 'inspirational', 'educational'] },
      { id: 'count', key: 'count', type: 'text', label: 'Number of Tweets', description: 'How many tweet variations to generate', required: false, defaultValue: '8' },
    ],
    outputs: [
      { key: 'tweets', type: 'markdown', label: 'Tweet Thread', description: 'Generated tweet variations' },
    ],
    promptTemplate: `You are a social media expert. Transform the following blog content into {{count}} engaging tweets.

Tone: {{tone}}

Blog content:
{{content}}

Rules:
- Each tweet must be under 280 characters
- Vary the format: questions, statements, hooks, data points
- Include relevant hashtag suggestions
- Make each tweet standalone (don't rely on context from other tweets)
- Preserve the key messages and insights from the original content

Output each tweet numbered, with a blank line between them.`,
    systemPrompt: 'You are a social media strategist specializing in content repurposing. You create high-engagement tweets that drive clicks and conversations.',
    capabilities: [],
    temperature: 0.8,
    maxTokens: 2000,
  },
};
