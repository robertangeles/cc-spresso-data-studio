import { useEffect, useRef, useMemo } from 'react';
import { Coffee, PenTool, Search, Lightbulb, BarChart } from 'lucide-react';
import { getRandomGreeting } from '../../lib/greetings';
import { useAuth } from '../../context/AuthContext';

interface ChatEmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  {
    icon: PenTool,
    text: 'Write a blog post about AI governance for enterprise leaders',
    color: 'bg-blue-500/10 text-blue-400',
  },
  {
    icon: Search,
    text: 'Research the latest trends in content marketing for 2026',
    color: 'bg-green-500/10 text-green-400',
  },
  {
    icon: Lightbulb,
    text: 'Brainstorm 10 LinkedIn post ideas for a SaaS founder',
    color: 'bg-amber-500/10 text-amber-400',
  },
  {
    icon: BarChart,
    text: 'Analyze what makes Paul Graham essays so effective',
    color: 'bg-purple-500/10 text-purple-400',
  },
];

// ─── Neural Network Background ───
interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulse: number;
}

function NeuralNetworkBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const nodeCount = 20;
    nodesRef.current = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 1.5 + Math.random() * 1.5,
      pulse: Math.random() * Math.PI * 2,
    }));

    const connectionDist = 140;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const nodes = nodesRef.current;
      const t = Date.now() * 0.001;

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.pulse += 0.02;
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
        node.x = Math.max(0, Math.min(canvas.width, node.x));
        node.y = Math.max(0, Math.min(canvas.height, node.y));
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.2;
            const pulseAlpha = Math.sin(t * 2 + i + j) * 0.5 + 0.5;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255, 214, 10, ${alpha * pulseAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      for (const node of nodes) {
        const glow = Math.sin(node.pulse) * 0.3 + 0.7;
        const r = node.radius * glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 214, 10, ${0.03 * glow})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 214, 10, ${0.35 * glow})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.5 }}
    />
  );
}

// ─── Knight Rider border CSS ───
const knightRiderCSS = `
@keyframes knight-rider {
  0%   { background-position: -200% 0, 0 -200%, 200% 0, 0 200%; }
  25%  { background-position: 200% 0, 0 -200%, 200% 0, 0 200%; }
  50%  { background-position: 200% 0, 0 200%, 200% 0, 0 200%; }
  75%  { background-position: 200% 0, 0 200%, -200% 0, 0 200%; }
  100% { background-position: 200% 0, 0 200%, -200% 0, 0 -200%; }
}
.knight-rider-border {
  position: relative;
}
.knight-rider-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background:
    linear-gradient(90deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) top / 200% 1px no-repeat,
    linear-gradient(180deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) right / 1px 200% no-repeat,
    linear-gradient(270deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) bottom / 200% 1px no-repeat,
    linear-gradient(0deg, transparent 30%, rgba(255,214,10,0.6) 50%, transparent 70%) left / 1px 200% no-repeat;
  animation: knight-rider 4s linear infinite;
  pointer-events: none;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
`;

export function ChatEmptyState({ onSuggestionClick }: ChatEmptyStateProps) {
  const { user } = useAuth();
  const greeting = useMemo(() => getRandomGreeting(), []);
  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <div className="relative flex flex-col items-center justify-center h-full px-4 overflow-hidden">
      <style>{knightRiderCSS}</style>
      <NeuralNetworkBg />

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-dim border border-accent/20 shadow-glow-accent animate-float">
          <Coffee className="h-8 w-8 text-accent" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
          {greeting.text}
          {firstName ? `, ${firstName}.` : '.'}
        </h2>
        <p className="text-xs text-text-tertiary mb-1">
          {greeting.language} — {greeting.country}
        </p>
        <p className="text-sm text-text-tertiary mb-8">Drop an idea. Walk away with content.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
          {suggestions.map((s, i) => (
            <button
              key={s.text}
              type="button"
              onClick={() => onSuggestionClick(s.text)}
              className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-2 p-4 text-left text-sm text-text-secondary transition-all duration-300 ease-spring hover:border-border-hover hover:bg-surface-3 hover:shadow-glow animate-slide-up"
              style={{ animationDelay: `${i * 75}ms`, animationFillMode: 'backwards' }}
            >
              <div className={`shrink-0 rounded-lg p-2 ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <span className="leading-relaxed">{s.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
