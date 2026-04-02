import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { api } from '../../lib/api';

interface RemixStyle {
  slug: string;
  name: string;
  description: string;
}

interface StylePickerProps {
  selected: string;
  onSelect: (slug: string) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
}

const STYLE_ICONS: Record<string, string> = {
  'remix-punchy': '⚡',
  'remix-storytelling': '📖',
  'remix-takeaways': '🎯',
  'remix-hot-take': '🔥',
  'remix-thread': '🧵',
  'remix-recap': '📋',
};

export function StylePicker({
  selected,
  onSelect,
  customPrompt,
  onCustomPromptChange,
}: StylePickerProps) {
  const [styles, setStyles] = useState<RemixStyle[]>([]);
  const [showCustom, setShowCustom] = useState(selected === 'custom');

  useEffect(() => {
    api
      .get('/system-prompts?category=remix')
      .then(({ data }) => setStyles(data.data ?? []))
      .catch(() => setStyles([]));
  }, []);

  return (
    <div>
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
        Remix Style
      </span>

      {/* Style preset chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {styles.map((style) => {
          const isActive = selected === style.slug;
          return (
            <button
              key={style.slug}
              type="button"
              onClick={() => {
                onSelect(style.slug);
                setShowCustom(false);
              }}
              className={`group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-spring
                ${
                  isActive
                    ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_12px_rgba(255,214,10,0.1)]'
                    : 'border-border-subtle bg-surface-2/50 text-text-secondary hover:border-border-hover hover:text-text-primary'
                }`}
              title={style.description}
            >
              <span className="text-sm">{STYLE_ICONS[style.slug] ?? '✨'}</span>
              {style.name}
            </button>
          );
        })}

        {/* Custom option */}
        <button
          type="button"
          onClick={() => {
            onSelect('custom');
            setShowCustom(true);
          }}
          className={`group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-spring
            ${
              selected === 'custom'
                ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_12px_rgba(255,214,10,0.1)]'
                : 'border-border-subtle bg-surface-2/50 text-text-secondary hover:border-border-hover hover:text-text-primary'
            }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Custom
        </button>
      </div>

      {/* Advanced: custom prompt */}
      {!showCustom && selected !== 'custom' && (
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
          Add custom instructions
        </button>
      )}

      {(showCustom || selected === 'custom') && (
        <div className="animate-slide-up">
          <textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder={
              selected === 'custom'
                ? 'Describe how you want the content remixed...'
                : 'Optional: add extra instructions on top of the selected style...'
            }
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-border-default bg-surface-2/60 backdrop-blur-sm px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none transition-all duration-200"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-text-tertiary">
              {selected === 'custom' ? 'Required' : 'Optional — supplements the selected style'}
            </span>
            <span className="text-[10px] text-text-tertiary tabular-nums">
              {customPrompt.length}/2000
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
