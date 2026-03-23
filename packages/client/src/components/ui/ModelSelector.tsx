import { useState, useRef, useEffect } from 'react';
import { useConfiguredModels } from '../../hooks/useConfiguredModels';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  allowAuto?: boolean;
}

export function ModelSelector({ value, onChange, allowAuto = false }: ModelSelectorProps) {
  const { models } = useConfiguredModels();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = models.find((m) => m.model === value);
  const displayText = selected ? `${selected.icon} ${selected.displayName}` : allowAuto ? 'Auto (use flow\'s model)' : 'Select a model';

  // Group models by provider
  const grouped = models.reduce<Record<string, typeof models>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  if (models.length === 0) {
    return (
      <p className="text-xs text-amber-600">
        No models configured. Add API keys in Settings.
      </p>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-left hover:border-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        <span>{displayText}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {allowAuto && (
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className={`flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50 ${!value ? 'bg-brand-50' : ''}`}
            >
              <div>
                <p className="font-medium text-gray-900">Auto</p>
                <p className="text-xs text-gray-500">Use flow's model selection</p>
              </div>
            </button>
          )}

          {Object.entries(grouped).map(([provider, providerModels]) => (
            <div key={provider}>
              <p className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
                {provider}
              </p>
              {providerModels.map((m) => (
                <button
                  key={m.model}
                  type="button"
                  onClick={() => { onChange(m.model); setIsOpen(false); }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${value === m.model ? 'bg-brand-50' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {m.icon} {m.displayName}
                    </p>
                    {m.description && (
                      <p className="text-xs text-gray-500">{m.description}</p>
                    )}
                  </div>
                  {value === m.model && (
                    <svg className="h-4 w-4 text-brand-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
