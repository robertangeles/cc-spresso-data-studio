import { Boxes } from 'lucide-react';

export function ModelStudioPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-20">
      <div className="relative">
        <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full" aria-hidden="true" />
        <div className="relative p-4 rounded-2xl bg-gradient-to-br from-accent/20 via-accent/5 to-transparent border border-accent/30 shadow-[0_0_24px_rgba(255,214,10,0.15)]">
          <Boxes className="h-8 w-8 text-accent" />
        </div>
      </div>
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">Model Studio</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Data modelling workspace — conceptual, logical, and physical layers aligned to DMBOK.
          Coming soon.
        </p>
      </div>
    </div>
  );
}
