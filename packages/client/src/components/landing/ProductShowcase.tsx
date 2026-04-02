import { useState, useEffect, useRef } from 'react';
import { Pencil, Zap, Send, Check } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';

const TYPED_TEXT = '5 productivity tips that changed how I work remotely';

const PLATFORM_CARDS = [
  {
    name: 'Twitter',
    color: '#1DA1F2',
    emoji: '𝕏',
    text: '5 remote work tips that actually changed my daily routine (thread) 🧵',
    meta: '187/280',
  },
  {
    name: 'LinkedIn',
    color: '#0A66C2',
    emoji: 'in',
    text: "I've been working remotely for 3 years. Here are the 5 biggest productivity shifts that made all the difference...",
    meta: '312/3000',
  },
  {
    name: 'Instagram',
    color: '#E4405F',
    emoji: '📸',
    text: "Remote work isn't just about where you sit ✨\n\nHere are 5 things I changed that made ALL the difference 👇",
    meta: '142/2200',
  },
  {
    name: 'TikTok',
    color: '#00F2EA',
    emoji: '🎵',
    text: 'Hook: Stop doing these 5 things when working from home... #remotework #productivity',
    meta: '88/150',
  },
  {
    name: 'Blog',
    color: '#10B981',
    emoji: '📝',
    text: 'The remote revolution promised freedom but delivered distraction for many. After three years of trial and error...',
    meta: '~800 words',
  },
  {
    name: 'Email',
    color: '#8B5CF6',
    emoji: '✉️',
    text: 'Subject: 5 remote work tips I wish I knew 3 years ago\nPreview: These small changes had the biggest impact...',
    meta: 'Newsletter',
  },
];

const STEPS = [
  { icon: Pencil, label: 'Write', color: 'text-blue-400' },
  { icon: Zap, label: 'Adapt', color: 'text-accent' },
  { icon: Send, label: 'Publish', color: 'text-emerald-400' },
];

