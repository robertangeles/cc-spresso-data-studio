import { useState } from 'react';
import { useProfile, useRules } from '../../hooks/useProfile';
import { ModelSelector } from '../../components/ui/ModelSelector';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { AvatarUpload } from '../../components/ui/AvatarUpload';
import { api } from '../../lib/api';
import type { CreateRuleDTO } from '@cc/shared';

type Tab = 'info' | 'rules' | 'brand' | 'preferences' | 'social';

const TABS: { key: Tab; label: string }[] = [
  { key: 'info', label: 'Profile' },
  { key: 'rules', label: 'Rules Engine' },
  { key: 'brand', label: 'Brand Kit' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'social', label: 'Social Accounts' },
];

const RULE_CATEGORIES = [
  { value: 'writing', label: 'Writing Style' },
  { value: 'formatting', label: 'Formatting' },
  { value: 'brand', label: 'Brand Voice' },
  { value: 'custom', label: 'Custom' },
] as const;

const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'Twitter / X', icon: '\u{1D54F}', color: 'bg-black' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'in', color: 'bg-blue-700' },
  { id: 'facebook', name: 'Facebook', icon: 'f', color: 'bg-blue-600' },
  { id: 'instagram', name: 'Instagram', icon: '\uD83D\uDCF7', color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
  { id: 'tiktok', name: 'TikTok', icon: '\u266A', color: 'bg-black' },
  { id: 'threads', name: 'Threads', icon: '@', color: 'bg-black' },
  { id: 'pinterest', name: 'Pinterest', icon: 'P', color: 'bg-red-600' },
  { id: 'bluesky', name: 'Bluesky', icon: '\uD83E\uDD8B', color: 'bg-blue-500' },
  { id: 'youtube', name: 'YouTube', icon: '\u25B6', color: 'bg-red-600' },
];

export function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const { profile, isLoading: profileLoading, refresh, updateProfile, changePassword } = useProfile();

  if (profileLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-1">User Profile</h2>
      <p className="text-sm text-text-secondary mb-6">Manage your profile, rules, brand, and preferences.</p>

      <div className="flex gap-1 border-b border-border-default mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && <ProfileInfoTab profile={profile} updateProfile={updateProfile} changePassword={changePassword} refreshProfile={refresh} />}
      {activeTab === 'rules' && <RulesEngineTab />}
      {activeTab === 'brand' && <BrandKitTab profile={profile} updateProfile={updateProfile} />}
      {activeTab === 'preferences' && <PreferencesTab profile={profile} updateProfile={updateProfile} />}
      {activeTab === 'social' && <SocialAccountsTab />}
    </div>
  );
}

// --- Profile Info Tab ---

