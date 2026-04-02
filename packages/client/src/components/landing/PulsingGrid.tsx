import { useEffect, useRef } from 'react';

interface PulsingGridProps {
  className?: string;
  opacity?: number;
  centerY?: number;
}

export function PulsingGrid({ className = '', opacity = 0.7, centerY = 0.38 }: PulsingGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pause when offscreen for performance
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(canvas);

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const spacing = 32;
    const dotBase = 1.2;

    const draw = () => {
      if (!visibleRef.current) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const t = Date.now() * 0.001;
      const cx = canvas.width / 2;
      const cy = canvas.height * centerY;

      const cols = Math.ceil(canvas.width / spacing) + 1;
      const rows = Math.ceil(canvas.height / spacing) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * spacing;
          const y = row * spacing;

          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const wave1 = Math.sin(dist * 0.02 - t * 2.5) * 0.5 + 0.5;
          const wave2 = Math.sin(dist * 0.015 - t * 1.8 + 1.5) * 0.5 + 0.5;
          const wave = wave1 * 0.7 + wave2 * 0.3;

          const maxDist = Math.sqrt(cx * cx + cy * cy);
          const edgeFade = 1 - Math.min(dist / maxDist, 1);

          const alpha = wave * edgeFade * 0.4;
          const radius = dotBase + wave * edgeFade * 1.8;

          if (alpha > 0.05) {
            ctx.beginPath();
            ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 214, 10, ${alpha * 0.15})`;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 214, 10, ${0.08 + alpha * 0.5})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, [centerY]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ opacity }}
    />
  );
}
