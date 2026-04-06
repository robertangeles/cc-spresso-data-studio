import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3003';
const JWT_SECRET =
  process.env.JWT_SECRET || 'UTA1D5iyPtizM5ppTNrm1LZJLcVrKlKSTjiYlLaoyZrhGm/hha31+Vkl4NlCr8h3';

// Known test user (Rob) — used for read-only tests
const ROB_USER_ID = 'f1c43c43-e754-4081-b7f6-f077a4cea041';

function makeToken(userId: string, email = 'test@spresso.xyz') {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: 3600 });
}

function authHeader(userId: string, email?: string) {
  return { Authorization: `Bearer ${makeToken(userId, email)}` };
}

// Cleanup: track created skill IDs to delete after tests
const createdSkillIds: string[] = [];

afterAll(async () => {
  const headers = { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' };
  for (const id of createdSkillIds) {
    await fetch(`${BASE_URL}/api/skills/${id}`, { method: 'DELETE', headers });
  }
});

// ============================================================
// COMMUNITY ROUTES (optionalAuth)
// ============================================================

describe('GET /api/skills/community', () => {
  it('returns public skills without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/community`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.skills).toBeDefined();
    expect(Array.isArray(data.data.skills)).toBe(true);
    expect(data.data.hasMore).toBeDefined();
  });

  it('filters by category', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/community?category=repurpose`);
    const data = await res.json();

    expect(res.status).toBe(200);
    for (const skill of data.data.skills) {
      expect(skill.category).toBe('repurpose');
    }
  });

  it('supports sort=popular', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/community?sort=popular`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('supports sort=newest', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/community?sort=newest`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('does NOT expose private skills', async () => {
    // Create a private skill
    const headers = { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' };
    const createRes = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Private Test Skill',
        slug: `private-test-${Date.now()}`,
        description: 'Should not appear in community',
        category: 'generate',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });
    const created = await createRes.json();
    if (created.data?.id) createdSkillIds.push(created.data.id);

    // Check community listing
    const communityRes = await fetch(`${BASE_URL}/api/skills/community`);
    const communityData = await communityRes.json();
    const found = communityData.data.skills.find((s: { id: string }) => s.id === created.data?.id);
    expect(found).toBeUndefined();
  });
});

describe('GET /api/skills/community/trending', () => {
  it('returns trending skills array', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/community/trending`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});

describe('GET /api/skills/community/creator/:userId', () => {
  it('returns skills by a specific creator', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/community/creator/${ROB_USER_ID}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.skills).toBeDefined();
    expect(Array.isArray(data.data.skills)).toBe(true);
  });
});

// ============================================================
// MY SKILLS (authenticated)
// ============================================================

