import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SchedulePanel } from './SchedulePanel';

interface ScheduleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // SchedulePanel passthrough
  onSchedule: (date: string) => void;
  onPublishNow: () => void;
  onSaveDraft: () => void;
  isSaving: boolean;
  selectedChannelCount: number;
  flowState?: string;
  scheduleDate: string;
  onScheduleDateChange: (date: string) => void;
  refreshKey?: number;
}

export function ScheduleDrawer({ isOpen, onClose, ...scheduleProps }: ScheduleDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 drawer-overlay" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[380px] max-w-[90vw] flex flex-col bg-surface-1 border-l border-border-subtle shadow-dark-lg animate-drawer-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-1/80 backdrop-blur-sm">
          <span className="text-sm font-heading font-semibold text-text-primary">
            Schedule & Publish
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Schedule body */}
        <div className="flex-1 overflow-y-auto p-4">
          <SchedulePanel {...scheduleProps} />
        </div>
      </div>
    </>
  );
}
