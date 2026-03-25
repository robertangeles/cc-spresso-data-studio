import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface ContentCardProps {
  item: {
    id: string;
    title: string;
    body: string;
    status: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  };
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

const statusColors: Record<string, string> = {
  draft: 'bg-surface-3 text-text-secondary',
  ready: 'bg-blue-500/10 text-blue-400',
  published: 'bg-green-500/10 text-green-400',
  archived: 'bg-yellow-500/10 text-yellow-400',
};

export function ContentCard({ item, onSelect, onCopy, onDelete }: ContentCardProps) {
  return (
    <Card padding="md">
      <button type="button" onClick={onSelect} className="w-full text-left transition-all duration-300 ease-spring">
        <div className="flex items-start justify-between">
          <h4 className="font-medium text-text-primary line-clamp-1">{item.title}</h4>
          <span className={`shrink-0 ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[item.status] || 'bg-surface-3 text-text-secondary'}`}>
            {item.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-text-secondary line-clamp-2">{item.body}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          {item.metadata?.model ? <span>via {String(item.metadata.model)}</span> : null}
        </div>
      </button>
      <div className="mt-2 flex gap-1 border-t border-border-subtle pt-2">
        <Button variant="ghost" size="sm" onClick={onCopy}>Copy</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
      </div>
    </Card>
  );
}
