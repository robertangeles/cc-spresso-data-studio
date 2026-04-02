import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, Eye, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import {
  buildOutputFields,
  resolveFields,
  detectPlatform,
  type MappingTarget,
  type OutputField,
} from '@cc/shared';

// ── Relay key (shared with ContentBuilderPage) ─────────────────────────
export const ORCHESTRATION_RELAY_KEY = 'spresso_orchestration_relay';

export interface OrchestrationRelayPayload {
  title: string;
  mainBody: string;
  imageUrl: string | null;
  platformBodies: Record<string, string>;
  channels: string[];
  orchestrationName: string;
  fieldCount: number;
  timestamp: number;
  remixContext?: {
    sourceItems: Array<{ id: string; title: string; body: string; channelId: string | null }>;
    targetChannelIds: string[];
    style: string;
    customPrompt?: string;
  };
}

// ── Platform color chips ───────────────────────────────────────────────
const PLATFORM_CHIP_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  twitter: { bg: 'bg-sky-400/15', text: 'text-sky-400', label: 'Twitter / X' },
  linkedin: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'LinkedIn' },
  instagram: { bg: 'bg-pink-500/15', text: 'text-pink-400', label: 'Instagram' },
  facebook: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', label: 'Facebook' },
  youtube: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'YouTube' },
  tiktok: { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400', label: 'TikTok' },
  bluesky: { bg: 'bg-sky-500/15', text: 'text-sky-300', label: 'Bluesky' },
  threads: { bg: 'bg-gray-400/15', text: 'text-gray-300', label: 'Threads' },
  newsletter: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Newsletter' },
  blog: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Blog' },
  pinterest: { bg: 'bg-red-400/15', text: 'text-red-300', label: 'Pinterest' },
};

// ── Mapping target options ─────────────────────────────────────────────
const TARGET_OPTIONS: Array<{ value: MappingTarget; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'mainBody', label: 'Main Body' },
  { value: 'imageUrl', label: 'Image URL' },
  { value: 'platform:twitter', label: 'Twitter / X' },
  { value: 'platform:linkedin', label: 'LinkedIn' },
  { value: 'platform:instagram', label: 'Instagram' },
  { value: 'platform:facebook', label: 'Facebook' },
  { value: 'platform:youtube', label: 'YouTube' },
  { value: 'platform:tiktok', label: 'TikTok' },
  { value: 'platform:bluesky', label: 'Bluesky' },
  { value: 'platform:threads', label: 'Threads' },
  { value: 'platform:newsletter', label: 'Newsletter' },
  { value: 'platform:blog', label: 'Blog' },
  { value: 'skip', label: 'Skip' },
];

// ── Props ──────────────────────────────────────────────────────────────

interface OutputPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Array<{ stepIndex: number; skillName: string; outputs: Record<string, string> }>;
  orchestrationName: string;
}

// ── Internal field state ───────────────────────────────────────────────

interface FieldState {
  field: OutputField;
  checked: boolean;
  target: MappingTarget;
}

// ── Component ──────────────────────────────────────────────────────────

