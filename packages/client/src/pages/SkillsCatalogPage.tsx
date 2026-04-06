import { useState, useCallback } from 'react';
import type { Skill } from '@cc/shared';
import {
  useMySkills,
  useCommunitySkills,
  useTrendingSkills,
  useSkillActions,
} from '../hooks/useSkills';
import { useAuth } from '../context/AuthContext';
import { SkillCard } from '../components/skills/SkillCard';
import { SkillDetail } from '../components/skills/SkillDetail';
import { SkillImporter } from '../components/skills/SkillImporter';
import { Button } from '../components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Zap, Globe, Wrench, TrendingUp, Users, GitFork, Heart } from 'lucide-react';

const categories = [
  { value: '', label: 'All' },
  { value: 'repurpose', label: 'Repurpose' },
  { value: 'generate', label: 'Generate' },
  { value: 'research', label: 'Research' },
  { value: 'transform', label: 'Transform' },
  { value: 'extract', label: 'Extract' },
  { value: 'plan', label: 'Plan' },
];

type Tab = 'workshop' | 'community';

export function SkillsCatalogPage() {
  const [tab, setTab] = useState<Tab>('workshop');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [communitySort, setCommunitySort] = useState<'newest' | 'popular'>('newest');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { fork, toggleFavorite } = useSkillActions();

  // Data hooks
  const mySkills = useMySkills({ category: category || undefined, search: search || undefined });
  const community = useCommunitySkills({
    category: category || undefined,
    search: search || undefined,
    sort: communitySort,
  });
  const trending = useTrendingSkills();

  const activeSkills = tab === 'workshop' ? mySkills.skills : community.skills;
  const isLoading = tab === 'workshop' ? mySkills.isLoading : community.isLoading;
  const refresh = tab === 'workshop' ? mySkills.refresh : community.refresh;

  const canEditSkill = (skill: Skill) =>
    user?.role === 'Administrator' || (skill.userId === user?.id && skill.source !== 'builtin');

  const handleFork = useCallback(
    async (skill: Skill) => {
      try {
        const forked = await fork(skill.id);
        setTab('workshop');
        await mySkills.refresh();
        setSelectedSkill(forked);
      } catch {
        // Error handled by API layer
      }
    },
    [fork, mySkills],
  );

  const handleFavorite = useCallback(
    async (skill: Skill) => {
      await toggleFavorite(skill.id);
      community.refresh();
    },
    [toggleFavorite, community],
  );

  // ── Importer view ──
  if (showImporter) {
    return (
      <SkillImporter
        onClose={() => setShowImporter(false)}
        onImported={() => {
          setShowImporter(false);
          refresh();
        }}
      />
    );
  }

  // ── Detail view ──
  if (selectedSkill) {
    return (
      <SkillDetail
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
        canEdit={canEditSkill(selectedSkill)}
        onEdit={() => navigate(`/skills/${selectedSkill.id}/edit`)}
        onFork={
          tab === 'community' && selectedSkill.userId !== user?.id
            ? () => handleFork(selectedSkill)
            : undefined
        }
        onSkillUpdated={(updated) => {
          setSelectedSkill(updated);
          refresh();
        }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Skills</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {tab === 'workshop'
              ? 'Your personal skills workshop. Create, edit, and manage your skills.'
              : 'Discover and fork skills shared by the community.'}
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

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 rounded-lg bg-surface-2/50 p-1 backdrop-blur-sm border border-white/5">
        <button
          type="button"
          onClick={() => {
            setTab('workshop');
            setSearch('');
            setCategory('');
          }}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            tab === 'workshop'
              ? 'bg-accent text-surface-0 shadow-[0_0_12px_rgba(255,214,10,0.15)]'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <Wrench className="h-4 w-4" />
          My Workshop
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('community');
            setSearch('');
            setCategory('');
          }}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            tab === 'community'
              ? 'bg-accent text-surface-0 shadow-[0_0_12px_rgba(255,214,10,0.15)]'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          <Globe className="h-4 w-4" />
          Community
        </button>
      </div>

      {/* Trending section (Community tab only) */}
      {tab === 'community' && trending.skills.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">Trending This Week</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {trending.skills.map((skill, i) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => setSelectedSkill(skill)}
                className="group/trend min-w-[220px] animate-slide-up rounded-xl border border-white/5 bg-gradient-to-br from-surface-2/80 to-surface-3/40 p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_16px_rgba(255,214,10,0.1)]"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-accent/40">#{i + 1}</span>
                  <h4 className="truncate text-sm font-medium text-text-primary">{skill.name}</h4>
                </div>
                <p className="mt-1 text-xs text-text-tertiary line-clamp-1">{skill.description}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {skill.usageCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="h-3 w-3" /> {skill.forkCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" /> {skill.favoriteCount}
                  </span>
                </div>
                {skill.creatorDisplayName && (
                  <p className="mt-1.5 text-xs text-text-tertiary">
                    by <span className="text-accent">{skill.creatorDisplayName}</span>
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 focus:ring-offset-surface-0"
          />
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setCategory(cat.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat.value
                    ? 'bg-accent-dim text-accent'
                    : 'bg-surface-3 text-text-secondary hover:bg-surface-4'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort (community tab only) */}
        {tab === 'community' && (
          <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setCommunitySort('newest')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                communitySort === 'newest'
                  ? 'bg-surface-3 text-text-primary'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setCommunitySort('popular')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                communitySort === 'popular'
                  ? 'bg-surface-3 text-text-primary'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              Popular
            </button>
          </div>
        )}
      </div>

      {/* Skills grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : activeSkills.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeSkills.map((skill, i) => (
            <div
              key={skill.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              <SkillCard
                skill={skill}
                onClick={() => setSelectedSkill(skill)}
                canEdit={canEditSkill(skill)}
                onEdit={() => navigate(`/skills/${skill.id}/edit`)}
                showCreator={tab === 'community'}
                onFork={
                  tab === 'community' && skill.userId !== user?.id
                    ? () => handleFork(skill)
                    : undefined
                }
                onFavorite={tab === 'community' && user ? () => handleFavorite(skill) : undefined}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={tab === 'workshop' ? Zap : Globe}
          title={tab === 'workshop' ? 'No skills yet.' : 'No community skills found.'}
          description={
            tab === 'workshop'
              ? 'Build one. It takes 60 seconds. Or import from GitHub.'
              : 'Be the first to share a skill with the community!'
          }
          actionLabel={tab === 'workshop' ? 'Create Skill' : undefined}
          onAction={tab === 'workshop' ? () => navigate('/skills/create') : undefined}
        />
      )}
    </div>
  );
}
