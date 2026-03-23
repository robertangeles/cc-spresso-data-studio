import { useRef, useEffect, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { ChatMessage } from '../components/chat/ChatMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { ChatEmptyState } from '../components/chat/ChatEmptyState';
import { Modal } from '../components/ui/Modal';
import { MessageSquare, Plus, Trash2, PanelRightOpen, PanelRightClose } from 'lucide-react';

export function ChatPage() {
  const {
    conversations,
    activeConversation,
    messages,
    isSending,
    model,
    setModel,
    loadConversation,
    newChat,
    sendMessage,
    deleteConversation,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [imageMode, setImageMode] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content: string) => {
    sendMessage(content);
  };

  // Group conversations by date
  const groupByDate = (convos: typeof conversations) => {
    const groups: Record<string, typeof conversations> = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    for (const c of convos) {
      const date = new Date(c.updatedAt);
      let label: string;
      if (date >= today) label = 'Today';
      else if (date >= yesterday) label = 'Yesterday';
      else if (date >= weekAgo) label = 'This Week';
      else label = 'Older';

      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    }
    return groups;
  };

  const grouped = groupByDate(conversations);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <ChatEmptyState onSuggestionClick={handleSend} />
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {isSending && (
                <div className="flex justify-start mb-4">
                  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '0ms' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '150ms' }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          model={model}
          onModelChange={setModel}
          disabled={isSending}
          imageMode={imageMode}
          onImageModeToggle={() => setImageMode(!imageMode)}
        />
      </div>

      {/* Sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute right-4 top-[4.5rem] z-10 rounded-lg bg-white border border-gray-200 p-1.5 text-gray-400 hover:text-gray-600 shadow-sm"
      >
        {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
      </button>

      {/* History sidebar */}
      {sidebarOpen && (
        <div className="w-72 shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">History</h3>
            <button
              type="button"
              onClick={newChat}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-400">No conversations yet</p>
            ) : (
              Object.entries(grouped).map(([label, convos]) => (
                <div key={label} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  {convos.map((c) => (
                    <div
                      key={c.id}
                      className={`group flex items-center rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors ${
                        activeConversation?.id === c.id
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => loadConversation(c.id)}
                        className="flex-1 flex items-center gap-2 text-left min-w-0"
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate text-xs">{c.title}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(c.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Delete modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Conversation"
        confirmLabel="Delete"
        onConfirm={async () => { if (deleteId) { await deleteConversation(deleteId); setDeleteId(null); } }}
        variant="danger"
      >
        <p>Delete this conversation and all its messages? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
