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
    <div className="flex border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-b-2 border-brand-600 text-brand-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
