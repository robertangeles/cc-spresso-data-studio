import { useState, useCallback } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';

interface AvailableSkill {
  name: string;
  path: string;
  repo: string;
}

interface SkillImporterProps {
  onClose: () => void;
  onImported: () => void;
}

const DEFAULT_REPO = 'https://github.com/anthropics/skills';

export function SkillImporter({ onClose, onImported }: SkillImporterProps) {
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [available, setAvailable] = useState<AvailableSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAvailable([]);
    setHasLoaded(false);
    try {
      const params = new URLSearchParams();
      if (repoUrl && repoUrl !== DEFAULT_REPO) {
        params.set('repoUrl', repoUrl);
      }
      const { data } = await api.get(`/skills/import/available?${params.toString()}`);
      setAvailable(data.data);
      setHasLoaded(true);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Failed to load skills from repo');
      } else {
        setError('Failed to load skills from repo');
      }
    } finally {
      setIsLoading(false);
    }
  }, [repoUrl]);

  const handleImport = async (skillName: string) => {
    setImporting(skillName);
    setError(null);
    try {
      const body: Record<string, string> = { skillName };
      if (repoUrl && repoUrl !== DEFAULT_REPO) {
        body.repoUrl = repoUrl;
      }
      await api.post('/skills/import', body);
      setImported((prev) => new Set(prev).add(skillName));
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setError(axiosErr.response?.data?.error || 'Import failed');
      } else {
        setError('Import failed');
      }
    } finally {
      setImporting(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Import Skills</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Import skills from any GitHub repo that follows the SKILL.md format.
          </p>
        </div>
        <div className="flex gap-2">
          {imported.size > 0 && (
            <Button size="sm" onClick={onImported}>
              Done ({imported.size} imported)
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>

      <Card padding="md">
        <div className="flex gap-3">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo or owner/repo"
            className="flex-1 rounded-lg border border-border-default px-3 py-2 text-sm font-mono placeholder:text-text-tertiary focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:ring-offset-2"
          />
          <Button onClick={loadSkills} disabled={isLoading || !repoUrl.trim()}>
            {isLoading ? 'Loading...' : 'Load Skills'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          Repo must have a <code className="bg-surface-2 px-1 rounded">skills/</code> directory with
          subdirectories containing <code className="bg-surface-2 px-1 rounded">SKILL.md</code>{' '}
          files.
        </p>
      </Card>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-8 flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      )}

      {hasLoaded && !isLoading && available.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border-default py-8 text-center">
          <p className="text-text-tertiary">No skills found in this repository.</p>
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((skill) => {
            const isImported = imported.has(skill.name);
            const isImporting = importing === skill.name;

            return (
              <Card key={skill.name} padding="md">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary truncate">
                      {skill.name
                        .split('-')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    </p>
                    <p className="text-xs text-text-tertiary font-mono">{skill.name}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isImported ? 'secondary' : 'primary'}
                    disabled={isImported || isImporting}
                    onClick={() => handleImport(skill.name)}
                  >
                    {isImported ? 'Imported' : isImporting ? 'Importing...' : 'Import'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
