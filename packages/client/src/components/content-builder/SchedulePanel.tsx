import { Calendar, Clock, Send, Loader2 } from 'lucide-react';
import { MiniCalendar } from './MiniCalendar';

interface SchedulePanelProps {
  onSchedule: (date: string) => void;
  onPublishNow: () => void;
  isSaving: boolean;
  selectedChannelCount: number;
  allAccountsSelected: boolean;
  flowState?: string;
  scheduleDate: string;
  onScheduleDateChange: (date: string) => void;
  refreshKey?: number;
}

export function SchedulePanel({
  onSchedule,
  onPublishNow,
  isSaving,
  selectedChannelCount,
  allAccountsSelected,
  flowState,
  scheduleDate,
  onScheduleDateChange,
  refreshKey = 0,
}: SchedulePanelProps) {
  const handleSchedule = () => {
    if (!scheduleDate || selectedChannelCount === 0 || !allAccountsSelected) return;
    onSchedule(scheduleDate);
  };

  const isDateInPast = scheduleDate ? new Date(scheduleDate).getTime() < Date.now() : false;
  const canSchedule =
    scheduleDate && !isDateInPast && selectedChannelCount > 0 && allAccountsSelected && !isSaving;
  const canPublish = selectedChannelCount > 0 && allAccountsSelected && !isSaving;

  // Compute a friendly relative date string
  const getRelativeDate = () => {
    if (!scheduleDate) return null;
    const target = new Date(scheduleDate);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs < 0) return 'in the past';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffDays === 0 && diffHours < 1) return 'in less than an hour';
    if (diffDays === 0) return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    if (diffDays === 1) return 'tomorrow';
    return `in ${diffDays} days`;
  };

  const relativeDate = getRelativeDate();

  // Early flow states: show dim placeholder
  if (flowState === 'IDLE' || flowState === 'WRITING') {
    return (
      <div className="space-y-4">
        <div className="bg-surface-2/50 rounded-lg border border-border-subtle p-3 text-center">
          <Calendar className="h-6 w-6 mx-auto text-text-tertiary/30 mb-1.5" />
          <p className="text-[10px] text-text-tertiary">
            Create your content first, then schedule it here.
          </p>
        </div>
        <MiniCalendar onSelectDate={onScheduleDateChange} refreshKey={refreshKey} />
      </div>
    );
  }

  // Determine if the panel should glow
  const isGlowing = flowState === 'ADAPTED' || flowState === 'MEDIA_ADDED' || flowState === 'READY';

  return (
    <div className="space-y-4">
      {/* Schedule controls */}
      <div
        className={`rounded-xl border p-4 space-y-4 transition-all duration-500 ${
          isGlowing
            ? 'border-accent/30 shadow-[0_0_10px_rgba(255,214,10,0.08)]'
            : 'border-border-subtle'
        }`}
      >
        {/* Channel count badge */}
        {selectedChannelCount > 0 && allAccountsSelected ? (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Send className="h-3 w-3 text-accent" />
            Publishing to {selectedChannelCount} account{selectedChannelCount !== 1 ? 's' : ''}
          </div>
        ) : selectedChannelCount > 0 && !allAccountsSelected ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Send className="h-3 w-3 text-amber-400" />
            Select an account for each platform
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="relative">
              <Calendar className="h-8 w-8 text-text-tertiary/30" />
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent/40 animate-ping" />
              <span
                className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full bg-accent/30 animate-ping"
                style={{ animationDelay: '0.5s' }}
              />
              <span
                className="absolute top-1/2 -right-1.5 h-1 w-1 rounded-full bg-accent/25 animate-ping"
                style={{ animationDelay: '1s' }}
              />
            </div>
            <p className="text-xs text-text-tertiary">No platforms selected</p>
          </div>
        )}

        {/* Date/time picker */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <Clock className="h-3.5 w-3.5 text-accent" />
            Schedule Date & Time
          </label>
          <input
            type="datetime-local"
            value={scheduleDate}
            onChange={(e) => onScheduleDateChange(e.target.value)}
            className="w-full bg-surface-3 text-text-primary border border-border-subtle rounded-lg px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-accent/40 focus:shadow-[0_0_12px_rgba(255,214,10,0.08)] transition-all [color-scheme:dark]"
          />
          {relativeDate && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="h-px w-4 bg-accent/50" />
                <span className="h-1.5 w-1.5 rounded-full bg-accent/60" />
              </div>
              <span
                className={`text-[10px] ${relativeDate === 'in the past' ? 'text-red-400' : 'text-text-secondary'}`}
              >
                {relativeDate === 'in the past'
                  ? 'This date is in the past — pick a future date to schedule'
                  : `Your next post is ${relativeDate}`}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {/* Schedule — gradient button */}
          <button
            type="button"
            onClick={handleSchedule}
            disabled={!canSchedule}
            className={`flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent to-amber-600 text-text-inverse px-4 py-2.5 text-sm font-medium hover:from-accent-hover hover:to-amber-500 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none ${canSchedule ? 'shadow-[0_0_15px_rgba(255,214,10,0.2)] hover:shadow-[0_0_20px_rgba(255,214,10,0.3)]' : ''}`}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4" />
            )}
            Schedule
          </button>

          {/* Publish Now — outlined with fill on hover */}
          <button
            type="button"
            onClick={onPublishNow}
            disabled={!canPublish}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-transparent text-accent border border-accent/50 px-4 py-2 text-sm font-medium hover:bg-accent hover:text-text-inverse transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publish Now
          </button>

          {/* Save as Draft lives in the header bar (Ctrl+S) */}
        </div>
      </div>

      {/* Mini Calendar */}
      <MiniCalendar onSelectDate={onScheduleDateChange} refreshKey={refreshKey} />
    </div>
  );
}
