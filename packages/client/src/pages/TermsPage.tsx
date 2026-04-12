import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { api } from '../lib/api';

export function TermsPage() {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get('/pages/terms')
      .then(({ data }) => setContent(data.data?.body ?? ''))
      .catch(() => setContent('Terms of Service not found.'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Header bar */}
      <div className="border-b border-border-subtle bg-surface-1">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-accent hover:underline">
            &larr; Back to Spresso
          </Link>
          <span className="text-xs text-text-tertiary">spresso.xyz</span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : (
          <div className="legal-document">
            <Markdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-3xl font-bold text-text-primary mb-2 pb-4 border-b border-border-subtle">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-semibold text-text-primary mt-10 mb-4 pb-2 border-b border-border-subtle/50">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold text-text-primary mt-6 mb-3">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-text-secondary leading-relaxed mb-4">{children}</p>
                ),
                ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>,
                li: ({ children }) => (
                  <li className="text-sm text-text-secondary leading-relaxed">{children}</li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-text-primary">{children}</strong>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-accent hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