describe('GET /api/skills/mine', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/mine`);
    expect(res.status).toBe(401);
  });

  it('returns user skills with auth', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/mine`, {
      headers: authHeader(ROB_USER_ID),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('filters by category', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/mine?category=generate`, {
      headers: authHeader(ROB_USER_ID),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    for (const skill of data.data) {
      expect(skill.category).toBe('generate');
    }
  });
});

// ============================================================
// SINGLE SKILL
// ============================================================

describe('GET /api/skills/:idOrSlug', () => {
  it('returns skill by slug', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/repurpose-blog-to-tweets`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.slug).toBe('repurpose-blog-to-tweets');
    expect(data.data.name).toBeDefined();
  });

  it('returns 404 for non-existent slug', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/this-skill-does-not-exist-xyz`);
    expect(res.status).toBe(404);
  });
});

// ============================================================
// CRUD
// ============================================================

describe('Skill CRUD', () => {
  let skillId: string;
  const slug = `crud-test-${Date.now()}`;

  it('POST /api/skills — creates a skill (default private)', async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'CRUD Test Skill',
        slug,
        description: 'For CRUD testing',
        category: 'research',
        config: {
          inputs: [{ id: 'q', key: 'q', type: 'text', label: 'Query', required: true }],
          outputs: [{ key: 'answer', type: 'markdown', label: 'Answer' }],
          promptTemplate: 'Research: {{q}}',
          systemPrompt: 'Research assistant',
          capabilities: ['research'],
          temperature: 0.5,
          maxTokens: 3000,
        },
      }),
    });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.slug).toBe(slug);
    expect(data.data.visibility).toBe('private');
    skillId = data.data.id;
    createdSkillIds.push(skillId);
  });

  it('POST /api/skills — rejects duplicate slug for same user', async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Slug',
        slug,
        description: 'Should fail',
        category: 'generate',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });

    expect(res.status).toBe(409);
  });

  it('POST /api/skills — rejects without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'No Auth',
        slug: 'no-auth',
        description: 'Should fail',
        category: 'generate',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });

    expect(res.status).toBe(401);
  });

  it('PUT /api/skills/:id — updates the skill', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}`, {
      method: 'PUT',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated CRUD Skill', description: 'Updated description' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.name).toBe('Updated CRUD Skill');
  });

  it('DELETE /api/skills/:id — deletes the skill', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}`, {
      method: 'DELETE',
      headers: authHeader(ROB_USER_ID),
    });

    expect(res.status).toBe(200);

    // Verify it's gone
    const getRes = await fetch(`${BASE_URL}/api/skills/${skillId}`);
    expect(getRes.status).toBe(404);

    // Remove from cleanup list
    const idx = createdSkillIds.indexOf(skillId);
    if (idx >= 0) createdSkillIds.splice(idx, 1);
  });
});

// ============================================================
// VISIBILITY
// ============================================================

describe('PATCH /api/skills/:id/visibility', () => {
  let skillId: string;

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Visibility Test',
        slug: `vis-test-${Date.now()}`,
        description: 'Testing visibility transitions',
        category: 'generate',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });
    const data = await res.json();
    skillId = data.data.id;
    createdSkillIds.push(skillId);
  });

  it('transitions private → public', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}/visibility`, {
      method: 'PATCH',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.visibility).toBe('public');
  });

  it('transitions public → unlisted', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}/visibility`, {
      method: 'PATCH',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'unlisted' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.visibility).toBe('unlisted');
  });

  it('transitions unlisted → private', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}/visibility`, {
      method: 'PATCH',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'private' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.visibility).toBe('private');
  });

  it('rejects invalid visibility value', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}/visibility`, {
      method: 'PATCH',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'invalid' }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${skillId}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' }),
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// FAVORITES
// ============================================================

describe('POST /api/skills/:id/favorite', () => {
  let publicSkillId: string;

  beforeAll(async () => {
    // Get a public skill to favorite
    const res = await fetch(`${BASE_URL}/api/skills/community`);
    const data = await res.json();
    publicSkillId = data.data.skills[0]?.id;
  });

  it('toggles favorite on', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${publicSkillId}/favorite`, {
      method: 'POST',
      headers: authHeader(ROB_USER_ID),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.favorited).toBe(true);
  });

  it('toggles favorite off', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${publicSkillId}/favorite`, {
      method: 'POST',
      headers: authHeader(ROB_USER_ID),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.favorited).toBe(false);
  });

  it('rejects without auth', async () => {
    const res = await fetch(`${BASE_URL}/api/skills/${publicSkillId}/favorite`, {
      method: 'POST',
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// FORK
// ============================================================

describe('POST /api/skills/:id/fork', () => {
  it('rejects forking own skill', async () => {
    // Get one of Rob's skills
    const mineRes = await fetch(`${BASE_URL}/api/skills/mine`, {
      headers: authHeader(ROB_USER_ID),
    });
    const mineData = await mineRes.json();
    const ownSkillId = mineData.data[0]?.id;

    if (ownSkillId) {
      const res = await fetch(`${BASE_URL}/api/skills/${ownSkillId}/fork`, {
        method: 'POST',
        headers: authHeader(ROB_USER_ID),
      });

      // 400 (validation) or 403 (forbidden) — both are correct rejections
      expect([400, 403]).toContain(res.status);
    }
  });

  it('rejects without auth', async () => {
    const communityRes = await fetch(`${BASE_URL}/api/skills/community`);
    const communityData = await communityRes.json();
    const skillId = communityData.data.skills[0]?.id;

    const res = await fetch(`${BASE_URL}/api/skills/${skillId}/fork`, {
      method: 'POST',
    });

    expect(res.status).toBe(401);
  });
});

// ============================================================
// VALIDATION
// ============================================================

describe('Validation', () => {
  it('rejects create with empty name', async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        slug: 'empty-name',
        description: 'test',
        category: 'generate',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects create with invalid category', async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Category',
        slug: 'bad-category',
        description: 'test',
        category: 'nonexistent',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects create with invalid slug format', async () => {
    const res = await fetch(`${BASE_URL}/api/skills`, {
      method: 'POST',
      headers: { ...authHeader(ROB_USER_ID), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Slug',
        slug: 'BAD SLUG WITH SPACES',
        description: 'test',
        category: 'generate',
        config: {
          inputs: [{ id: 'c', key: 'c', type: 'multiline', label: 'C', required: true }],
          outputs: [{ key: 'r', type: 'markdown', label: 'R' }],
          promptTemplate: '{{c}}',
          systemPrompt: 'test',
          capabilities: [],
          temperature: 0.7,
          maxTokens: 1000,
        },
      }),
    });

    expect(res.status).toBe(400);
  });
});

// ============================================================
// DEFAULT SKILLS SEEDING
// ============================================================

describe('Default Anthropic Skills Seeding', () => {
  it('seedDefaultSkillsForUser creates 8 default skills', async () => {
    // This is tested indirectly — the seeder runs on registration.
    // We verify that the default skill definitions are properly structured.
    const { defaultUserSkills } = await import('../../services/skills/defaults/index.js');

    expect(defaultUserSkills).toHaveLength(8);

    for (const skill of defaultUserSkills) {
      expect(skill.slug).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.category).toBeTruthy();
      expect(skill.config).toBeDefined();
      expect(skill.config.promptTemplate).toBeTruthy();
      expect(skill.config.inputs.length).toBeGreaterThan(0);
      expect(skill.config.outputs.length).toBeGreaterThan(0);
    }
  });

  it('default skills have unique slugs', async () => {
    const { defaultUserSkills } = await import('../../services/skills/defaults/index.js');
    const slugs = defaultUserSkills.map((s: { slug: string }) => s.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);
  });

  it('default skills have valid categories', async () => {
    const { defaultUserSkills } = await import('../../services/skills/defaults/index.js');
    const validCategories = ['repurpose', 'generate', 'research', 'transform', 'extract', 'plan'];
    for (const skill of defaultUserSkills) {
      expect(validCategories).toContain(skill.category);
    }
  });
});
