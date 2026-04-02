import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  allowAuto?: boolean;
  compact?: boolean;
}

export function ModelSelector({
  value,
  onChange,
  allowAuto = false,
  compact = false,
}: ModelSelectorProps) {
  const { models } = useConfiguredModels();
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = models.find((m) => m.model === value);
  const displayName = selected?.displayName ?? (allowAuto ? 'Auto' : 'Select model');

  // Group by provider
  const grouped = models.reduce<Record<string, typeof models>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  const toggleProvider = (provider: string) => {
    setCollapsed((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  if (models.length === 0) {
    return <p className="text-xs text-amber-400">No models. Add keys in Settings.</p>;
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={
          compact
            ? 'inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 hover:border-accent/60 hover:shadow-[0_0_12px_rgba(255,214,10,0.12)] transition-all duration-200'
            : 'flex w-full items-center justify-between rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-left text-text-primary hover:border-border-default focus:border-accent focus:outline-none'
        }
      >
        <span>{compact ? displayName : `${selected?.icon ?? ''} ${displayName}`}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 ${compact ? 'text-accent/60' : 'text-text-tertiary'} transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 ${compact ? 'bottom-full mb-2 right-0' : 'mt-1 w-full'} min-w-[280px] max-h-[400px] overflow-y-auto rounded-xl border border-border-hover bg-surface-3 py-1 shadow-dark-lg backdrop-blur-glass`}
        >
          {allowAuto && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${!value ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-surface-4 border-l-2 border-transparent'}`}
            >
              <div>
                <p
                  className={`text-sm font-medium ${!value ? 'text-accent' : 'text-text-primary'}`}
                >
                  Auto
                </p>
                <p className="text-[11px] text-text-secondary">Best available model</p>
              </div>
              {!value && <Check className="h-4 w-4 text-accent" />}
            </button>
          )}

          {Object.entries(grouped).map(([provider, providerModels]) => (
            <div key={provider}>
              {/* Provider header — clickable to collapse */}
              <button
                type="button"
                onClick={() => toggleProvider(provider)}
                className="flex w-full items-center gap-1.5 px-3 pt-3 pb-1.5 text-left hover:bg-surface-4"
              >
                {collapsed[provider] ? (
                  <ChevronRight className="h-3 w-3 text-text-tertiary" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-text-tertiary" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  {provider}
                </span>
                <span className="text-[10px] text-text-tertiary ml-1">{providerModels.length}</span>
              </button>

              {/* Models — collapsible */}
              {!collapsed[provider] &&
                providerModels.map((m) => (
                  <button
                    key={m.model}
                    type="button"
                    onClick={() => {
                      onChange(m.model);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 pl-7 py-2 text-left transition-colors ${value === m.model ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-surface-4 border-l-2 border-transparent'}`}
                  >
                    <div>
                      <p
                        className={`text-[13px] font-medium ${value === m.model ? 'text-accent' : 'text-text-primary'}`}
                      >
                        {m.displayName}
                      </p>
                      {m.description && (
                        <p className="text-[11px] text-text-secondary">{m.description}</p>
                      )}
                    </div>
                    {value === m.model && <Check className="h-3.5 w-3.5 text-accent" />}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
