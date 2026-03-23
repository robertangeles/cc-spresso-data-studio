import { useState, useEffect, useCallback } from 'react';
import type { Flow } from '@cc/shared';
import { FormBuilderTab } from './tabs/FormBuilderTab';
import { DesignerTab } from './tabs/DesignerTab';
import { DetailsTab } from './tabs/DetailsTab';
import { RunFlowTab } from './tabs/RunFlowTab';

interface FlowWorkspaceProps {
  activeTab: string;
  flow: Flow;
  updateFlow: (updates: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => void;
}

// Banner notification for background execution
function ExecutionBanner({ flowName, onClick }: { flowName: string; onClick: () => void }) {
  return (
    <div
      className="fixed top-4 right-4 z-50 cursor-pointer rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 shadow-lg animate-pulse"
      onClick={onClick}
    >
      <p className="text-sm font-medium text-brand-700">
        {flowName} is generating output
      </p>
      <p className="text-xs text-brand-500 mt-0.5">Click to view</p>
    </div>
  );
}

export function FlowWorkspace({ activeTab, flow, updateFlow, onDelete }: FlowWorkspaceProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const handleFieldsChange = (fields: typeof flow.config.fields) => {
    updateFlow({ config: { ...flow.config, fields } });
  };

  const handleStepsChange = (steps: typeof flow.config.steps) => {
    updateFlow({ config: { ...flow.config, steps } });
  };

  // Track if execution is running (listen for custom event from RunFlowTab)
  const handleExecutionStart = useCallback(() => {
    setIsRunning(true);
  }, []);

  const handleExecutionEnd = useCallback(() => {
    setIsRunning(false);
    setShowBanner(false);
  }, []);

  useEffect(() => {
    window.addEventListener('orchestration:start', handleExecutionStart);
    window.addEventListener('orchestration:end', handleExecutionEnd);
    return () => {
      window.removeEventListener('orchestration:start', handleExecutionStart);
      window.removeEventListener('orchestration:end', handleExecutionEnd);
    };
  }, [handleExecutionStart, handleExecutionEnd]);

  // Show banner when running and not on the Generate tab
  useEffect(() => {
    if (isRunning && activeTab !== 'run') {
      setShowBanner(true);
    } else {
      setShowBanner(false);
    }
  }, [isRunning, activeTab]);

  return (
    <div className="flex-1 overflow-auto p-6">
      {showBanner && (
        <ExecutionBanner
          flowName={flow.name}
          onClick={() => {
            // Trigger tab change — dispatch event for parent
            window.dispatchEvent(new CustomEvent('orchestration:viewResults'));
          }}
        />
      )}

      {/* All tabs stay mounted — use CSS to show/hide */}
      <div className={activeTab === 'form' ? '' : 'hidden'}>
        <FormBuilderTab fields={flow.config.fields} onFieldsChange={handleFieldsChange} />
      </div>
      <div className={activeTab === 'designer' ? '' : 'hidden'}>
        <DesignerTab steps={flow.config.steps} fields={flow.config.fields} onStepsChange={handleStepsChange} />
      </div>
      <div className={activeTab === 'details' ? '' : 'hidden'}>
        <DetailsTab flow={flow} updateFlow={updateFlow} onDelete={onDelete} />
      </div>
      <div className={activeTab === 'run' ? '' : 'hidden'}>
        <RunFlowTab flow={flow} />
      </div>
    </div>
  );
}