function ProfileInfoTab({ profile, updateProfile, changePassword, refreshProfile }: {
  profile: ReturnType<typeof useProfile>['profile'];
  updateProfile: ReturnType<typeof useProfile>['updateProfile'];
  changePassword: ReturnType<typeof useProfile>['changePassword'];
  refreshProfile: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ displayName, bio });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePasswordChange = async () => {
    try {
      setPwMsg(null);
      await changePassword(currentPw, newPw);
      setPwMsg('Password changed successfully');
      setCurrentPw('');
      setNewPw('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to change password';
      setPwMsg(msg);
    }
  };

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">Personal Information</h4>
        <div className="space-y-4">
          <AvatarUpload
            currentUrl={profile?.avatarUrl}
            initials={displayName ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
            onUpload={async (blob) => {
              const reader = new FileReader();
              const base64 = await new Promise<string>((resolve) => {
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              await api.post('/profile/avatar', { image: base64 });
              await refreshProfile();
            }}
          />
          <Input label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself..." rows={3}
              className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            {saved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">Change Password</h4>
        <div className="space-y-3 max-w-sm">
          <Input label="Current Password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
          <Input label="New Password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          {pwMsg && <p className={`text-sm ${pwMsg.includes('success') ? 'text-status-success' : 'text-red-400'}`}>{pwMsg}</p>}
          <Button onClick={handlePasswordChange} disabled={!currentPw || !newPw}>Change Password</Button>
        </div>
      </Card>
    </div>
  );
}

// --- Rules Engine Tab ---

function RulesEngineTab() {
  const { rules, isLoading, createRule, updateRule, deleteRule } = useRules();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateRuleDTO>({ name: '', rules: '', category: 'writing' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', rules: '', category: 'writing' });
    setFormError(null);
  };

  const handleEdit = (rule: typeof rules[0]) => {
    setEditingId(rule.id);
    setFormData({ name: rule.name, rules: rule.rules, category: rule.category as CreateRuleDTO['category'] });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateRule(editingId, formData);
      } else {
        await createRule(formData);
      }
      resetForm();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save rule';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: typeof rules[0]) => {
    await updateRule(rule.id, { isActive: !rule.isActive });
  };

  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteRuleId) return;
    await deleteRule(deleteRuleId);
    setDeleteRuleId(null);
  };

  return (
    <div>
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
        <p className="text-sm text-blue-400">
          Rules are injected as system instructions into <strong>every AI call</strong> in your orchestrations.
          Active rules apply globally — no need to repeat them in skill prompts.
        </p>
      </div>

      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>+ Add Rule</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-border-default bg-surface-3 p-4">
          <h4 className="text-sm font-semibold text-text-primary mb-3">{editingId ? 'Edit Rule' : 'New Rule'}</h4>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Writing Style" required />
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value as CreateRuleDTO['category'] })}
                  className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
                  {RULE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Rules (markdown supported)</label>
              <textarea value={formData.rules} onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
                placeholder={"Example:\n- Never use em-dashes\n- No passive voice\n- Banned words: 'just', 'actually', 'that', 'discover'\n- Keep sentences under 20 words"}
                rows={10}
                className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 font-mono text-sm text-text-primary focus:border-accent focus:outline-none" />
            </div>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-default py-8 text-center text-sm text-text-tertiary">
          No rules yet. Add your first rule to enforce it across all orchestrations.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className={`rounded-lg border p-4 ${rule.isActive ? 'border-green-500/20 bg-green-500/5' : 'border-border-default bg-surface-3 opacity-60'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => handleToggle(rule)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.isActive ? 'bg-green-500' : 'bg-surface-4'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${rule.isActive ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                  <span className="font-medium text-text-primary">{rule.name}</span>
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-secondary">{rule.category}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleEdit(rule)} className="text-xs text-accent hover:text-accent-hover">Edit</button>
                  <button type="button" onClick={() => setDeleteRuleId(rule.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
              <pre className="text-xs text-text-secondary whitespace-pre-wrap line-clamp-3">{rule.rules}</pre>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!deleteRuleId}
        onClose={() => setDeleteRuleId(null)}
        title="Delete Rule"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="danger"
      >
        <p>Delete this rule? This cannot be undone.</p>
      </Modal>
    </div>
  );
}

// --- Brand Kit Tab ---

function BrandKitTab({ profile, updateProfile }: {
  profile: ReturnType<typeof useProfile>['profile'];
  updateProfile: ReturnType<typeof useProfile>['updateProfile'];
}) {
  const [brandName, setBrandName] = useState(profile?.brandName ?? '');
  const [brandVoice, setBrandVoice] = useState(profile?.brandVoice ?? '');
  const [targetAudience, setTargetAudience] = useState(profile?.targetAudience ?? '');
  const [keyMessaging, setKeyMessaging] = useState(profile?.keyMessaging ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ brandName, brandVoice, targetAudience, keyMessaging });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
        <p className="text-sm text-blue-400">
          Your Brand Kit helps AI understand your brand voice and audience. This context is available to all skills and orchestrations.
        </p>
      </div>

      <Card padding="lg">
        <div className="space-y-4">
          <Input label="Brand Name" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Your brand or business name" />
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Brand Voice & Tone</label>
            <textarea value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)}
              placeholder="Describe how your brand communicates. Example: 'Direct, conversational, no jargon. Think Paul Graham meets Seth Godin. We challenge conventional wisdom with evidence.'"
              rows={4} className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Target Audience</label>
            <textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Who are you creating content for? Example: 'COOs, CIOs, and Chief Transformation Officers at mid-to-large enterprises. Upper-mid to senior level, asset-heavy industries.'"
              rows={3} className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Key Messaging</label>
            <textarea value={keyMessaging} onChange={(e) => setKeyMessaging(e.target.value)}
              placeholder="Core messages, value propositions, or themes that should come through in your content."
              rows={4} className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Brand Kit'}</Button>
            {saved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// --- Preferences Tab ---

function PreferencesTab({ profile, updateProfile }: {
  profile: ReturnType<typeof useProfile>['profile'];
  updateProfile: ReturnType<typeof useProfile>['updateProfile'];
}) {
  const [defaultModel, setDefaultModel] = useState(profile?.defaultModel ?? '');
  const [defaultEditorModel, setDefaultEditorModel] = useState(profile?.defaultEditorModel ?? '');
  const [defaultEditorMaxRounds, setDefaultEditorMaxRounds] = useState(profile?.defaultEditorMaxRounds ?? 3);
  const [defaultEditorApprovalMode, setDefaultEditorApprovalMode] = useState(profile?.defaultEditorApprovalMode ?? 'auto');
  const [timezone, setTimezone] = useState(profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ defaultModel, defaultEditorModel, defaultEditorMaxRounds, defaultEditorApprovalMode, timezone });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">Default AI Settings</h4>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Default Model</label>
            <ModelSelector value={defaultModel} onChange={setDefaultModel} allowAuto />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Default Editor Model</label>
            <ModelSelector value={defaultEditorModel} onChange={setDefaultEditorModel} allowAuto />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Default Editor Max Rounds: {defaultEditorMaxRounds}
            </label>
            <input type="range" min={1} max={10} value={defaultEditorMaxRounds}
              onChange={(e) => setDefaultEditorMaxRounds(parseInt(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Default Editor Approval</label>
            <select value={defaultEditorApprovalMode}
              onChange={(e) => setDefaultEditorApprovalMode(e.target.value as 'auto' | 'manual')}
              className="w-full rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="auto">Auto (editor decides)</option>
              <option value="manual">Manual (you approve each round)</option>
            </select>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <h4 className="mb-4 font-medium text-text-primary">General</h4>
        <div className="space-y-4">
          <Input label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Preferences'}</Button>
            {saved && <span className="text-sm text-status-success">Saved</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// --- Social Accounts Tab ---

function SocialAccountsTab() {
  return (
    <div>
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
        <p className="text-sm text-blue-400">
          Connect your social media accounts to enable content scheduling and distribution. OAuth integration coming soon.
        </p>
      </div>

      <div className="space-y-3">
        {SOCIAL_PLATFORMS.map((platform) => (
          <div key={platform.id} className="flex items-center justify-between rounded-lg border border-border-default p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold ${platform.color}`}>
                {platform.icon}
              </div>
              <div>
                <p className="font-medium text-text-primary">{platform.name}</p>
                <p className="text-xs text-text-tertiary">Not connected</p>
              </div>
            </div>
            <Button size="sm" variant="secondary" disabled>
              Connect
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-text-tertiary text-center">
        Social account connections will be available when the Content Scheduler is launched.
      </p>
    </div>
  );
}
