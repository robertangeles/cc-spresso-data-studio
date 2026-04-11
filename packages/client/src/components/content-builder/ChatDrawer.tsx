import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { CopilotChat } from './CopilotChat';
import type { ChatMessage } from '../../hooks/useContentChat';
import type { Prompt } from '../../hooks/usePrompts';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // CopilotChat passthrough
  messages: ChatMessage[];
  isSending: boolean;
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  activePromptId: string | null;
  activePromptName: string | null;
  isSendingPrompt?: boolean;
  onSelectPrompt: (promptId: string, name: string, body: string) => void;
  onClearPrompt: () => void;
  onCreateNewPrompt: () => void;
  prompts: Prompt[];
  promptsLoading: boolean;
  onDeletePrompt?: (id: string) => void;
  onEditPrompt?: (prompt: {
    id: string;
    name: string;
    description: string | null;
    body: string;
    category: string;
    defaultModel: string | null;
  }) => void;
  model: string;
  onModelChange: (model: string) => void;
  onApplyToEditor: (content: string) => void;
}

export function ChatDrawer({ isOpen, onClose, ...chatProps }: ChatDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

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
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[90vw] flex flex-col bg-surface-1 border-l border-border-subtle shadow-dark-lg animate-drawer-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-1/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="text-sm font-heading font-semibold text-text-primary">Spresso</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-2/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat body — fills remaining space */}
        <div className="flex-1 overflow-hidden">
          <CopilotChat {...chatProps} />
        </div>
      </div>
    </>
  );
}
