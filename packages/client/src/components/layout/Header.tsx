import { Rocket } from 'lucide-react';

export function Header() {
  return (
    <header className="flex h-14 items-center border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 text-brand-600" />
        <h1 className="text-lg font-bold text-brand-700">Content Pilot</h1>
      </div>
    </header>
  );
}
