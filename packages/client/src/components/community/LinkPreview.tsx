import { ExternalLink } from 'lucide-react';
import type { LinkPreviewMetadata } from '@cc/shared';

interface LinkPreviewProps {
  url: string;
  metadata: LinkPreviewMetadata;
}

export function LinkPreview({ url, metadata }: LinkPreviewProps) {
  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-2 flex overflow-hidden rounded-xl bg-surface-2/40 backdrop-blur-sm shadow-[inset_3px_0_0_rgba(255,214,10,0.3)] transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:shadow-[inset_3px_0_0_rgba(255,214,10,0.5),0_0_12px_rgba(255,214,10,0.08)] max-w-md"
    >
      {metadata.image && (
        <div className="flex-shrink-0 w-24 h-24 overflow-hidden relative">
          <img
            src={metadata.image}
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 ease-spring group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface-2/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>
      )}
      <div className="flex flex-col justify-center gap-1 p-3 min-w-0">
        {metadata.title && (
          <p className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors duration-200">
            {metadata.title}
          </p>
        )}
        {metadata.description && (
          <p className="text-xs text-text-tertiary line-clamp-2">{metadata.description}</p>
        )}
        <div className="flex items-center gap-1 text-xs text-text-tertiary/70">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{metadata.siteName || domain}</span>
        </div>
      </div>
    </a>
  );
}
