import { useEffect, useState } from 'react';
import { Rocket } from 'lucide-react';

interface ScheduleCelebrationProps {
  postCount: number;
  platformCount: number;
  platformIcons: string[];
  scheduledDate: string;
  onDismiss: () => void;
}

/** Generate confetti pieces with random properties */
function ConfettiPieces() {
  const colors = ['#FFD60A', '#22C55E', '#3B82F6', '#EC4899', '#F59E0B', '#8B5CF6', '#06B6D4'];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 3,
    color: colors[i % colors.length],
    size: 4 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            borderRadius: '1px',
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s both`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function ScheduleCelebration({
  postCount,
  platformCount,
  platformIcons,
  scheduledDate,
  onDismiss,
}: ScheduleCelebrationProps) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade-out
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // Format the date nicely
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dayStr = date.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

      if (diffDays === 0) return `today at ${timeStr}`;
      if (diffDays === 1) return `tomorrow at ${timeStr}`;
      return `${dayStr} at ${timeStr}`;
    } catch {
      return 'soon';
    }
  };

  return (
    <>
      <ConfettiPieces />

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[55] transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(12px)' }}
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}
      >
        {/* Center content */}
        <div className="flex items-center justify-center h-full">
          <div
            className={`celebration-enter flex flex-col items-center text-center px-8 py-10 max-w-md transition-opacity duration-300 ${
              visible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Rocket icon with glow */}
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-accent to-amber-600 flex items-center justify-center shadow-[0_0_40px_rgba(255,214,10,0.3)]">
                <Rocket className="h-8 w-8 text-text-inverse" />
              </div>
              <div
                className="absolute inset-0 rounded-2xl bg-accent/20 animate-ping"
                style={{ animationDuration: '2s' }}
              />
            </div>

            {/* Platform icons row */}
            <div className="flex items-center gap-3 mb-5">
              {platformIcons.map((icon, i) => (
                <span
                  key={i}
                  className="text-2xl animate-slide-up"
                  style={{ animationDelay: `${200 + i * 100}ms`, animationFillMode: 'both' }}
                >
                  {icon}
                </span>
              ))}
            </div>

            {/* Main message */}
            <h2 className="text-2xl font-display text-text-primary mb-2 tracking-tight">
              Content Scheduled!
            </h2>
            <p className="text-lg font-heading font-semibold text-accent mb-1">
              {postCount} post{postCount !== 1 ? 's' : ''} across {platformCount} platform
              {platformCount !== 1 ? 's' : ''}
            </p>
            <p className="text-sm text-text-secondary">Going live {formatDate(scheduledDate)}</p>

            {/* Dismiss hint */}
            <p className="text-[10px] text-text-tertiary/40 mt-6">Click anywhere to dismiss</p>
          </div>
        </div>
      </div>
    </>
  );
}