export function OutputPickerModal({
  isOpen,
  onClose,
  steps,
  orchestrationName,
}: OutputPickerModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Build field state from smart mapping, reset when steps change
  const [fieldStates, setFieldStates] = useState<FieldState[]>([]);

  useEffect(() => {
    const fields = buildOutputFields(steps);
    setFieldStates(
      fields.map((f) => ({
        field: f,
        checked: f.suggestedTarget !== 'skip',
        target: f.suggestedTarget,
      })),
    );
  }, [steps]);

  const toggleField = useCallback((index: number) => {
    setFieldStates((prev) =>
      prev.map((fs, i) => (i === index ? { ...fs, checked: !fs.checked } : fs)),
    );
  }, []);

  const setTarget = useCallback((index: number, target: MappingTarget) => {
    setFieldStates((prev) =>
      prev.map((fs, i) => (i === index ? { ...fs, target, checked: target !== 'skip' } : fs)),
    );
  }, []);

  // Resolve current selections into preview
  const preview = useMemo(() => {
    const selected = fieldStates.filter((fs) => fs.checked);
    return resolveFields(
      selected.map((fs) => ({ key: fs.field.key, value: fs.field.value, target: fs.target })),
    );
  }, [fieldStates]);

  const selectedCount = fieldStates.filter((fs) => fs.checked).length;

  // Derive which channels will be pre-selected
  const preSelectedChannels = useMemo(() => {
    return Object.keys(preview.platformBodies);
  }, [preview.platformBodies]);

  // Group fields by step
  const groupedByStep = useMemo(() => {
    const groups: Map<
      number,
      { skillName: string; fields: Array<FieldState & { globalIndex: number }> }
    > = new Map();
    fieldStates.forEach((fs, globalIndex) => {
      const existing = groups.get(fs.field.stepIndex);
      if (existing) {
        existing.fields.push({ ...fs, globalIndex });
      } else {
        groups.set(fs.field.stepIndex, {
          skillName: fs.field.skillName,
          fields: [{ ...fs, globalIndex }],
        });
      }
    });
    return groups;
  }, [fieldStates]);

  const handleSend = useCallback(() => {
    const channels = preSelectedChannels;
    const payload: OrchestrationRelayPayload = {
      title: preview.title ?? '',
      mainBody: preview.mainBody ?? '',
      imageUrl: preview.imageUrl ?? null,
      platformBodies: preview.platformBodies,
      channels,
      orchestrationName,
      fieldCount: selectedCount,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(ORCHESTRATION_RELAY_KEY, JSON.stringify(payload));
    } catch {
      toast('Storage full — clear browser data and try again', 'error');
      return;
    }

    onClose();
    navigate('/content?from=orchestration');
  }, [preview, preSelectedChannels, orchestrationName, selectedCount, onClose, navigate, toast]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border-subtle bg-surface-2 shadow-dark-lg animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Send className="h-4 w-4 text-accent" />
              Send to Content Studio
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              Select outputs and map them to editor fields
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-3 hover:text-text-secondary transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Field selection */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 border-r border-border-subtle">
            {Array.from(groupedByStep.entries()).map(([stepIndex, { skillName, fields }]) => (
              <div key={stepIndex}>
                <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                  Step {stepIndex + 1}: {skillName}
                </h4>
                <div className="space-y-2">
                  {fields.map(({ globalIndex, field, checked, target }) => {
                    const platform = detectPlatform(field.key);
                    const chipColor = platform ? PLATFORM_CHIP_COLORS[platform] : null;

                    return (
                      <div
                        key={globalIndex}
                        className={`rounded-lg border p-3 transition-all ${
                          checked
                            ? 'border-accent/30 bg-accent/5'
                            : 'border-border-subtle bg-surface-3/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <label className="flex items-center mt-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleField(globalIndex)}
                              className="h-4 w-4 rounded border-border-default bg-surface-3 text-accent focus:ring-accent/30 cursor-pointer"
                            />
                          </label>

                          {/* Field info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-text-primary font-mono">
                                {field.key}
                              </span>
                              {chipColor && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${chipColor.bg} ${chipColor.text}`}
                                >
                                  {chipColor.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-tertiary line-clamp-2 break-all">
                              {field.value.slice(0, 150)}
                              {field.value.length > 150 && '...'}
                            </p>
                          </div>

                          {/* Target dropdown */}
                          <div className="relative shrink-0">
                            <select
                              value={target}
                              onChange={(e) =>
                                setTarget(globalIndex, e.target.value as MappingTarget)
                              }
                              className="appearance-none rounded-lg border border-border-default bg-surface-3 pl-3 pr-7 py-1.5 text-xs text-text-secondary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 cursor-pointer"
                            >
                              {TARGET_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-tertiary" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {fieldStates.length === 0 && (
              <div className="flex items-center justify-center py-12 text-sm text-text-tertiary">
                No outputs available to send.
              </div>
            )}
          </div>

          {/* Right: Live preview */}
          <div className="w-64 shrink-0 overflow-y-auto p-4 space-y-3">
            <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="h-3 w-3" />
              Preview
            </h4>

            {selectedCount === 0 ? (
              <p className="text-xs text-text-tertiary italic">Select outputs to see a preview.</p>
            ) : (
              <>
                {/* Title preview */}
                {preview.title && (
                  <div>
                    <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                      Title
                    </span>
                    <p className="mt-0.5 text-sm text-text-primary font-medium line-clamp-2">
                      {preview.title}
                    </p>
                  </div>
                )}

                {/* Body preview */}
                {preview.mainBody && (
                  <div>
                    <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                      Main Body
                    </span>
                    <p className="mt-0.5 text-xs text-text-secondary line-clamp-4">
                      {preview.mainBody.slice(0, 200)}
                      {preview.mainBody.length > 200 && '...'}
                    </p>
                    <span className="text-[10px] text-text-tertiary">
                      {preview.mainBody.length.toLocaleString()} chars
                    </span>
                  </div>
                )}

                {/* Image preview */}
                {preview.imageUrl && (
                  <div>
                    <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                      Image
                    </span>
                    <p className="mt-0.5 text-xs text-text-tertiary truncate">{preview.imageUrl}</p>
                  </div>
                )}

                {/* Platform bodies */}
                {Object.keys(preview.platformBodies).length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                      Platforms
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.keys(preview.platformBodies).map((slug) => {
                        const chip = PLATFORM_CHIP_COLORS[slug];
                        return (
                          <span
                            key={slug}
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              chip ? `${chip.bg} ${chip.text}` : 'bg-surface-3 text-text-tertiary'
                            }`}
                          >
                            {chip?.label ?? slug}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-lg border border-border-subtle bg-surface-3/50 px-3 py-2">
                  <p className="text-[10px] text-text-tertiary">
                    {selectedCount} field{selectedCount !== 1 ? 's' : ''} selected
                    {preSelectedChannels.length > 0 &&
                      ` · ${preSelectedChannels.length} platform${preSelectedChannels.length !== 1 ? 's' : ''} pre-selected`}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
          <p className="text-xs text-text-tertiary">
            From <span className="font-medium text-text-secondary">{orchestrationName}</span>
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={selectedCount === 0}
              className="gap-2 bg-gradient-to-r from-accent to-amber-600 hover:shadow-glow-accent"
            >
              <Send className="h-3.5 w-3.5" />
              Send to Studio
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { PLATFORM_CHIP_COLORS };
