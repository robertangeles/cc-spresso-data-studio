import { useState, useEffect, useCallback } from 'react';
import type { Flow } from '@cc/shared';
import { EditTab } from './tabs/EditTab';
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
      <p className="text-sm font-medium text-brand-700">{flowName} is generating output</p>
      <p className="text-xs text-brand-500 mt-0.5">Click to view</p>
    </div>
  );
}

export function FlowWorkspace({ activeTab, flow, updateFlow, onDelete }: FlowWorkspaceProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

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
            window.dispatchEvent(new CustomEvent('orchestration:viewResults'));
          }}
        />
      )}

      {/* Two tabs: Edit and Generate */}
      <div className={activeTab === 'edit' ? '' : 'hidden'}>
        <EditTab flow={flow} updateFlow={updateFlow} onDelete={onDelete} />
      </div>
      <div className={activeTab === 'run' ? '' : 'hidden'}>
        <RunFlowTab flow={flow} />
      </div>
    </div>
  );
}
