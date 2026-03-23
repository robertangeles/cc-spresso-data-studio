import { useState } from 'react';
import type { Skill } from '@cc/shared';
import { useSkills } from '../hooks/useSkills';
import { useAuth } from '../context/AuthContext';
import { SkillCard } from '../components/skills/SkillCard';
import { SkillDetail } from '../components/skills/SkillDetail';
import { SkillImporter } from '../components/skills/SkillImporter';
import { Button } from '../components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Zap } from 'lucide-react';

const categories = [
  { value: '', label: 'All' },
  { value: 'repurpose', label: 'Repurpose' },
  { value: 'generate', label: 'Generate' },
  { value: 'research', label: 'Research' },
  { value: 'transform', label: 'Transform' },
  { value: 'extract', label: 'Extract' },
  { value: 'plan', label: 'Plan' },
];

export function SkillsCatalogPage() {
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const canEditSkill = (skill: Skill) =>
    user?.role === 'administrator' || (skill.userId === user?.id && skill.source !== 'builtin');

  const { skills, isLoading, refresh } = useSkills({
    category: category || undefined,
    search: search || undefined,
  });

  if (showImporter) {
    return (
      <SkillImporter
        onClose={() => setShowImporter(false)}
        onImported={() => { setShowImporter(false); refresh(); }}
      />
    );
  }

  if (selectedSkill) {
    return (
      <SkillDetail
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
        canEdit={canEditSkill(selectedSkill)}
        onEdit={() => navigate(`/skills/${selectedSkill.id}/edit`)}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Skills</h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse and use AI-powered skills to build your content workflows.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/skills/create">
            <Button size="sm">Create Skill</Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={() => setShowImporter(true)}>
            Import from GitHub
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        />
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === cat.value
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : skills.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onClick={() => setSelectedSkill(skill)}
              canEdit={canEditSkill(skill)}
              onEdit={() => navigate(`/skills/${skill.id}/edit`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Zap}
          title="Build your first skill"
          description="Skills are reusable AI-powered building blocks for your orchestrations. Create one or import from GitHub."
          actionLabel="Create Skill"
          onAction={() => navigate('/skills/create')}
        />
      )}
    </div>
  );
}