export function ProductShowcase() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  const [activeStep, setActiveStep] = useState(-1);
  const [typedLength, setTypedLength] = useState(0);
  const [showCards, setShowCards] = useState(false);
  const [publishedCards, setPublishedCards] = useState<Set<number>>(new Set());
  const [showPublishBtn, setShowPublishBtn] = useState(false);
  const hasStarted = useRef(false);

  // Animation sequence triggered by scroll visibility
  useEffect(() => {
    if (!isVisible || hasStarted.current) return;
    hasStarted.current = true;

    // Step 1: Write — start typing
    const t1 = setTimeout(() => setActiveStep(0), 300);

    // Type out text character by character
    let charIndex = 0;
    const typeInterval = setInterval(() => {
      charIndex++;
      setTypedLength(charIndex);
      if (charIndex >= TYPED_TEXT.length) {
        clearInterval(typeInterval);

        // Step 2: Adapt — show platform cards
        setTimeout(() => {
          setActiveStep(1);
          setTimeout(() => setShowCards(true), 400);

          // Step 3: Publish
          setTimeout(() => {
            setShowPublishBtn(true);
            setTimeout(() => {
              setActiveStep(2);
              // Stagger check marks
              PLATFORM_CARDS.forEach((_, i) => {
                setTimeout(() => {
                  setPublishedCards((prev) => new Set([...prev, i]));
                }, i * 150);
              });
            }, 800);
          }, 2500);
        }, 600);
      }
    }, 35);

    return () => {
      clearTimeout(t1);
      clearInterval(typeInterval);
    };
  }, [isVisible]);

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,214,10,0.03)_0%,transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        {/* Section header */}
        <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="font-display text-4xl md:text-5xl tracking-tight text-text-primary">
            See it in action
          </h2>
          <p className="mt-4 text-lg text-text-secondary font-heading max-w-2xl mx-auto">
            Write once. Watch it transform into platform-perfect content — then publish everywhere.
          </p>
        </div>

        {/* Step indicators */}
        <div
          className={`flex items-center justify-center gap-0 mb-14 scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '200ms' }}
        >
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full border transition-all duration-500 ${
                  activeStep >= i
                    ? 'border-accent/30 bg-accent-dim/30 shadow-glow'
                    : 'border-border-subtle bg-surface-2/50'
                }`}
              >
                <step.icon
                  className={`h-4 w-4 transition-colors duration-500 ${
                    activeStep >= i ? step.color : 'text-text-tertiary'
                  }`}
                />
                <span
                  className={`text-sm font-medium transition-colors duration-500 ${
                    activeStep >= i ? 'text-text-primary' : 'text-text-tertiary'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-12 h-px mx-1 relative overflow-hidden">
                  <div className="absolute inset-0 bg-border-subtle" />
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent to-amber-500 transition-all duration-700"
                    style={{ width: activeStep > i ? '100%' : '0%' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Editor card */}
        <div
          className={`max-w-2xl mx-auto scroll-reveal ${isVisible ? 'visible' : ''}`}
          style={{ transitionDelay: '300ms' }}
        >
          <div
            className={`editor-surface rounded-2xl p-6 transition-all duration-700 ${
              activeStep >= 1 ? 'shadow-[0_0_60px_-12px_rgba(255,214,10,0.15)]' : ''
            }`}
          >
            {/* Editor chrome */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/50" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
              </div>
              <span className="ml-3 text-[10px] text-text-tertiary font-mono">
                spresso — content editor
              </span>
            </div>

            {/* Typed text */}
            <div className="min-h-[3rem] py-2">
              <p
                className={`text-lg text-text-primary font-editor leading-relaxed ${
                  typedLength < TYPED_TEXT.length && activeStep >= 0 ? 'typing-cursor' : ''
                }`}
              >
                {TYPED_TEXT.slice(0, typedLength)}
              </p>
              {typedLength === 0 && activeStep < 0 && (
                <p className="text-lg text-text-tertiary/30 font-editor">Start writing...</p>
              )}
            </div>

            {/* Shimmer overlay during adapt */}
            {activeStep === 1 && !showCards && (
              <div className="absolute inset-0 rounded-2xl animate-shimmer pointer-events-none" />
            )}
          </div>
        </div>

        {/* Platform cards grid */}
        <div
          className={`mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto transition-all duration-700 ${
            showCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
          }`}
        >
          {PLATFORM_CARDS.map((card, i) => (
            <div
              key={card.name}
              className="relative group rounded-xl border border-border-subtle bg-surface-2/80 backdrop-blur-sm p-4 hover:-translate-y-1 hover:shadow-dark-lg transition-all duration-300"
              style={{
                transitionDelay: showCards ? `${i * 80}ms` : '0ms',
                opacity: showCards ? 1 : 0,
                transform: showCards ? 'translateY(0)' : 'translateY(16px)',
                boxShadow: `0 0 30px -8px ${card.color}15`,
              }}
            >
              {/* Platform header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center text-[11px] font-bold"
                    style={{ backgroundColor: `${card.color}20`, color: card.color }}
                  >
                    {card.emoji}
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{card.name}</span>
                </div>
                <span className="text-[10px] font-mono text-text-tertiary">{card.meta}</span>
              </div>

              {/* Content preview */}
              <p className="text-xs text-text-secondary leading-relaxed line-clamp-3 whitespace-pre-line">
                {card.text}
              </p>

              {/* Published checkmark */}
              {publishedCards.has(i) && (
                <div className="absolute top-3 right-3 animate-check-pop">
                  <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </div>
                </div>
              )}

              {/* Platform color glow bar at bottom */}
              <div
                className="absolute bottom-0 left-4 right-4 h-px opacity-30"
                style={{
                  background: `linear-gradient(to right, transparent, ${card.color}, transparent)`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Publish button */}
        <div
          className={`mt-8 text-center transition-all duration-500 ${
            showPublishBtn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <div
            className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-500 ${
              activeStep >= 2
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-gradient-to-r from-accent to-amber-500 text-text-inverse hover:shadow-glow-strong'
            }`}
          >
            {activeStep >= 2 ? (
              <>
                <Check className="h-4 w-4" />
                Published to {PLATFORM_CARDS.length} platforms
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Publish All
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
