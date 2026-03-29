import { FormInput, GitBranch, SlidersHorizontal, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FlowTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'form', label: 'Build', icon: FormInput },
  { id: 'designer', label: 'Design', icon: GitBranch },
  { id: 'details', label: 'Configure', icon: SlidersHorizontal },
  { id: 'run', label: 'Generate', icon: Play },
];

export function FlowTabs({ activeTab, onTabChange }: FlowTabsProps) {
  return (
    <div className="flex border-b border-border-subtle">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-b-2 border-accent text-accent'
              : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
