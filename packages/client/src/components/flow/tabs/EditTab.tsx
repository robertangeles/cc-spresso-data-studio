import { useState } from 'react';
import { ChevronDown, FormInput, GitBranch, SlidersHorizontal } from 'lucide-react';
import type { Flow, FlowField, FlowStep } from '@cc/shared';
import { FormBuilderTab } from './FormBuilderTab';
import { DesignerTab } from './DesignerTab';
import { DetailsTab } from './DetailsTab';

interface EditTabProps {
  flow: Flow;
  updateFlow: (updates: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  description,
  defaultOpen = false,
  children,
}: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surface-2/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-[11px] text-text-tertiary">{description}</p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && <div className="border-t border-border-subtle px-5 py-4">{children}</div>}
    </div>
  );
}

export function EditTab({ flow, updateFlow, onDelete }: EditTabProps) {
  const handleFieldsChange = (fields: FlowField[]) => {
    updateFlow({ config: { ...flow.config, fields } });
  };

  const handleStepsChange = (steps: FlowStep[]) => {
    updateFlow({ config: { ...flow.config, steps } });
  };

  return (
    <div className="space-y-3 max-w-4xl mx-auto">
      <CollapsibleSection
        title="Inputs"
        icon={<FormInput className="h-4 w-4" />}
        description="Define the input fields users fill before running"
        defaultOpen={true}
      >
        <FormBuilderTab fields={flow.config.fields} onFieldsChange={handleFieldsChange} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Steps"
        icon={<GitBranch className="h-4 w-4" />}
        description="Add skills and configure the orchestration pipeline"
        defaultOpen={true}
      >
        <DesignerTab
          steps={flow.config.steps}
          fields={flow.config.fields}
          onStepsChange={handleStepsChange}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Settings"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        description="Name, description, status, and danger zone"
        defaultOpen={false}
      >
        <DetailsTab flow={flow} updateFlow={updateFlow} onDelete={onDelete} />
      </CollapsibleSection>
    </div>
  );
}
