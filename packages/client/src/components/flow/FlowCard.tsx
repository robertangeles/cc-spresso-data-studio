import { Link } from 'react-router-dom';
import type { Flow } from '@cc/shared';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

interface FlowCardProps {
  flow: Flow;
  onDelete: (id: string) => void;
}

export function FlowCard({ flow, onDelete }: FlowCardProps) {
  const statusColors = {
    draft: 'bg-yellow-500/10 text-yellow-400',
    published: 'bg-green-500/10 text-green-400',
    archived: 'bg-surface-3 text-text-secondary',
  };

  return (
    <Card className="flex flex-col justify-between transition-all duration-300 ease-spring hover:shadow-glow">
      <div>
        <div className="flex items-start justify-between">
          <Link
            to={`/flows/${flow.id}`}
            className="text-lg font-semibold text-text-primary hover:text-accent"
          >
            {flow.name}
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[flow.status as keyof typeof statusColors] || statusColors.draft}`}
          >
            {flow.status}
          </span>
        </div>
        {flow.description && (
          <p className="mt-1 text-sm text-text-secondary">{flow.description}</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <span className="text-xs text-text-tertiary">
          Updated {new Date(flow.updatedAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2">
          <Link to={`/flows/${flow.id}`}>
            <Button variant="secondary" size="sm">
              Edit
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => onDelete(flow.id)}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
