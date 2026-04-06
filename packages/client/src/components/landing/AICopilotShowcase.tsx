import { useState, useEffect, useRef } from 'react';
import { Bot, User, Sparkles } from 'lucide-react';
import { useScrollReveal } from './useScrollReveal';

const CHAT_MESSAGES = [
  {
    role: 'user' as const,
    text: 'Make this more engaging for LinkedIn',
    delay: 500,
  },
  {
    role: 'ai' as const,
    text: 'I\'ve been working remotely for 3 years, and these 5 shifts transformed my productivity:\n\n1. Time-blocking deep work (not just meetings)\n2. The "2-minute rule" for async comms\n3. Dedicated shutdown ritual at 5pm\n4. Weekly energy audits\n5. Building in public\n\nWhich one resonates most? Drop a comment 👇\n\n#RemoteWork #Productivity #FutureOfWork',
    delay: 1800,
  },
  {
    role: 'user' as const,
    text: 'Now give me a punchy Twitter hook',
    delay: 1200,
  },
  {
    role: 'ai' as const,
    text: "I wasted my first year working remotely.\n\nThen I changed 5 small things and got more done in 4 hours than I used to in 8.\n\nHere's the playbook 🧵",
    delay: 1500,
  },
];

const FEATURES = [
  {
    title: 'Adapt one idea for multiple channels',
    desc: 'Each platform gets content shaped for its audience and format',
  },
  {
    title: 'Guided workflow, not prompt chaos',
    desc: 'Tell it what you want in plain language — no prompt crafting required',
  },
  {
    title: 'Reduce repetitive rewriting',
    desc: 'Stop manually reworking the same idea for every platform',
  },
  {
    title: 'Start simple, customize later',
    desc: 'Get results immediately, fine-tune your process as you grow',
  },
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-accent/60"
          style={{
            animation: 'bounce-dots 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
    </div>
  );
}

export function AICopilotShowcase() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  const [visibleMessages, setVisibleMessages] = useState<number[]>([]);
  const [typingIndex, setTypingIndex] = useState(-1);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!isVisible || hasStarted.current) return;
    hasStarted.current = true;

    let totalDelay = 400;

    CHAT_MESSAGES.forEach((msg, i) => {
      // Show typing indicator for AI messages
      if (msg.role === 'ai') {
        setTimeout(() => setTypingIndex(i), totalDelay);
        totalDelay += 1200; // typing duration
      }

      setTimeout(() => {
        setTypingIndex(-1);
        setVisibleMessages((prev) => [...prev, i]);
      }, totalDelay);

      totalDelay += msg.delay;
    });
  }, [isVisible]);

  return (
    <section ref={ref} className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(255,214,10,0.03)_0%,transparent_60%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Mock chat */}
          <div className={`scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="ai-bar rounded-2xl p-5 max-w-md mx-auto lg:mx-0">
              {/* Chat header */}
              <div className="flex items-center gap-2 pb-4 mb-4 border-b border-border-subtle">
                <div className="h-7 w-7 rounded-lg bg-accent-dim flex items-center justify-center">
                  <Bot className="h-4 w-4 text-accent" />
                </div>
                <span className="text-sm font-semibold text-text-primary">Spresso Copilot</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-ring" />
                  <span className="text-[10px] text-text-tertiary">Online</span>
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-3 min-h-[280px]">
                {CHAT_MESSAGES.map((msg, i) => {
                  if (!visibleMessages.includes(i) && typingIndex !== i) return null;

                  if (typingIndex === i && !visibleMessages.includes(i)) {
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <div className="h-6 w-6 rounded-md bg-accent-dim flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-3 w-3 text-accent" />
                        </div>
                        <div className="rounded-xl rounded-tl-sm bg-surface-3/80 border border-border-subtle">
                          <TypingDots />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 animate-slide-up ${
                        msg.role === 'user' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <div
                        className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                          msg.role === 'user' ? 'bg-surface-4' : 'bg-accent-dim'
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <User className="h-3 w-3 text-text-secondary" />
                        ) : (
                          <Bot className="h-3 w-3 text-accent" />
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          msg.role === 'user'
                            ? 'rounded-tr-sm bg-accent/15 text-text-primary border border-accent/10'
                            : 'rounded-tl-sm bg-surface-3/80 text-text-secondary border border-border-subtle'
                        }`}
                      >
                        <p className="whitespace-pre-line">{msg.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input bar */}
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-2/80 border border-border-subtle px-3 py-2.5">
                <Sparkles className="h-3.5 w-3.5 text-accent/50 shrink-0" />
                <span className="text-xs text-text-tertiary">Ask Copilot anything...</span>
              </div>
            </div>
          </div>

          {/* Right — Copy */}
          <div
            className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
            style={{ transitionDelay: '200ms' }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-dim/50 px-4 py-1.5 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold tracking-wide text-accent uppercase">
                AI Copilot
              </span>
            </div>

            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl tracking-tight text-text-primary leading-tight">
              Your writing partner that{' '}
              <span className="text-gradient-amber">gets every platform</span>
            </h2>

            <p className="mt-4 text-text-secondary text-lg font-heading leading-relaxed">
              Have a conversation with AI that understands the nuances of each platform. Just tell
              it what you want — Spresso handles the adaptation.
            </p>

            {/* Feature bullets */}
            <div className="mt-8 space-y-4">
              {FEATURES.map((feat, i) => (
                <div
                  key={feat.title}
                  className={`flex items-start gap-3 scroll-reveal ${isVisible ? 'visible' : ''}`}
                  style={{ transitionDelay: `${400 + i * 100}ms` }}
                >
                  <div className="mt-1 h-5 w-5 rounded-md bg-accent-dim flex items-center justify-center shrink-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{feat.title}</p>
                    <p className="text-sm text-text-tertiary mt-0.5">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
