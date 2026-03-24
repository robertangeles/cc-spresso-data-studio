import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  allowAuto?: boolean;
  compact?: boolean;
}

export function ModelSelector({ value, onChange, allowAuto = false, compact = false }: ModelSelectorProps) {
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
    return <p className="text-xs text-amber-600">No models. Add keys in Settings.</p>;
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={compact
          ? 'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors'
          : 'flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-left hover:border-gray-400 focus:border-brand-500 focus:outline-none'
        }
      >
        <span>{compact ? displayName : `${selected?.icon ?? ''} ${displayName}`}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute z-50 ${compact ? 'bottom-full mb-2 left-0' : 'mt-1 w-full'} min-w-[280px] max-h-[400px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl`}>
          {allowAuto && (
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${!value ? 'bg-brand-50' : ''}`}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">Auto</p>
                <p className="text-[11px] text-gray-400">Best available model</p>
              </div>
              {!value && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          )}

          {Object.entries(grouped).map(([provider, providerModels]) => (
            <div key={provider}>
              {/* Provider header — clickable to collapse */}
              <button
                type="button"
                onClick={() => toggleProvider(provider)}
                className="flex w-full items-center gap-1.5 px-3 pt-2.5 pb-1 text-left hover:bg-gray-50"
              >
                {collapsed[provider]
                  ? <ChevronRight className="h-3 w-3 text-gray-400" />
                  : <ChevronDown className="h-3 w-3 text-gray-400" />
                }
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  {provider}
                </span>
                <span className="text-[10px] text-gray-300 ml-1">{providerModels.length}</span>
              </button>

              {/* Models — collapsible */}
              {!collapsed[provider] && providerModels.map((m) => (
                <button
                  key={m.model}
                  type="button"
                  onClick={() => { onChange(m.model); setIsOpen(false); }}
                  className={`flex w-full items-center justify-between px-3 pl-7 py-1.5 text-left hover:bg-gray-50 transition-colors ${value === m.model ? 'bg-brand-50' : ''}`}
                >
                  <div>
                    <p className="text-[13px] font-medium text-gray-900">{m.displayName}</p>
                    {m.description && (
                      <p className="text-[10px] text-gray-400">{m.description}</p>
                    )}
                  </div>
                  {value === m.model && <Check className="h-3.5 w-3.5 text-brand-600" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
