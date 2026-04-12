import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { api } from '../lib/api';

export function PrivacyPage() {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get('/pages/privacy')
      .then(({ data }) => setContent(data.data?.body ?? ''))
      .catch(() => setContent('Privacy Policy not found.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-surface-0">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-accent hover:underline mb-8 inline-block">
          &larr; Back to Spresso
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none text-text-secondary prose-headings:text-text-primary prose-a:text-accent prose-strong:text-text-primary prose-li:text-text-secondary">
            <Markdown>{content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
