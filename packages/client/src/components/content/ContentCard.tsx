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
  draft: 'bg-gray-100 text-gray-700',
  ready: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

export function ContentCard({ item, onSelect, onCopy, onDelete }: ContentCardProps) {
  return (
    <Card padding="md">
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between">
          <h4 className="font-medium text-gray-900 line-clamp-1">{item.title}</h4>
          <span className={`shrink-0 ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-700'}`}>
            {item.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{item.body}</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          {item.metadata?.model ? <span>via {String(item.metadata.model)}</span> : null}
        </div>
      </button>
      <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
        <Button variant="ghost" size="sm" onClick={onCopy}>Copy</Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
      </div>
    </Card>
  );
}
