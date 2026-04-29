# Test Plan: Skill Marketplace — Privacy, Sharing & Community

**Feature:** Skills Marketplace with privacy controls, visibility model, forking, favorites, and community browsing
**Date:** 2026-04-05
**Status:** Pre-implementation
**Scope:** Hotfix (data leak) + Full marketplace feature

---

## Table of Contents

1. [Architecture Summary](#1-architecture-summary)
2. [Schema Changes Under Test](#2-schema-changes-under-test)
3. [Test Infrastructure Setup](#3-test-infrastructure-setup)
4. [Hotfix Tests — Data Leak Fix](#4-hotfix-tests--data-leak-fix)
5. [Unit Tests — Service Layer](#5-unit-tests--service-layer)
6. [Unit Tests — Shared Types & Validation](#6-unit-tests--shared-types--validation)
7. [Integration Tests — API Routes](#7-integration-tests--api-routes)
8. [Integration Tests — Database Constraints](#8-integration-tests--database-constraints)
9. [End-to-End Tests — User Flows](#9-end-to-end-tests--user-flows)
10. [Penetration Tests — Security & Exploitation](#10-penetration-tests--security--exploitation)
11. [Edge Case & Failure Scenario Tests](#11-edge-case--failure-scenario-tests)
12. [Performance Tests](#12-performance-tests)
13. [Frontend Component Tests](#13-frontend-component-tests)
14. [Test Data Factories](#14-test-data-factories)
15. [Regression Checklist](#15-regression-checklist)
16. [Test Matrix Summary](#16-test-matrix-summary)

---

## 1. Architecture Summary

### Data Flow Under Test

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  USER A (creator)                    USER B (consumer)                  │
│  ─────────────────                   ─────────────────                  │
│  Creates skill (private by default)  Browses Community tab              │
│        │                                    │                           │
│        ▼                                    ▼                           │
│  PATCH /skills/:id/visibility        GET /skills/community              │
│  { visibility: 'public' }                   │                           │
│        │                                    │                           │
│        ▼                                    ▼                           │
│  skill.service.updateVisibility      skill.service.listCommunitySkills  │
│        │                                    │                           │
│        ▼                                    ▼                           │
│  ┌──────────────────────────────────────────────────────┐               │
│  │  skills table                                        │               │
│  │  visibility: 'private' | 'unlisted' | 'public'      │               │
│  │  showPrompts: boolean (default false)                │               │
│  │  forkedFromId: uuid | null                           │               │
│  │  usageCount: integer (default 0)                     │               │
│  │  creatorDisplayName: varchar                         │               │
│  │  creatorAvatarUrl: varchar                           │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐                            │
│  │ skill_favorites  │    │ (future tables) │                            │
│  │ user_id + skill_id│   │                 │                            │
│  └─────────────────┘    └─────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Visibility State Machine

```
              ┌───────────────────────────────────────┐
              │                                       │
              ▼                                       │
  ┌─────────────────┐    ┌──────────────┐    ┌───────┴───────┐
  │     PRIVATE      │───▶│   UNLISTED    │───▶│    PUBLIC      │
  │  (default)       │    │  (link only)  │    │  (community)   │
  │                  │◀───│              │◀───│               │
  └─────────────────┘    └──────────────┘    └───────────────┘
        │                       │                     │
        │  Visible to:          │  Visible to:        │  Visible to:
        │  - Owner only         │  - Owner            │  - Everyone
        │  - Admin              │  - Admin            │  - Admin
        │                       │  - Anyone with      │  - Browseable in
        │                       │    direct link       │    Community tab
        │                       │                     │
        │  NOT in:              │  NOT in:            │  IN:
        │  - Community listing  │  - Community listing│  - Community listing
        │  - Search results     │  - Search results   │  - Search results
        └───────────────────────┴─────────────────────┘
```

### Endpoints Under Test

| Method | Path                                | Auth     | Description                          |
| ------ | ----------------------------------- | -------- | ------------------------------------ |
| GET    | `/skills/mine`                      | Required | User's own skills (all visibilities) |
| GET    | `/skills/community`                 | Optional | Public skills from all users         |
| GET    | `/skills/:idOrSlug`                 | Optional | Single skill with visibility check   |
| POST   | `/skills`                           | Required | Create skill (default: private)      |
| PUT    | `/skills/:id`                       | Required | Update skill (ownership check)       |
| PATCH  | `/skills/:id/visibility`            | Required | Change visibility enum               |
| DELETE | `/skills/:id`                       | Required | Delete skill (ownership check)       |
| POST   | `/skills/:id/fork`                  | Required | Fork a public/unlisted skill         |
| POST   | `/skills/:id/favorite`              | Required | Toggle favorite                      |
| GET    | `/skills/:id/versions`              | Public   | List versions                        |
| GET    | `/skills/community/trending`        | Optional | Trending skills (7-day window)       |
| GET    | `/skills/community/creator/:userId` | Optional | Skills by creator                    |

---

## 2. Schema Changes Under Test

### Modified: `skills` table

| Column               | Type           | Default     | Change                                  |
| -------------------- | -------------- | ----------- | --------------------------------------- |
| `visibility`         | `varchar(20)`  | `'private'` | NEW — replaces `isPublished`            |
| `showPrompts`        | `boolean`      | `false`     | NEW — creator controls prompt exposure  |
| `forkedFromId`       | `uuid`         | `null`      | NEW — FK to skills.id, self-referential |
| `usageCount`         | `integer`      | `0`         | NEW — materialized usage counter        |
| `favoriteCount`      | `integer`      | `0`         | NEW — materialized favorite counter     |
| `forkCount`          | `integer`      | `0`         | NEW — materialized fork counter         |
| `creatorDisplayName` | `varchar(255)` | `null`      | NEW — denormalized from users           |
| `creatorAvatarUrl`   | `varchar(500)` | `null`      | NEW — denormalized from users           |
| `isPublished`        | `boolean`      | —           | REMOVED (after migration)               |

### New: `skill_favorites` table

| Column      | Type        | Constraints              |
| ----------- | ----------- | ------------------------ |
| `id`        | `uuid`      | PK                       |
| `userId`    | `uuid`      | FK → users.id, NOT NULL  |
| `skillId`   | `uuid`      | FK → skills.id, NOT NULL |
| `createdAt` | `timestamp` | NOT NULL, default now()  |
| —           | —           | UNIQUE(userId, skillId)  |

### New indexes

| Index                       | Table           | Columns           | Type                                 |
| --------------------------- | --------------- | ----------------- | ------------------------------------ |
| `idx_skills_visibility`     | skills          | `visibility`      | Partial: WHERE visibility = 'public' |
| `idx_skills_usage_count`    | skills          | `usageCount`      | DESC (for trending sort)             |
| `idx_skills_forked_from`    | skills          | `forkedFromId`    | Standard                             |
| `idx_skill_favorites_user`  | skill_favorites | `userId, skillId` | Unique composite                     |
| `idx_skill_favorites_skill` | skill_favorites | `skillId`         | Standard (for count queries)         |

---

## 3. Test Infrastructure Setup

### Test utilities needed

**File:** `packages/server/src/__tests__/helpers/test-utils.ts`

```typescript
// Factory functions needed for test data creation
interface TestSkillFactory {
  createSkill(overrides?: Partial<CreateSkillData>): CreateSkillData;
  createSkillConfig(overrides?: Partial<SkillConfig>): SkillConfig;
}

interface TestUserFactory {
  createUser(overrides?: Partial<{ name: string; email: string; role: string }>): {
    userId: string;
    email: string;
    name: string;
    role: string;
  };
  createAuthToken(user: TokenPayload): string;
}

// Mock data generators
function makeSkill(visibility?: string, userId?: string): CreateSkillData;
function makeUser(role?: string): TokenPayload;
function makeAuthHeader(token: string): { Authorization: string };
```

### Test database strategy

Tests requiring DB access use the real Drizzle connection with transaction rollback:

```typescript
// Each test runs inside a transaction that rolls back after
beforeEach(async () => {
  await db.execute(sql`BEGIN`);
});
afterEach(async () => {
  await db.execute(sql`ROLLBACK`);
});
```

---

## 4. Hotfix Tests — Data Leak Fix

**Priority:** P0 — Ship before marketplace
**Files:**

- `packages/server/src/services/__tests__/skill.service.hotfix.test.ts`
- `packages/server/src/routes/__tests__/skill.routes.hotfix.test.ts`

### 4.1 getSkillByIdOrSlug access control

| #    | Test Case                                                       | Input                             | Expected          | Type |
| ---- | --------------------------------------------------------------- | --------------------------------- | ----------------- | ---- |
| H-01 | Owner can access own private skill by ID                        | userId=owner, visibility=private  | 200 + full skill  | Unit |
| H-02 | Owner can access own private skill by slug                      | userId=owner, slug lookup         | 200 + full skill  | Unit |
| H-03 | Non-owner CANNOT access private skill by ID                     | userId=other, visibility=private  | 404 NotFoundError | Unit |
| H-04 | Non-owner CANNOT access private skill by slug                   | userId=other, slug lookup         | 404 NotFoundError | Unit |
| H-05 | Unauthenticated CANNOT access private skill                     | no auth, visibility=private       | 404 NotFoundError | Unit |
| H-06 | Admin CAN access any private skill                              | role=Administrator, any skill     | 200 + full skill  | Unit |
| H-07 | Non-owner CAN access public skill                               | userId=other, visibility=public   | 200 + skill data  | Unit |
| H-08 | Unauthenticated CAN access public skill                         | no auth, visibility=public        | 200 + skill data  | Unit |
| H-09 | Non-owner CAN access unlisted skill by direct ID                | userId=other, visibility=unlisted | 200 + skill data  | Unit |
| H-10 | Unlisted skill does NOT appear in listings                      | visibility=unlisted, list query   | Not in results    | Unit |
| H-11 | Returns 404 (not 403) for private skills to prevent enumeration | userId=other, known private slug  | 404 (not 403)     | Unit |

### 4.2 createSkill default visibility

| #    | Test Case                                                | Input                      | Expected                       | Type        |
| ---- | -------------------------------------------------------- | -------------------------- | ------------------------------ | ----------- |
| H-12 | New skill defaults to visibility='private'               | createSkill({...})         | skill.visibility === 'private' | Unit        |
| H-13 | New skill does NOT appear in community listing           | create then list community | Not in results                 | Integration |
| H-14 | Creator can see own private skill in "My Skills" listing | create then list mine      | In results                     | Integration |

### 4.3 isPublished → visibility migration

| #    | Test Case                                                      | Input                      | Expected                 | Type      |
| ---- | -------------------------------------------------------------- | -------------------------- | ------------------------ | --------- |
| H-15 | Skills with isPublished=true migrated to visibility='public'   | Existing published skill   | visibility === 'public'  | Migration |
| H-16 | Skills with isPublished=false migrated to visibility='private' | Existing unpublished skill | visibility === 'private' | Migration |
| H-17 | Built-in skills remain visibility='public' after migration     | source='builtin'           | visibility === 'public'  | Migration |

---

## 5. Unit Tests — Service Layer

**File:** `packages/server/src/services/__tests__/skill.service.test.ts`

### 5.1 Visibility filtering — listSkills

| #    | Test Case                                                       | Input                          | Expected                                         | Type |
| ---- | --------------------------------------------------------------- | ------------------------------ | ------------------------------------------------ | ---- |
| S-01 | List mine: returns all user's skills regardless of visibility   | userId=owner                   | All owner's skills (private + unlisted + public) | Unit |
| S-02 | List mine: does NOT return other users' skills                  | userId=owner                   | Only owner's skills                              | Unit |
| S-03 | List community: returns only public skills                      | no userId filter               | Only visibility='public'                         | Unit |
| S-04 | List community: excludes private skills                         | mixed visibility skills        | No private in results                            | Unit |
| S-05 | List community: excludes unlisted skills                        | mixed visibility skills        | No unlisted in results                           | Unit |
| S-06 | List community: includes public skills from all users           | multiple users' public skills  | All public skills                                | Unit |
| S-07 | List community: category filter applies on top of visibility    | category='generate', mixed     | Only public + matching category                  | Unit |
| S-08 | List community: search filter applies on top of visibility      | search='SEO', mixed            | Only public + matching name/desc                 | Unit |
| S-09 | List community: returns creatorDisplayName and creatorAvatarUrl | public skill with creator info | Creator fields populated                         | Unit |
| S-10 | List mine: empty when user has no skills                        | new user, no skills            | Empty array, no error                            | Unit |
| S-11 | List community: empty when no public skills exist               | all private                    | Empty array, no error                            | Unit |

### 5.2 Visibility change — updateVisibility

| #    | Test Case                                        | Input                        | Expected                       | Type |
| ---- | ------------------------------------------------ | ---------------------------- | ------------------------------ | ---- |
| S-12 | Owner can change private → public                | owner, visibility='public'   | Updated, visibility='public'   | Unit |
| S-13 | Owner can change public → private                | owner, visibility='private'  | Updated, visibility='private'  | Unit |
| S-14 | Owner can change private → unlisted              | owner, visibility='unlisted' | Updated, visibility='unlisted' | Unit |
| S-15 | Owner can change unlisted → public               | owner, visibility='public'   | Updated                        | Unit |
| S-16 | Owner can change public → unlisted               | owner, visibility='unlisted' | Updated                        | Unit |
| S-17 | Non-owner CANNOT change visibility               | other userId                 | ForbiddenError                 | Unit |
| S-18 | Admin CAN change visibility on any skill         | admin, any skill             | Updated                        | Unit |
| S-19 | Invalid visibility value rejected                | visibility='shared'          | ValidationError                | Unit |
| S-20 | Built-in skill visibility: only admin can change | non-admin, builtin skill     | ForbiddenError                 | Unit |

### 5.3 Prompt visibility — showPrompts

| #    | Test Case                                               | Input                         | Expected                               | Type |
| ---- | ------------------------------------------------------- | ----------------------------- | -------------------------------------- | ---- |
| S-21 | showPrompts defaults to false on creation               | createSkill({...})            | showPrompts === false                  | Unit |
| S-22 | Owner always sees own prompts regardless of showPrompts | owner fetches own skill       | promptTemplate + systemPrompt included | Unit |
| S-23 | Non-owner sees prompts when showPrompts=true            | other user, showPrompts=true  | promptTemplate + systemPrompt included | Unit |
| S-24 | Non-owner does NOT see prompts when showPrompts=false   | other user, showPrompts=false | promptTemplate=null, systemPrompt=null | Unit |
| S-25 | Admin always sees prompts regardless of showPrompts     | admin, showPrompts=false      | promptTemplate + systemPrompt included | Unit |
| S-26 | Prompt visibility applies to forked skill detail view   | non-owner views fork source   | Respects source's showPrompts setting  | Unit |

### 5.4 Fork — forkSkill

| #    | Test Case                                                                  | Input                    | Expected                                     | Type |
| ---- | -------------------------------------------------------------------------- | ------------------------ | -------------------------------------------- | ---- |
| S-27 | Fork a public skill: creates copy in user's namespace                      | userId, public skillId   | New skill with forkedFromId set              | Unit |
| S-28 | Fork a public skill: new skill is private by default                       | fork public              | fork.visibility === 'private'                | Unit |
| S-29 | Fork a public skill: slug is namespaced to forking user                    | userId, skill slug       | New slug under user's namespace              | Unit |
| S-30 | Fork a public skill: copies config, inputs, outputs                        | fork public              | Deep equal on config structure               | Unit |
| S-31 | Fork a public skill: creates version 1 with changelog                      | fork public              | Version 1: "Forked from @creator/slug"       | Unit |
| S-32 | Fork a public skill: increments source's forkCount                         | fork public              | source.forkCount += 1                        | Unit |
| S-33 | Fork an unlisted skill (via direct link): allowed                          | userId, unlisted skillId | New skill created                            | Unit |
| S-34 | Fork a private skill: REJECTED                                             | userId, private skillId  | ForbiddenError                               | Unit |
| S-35 | Fork own skill: REJECTED                                                   | owner forks own skill    | ValidationError "Cannot fork your own skill" | Unit |
| S-36 | Fork a fork: forkedFromId points to ORIGINAL root                          | fork a fork              | forkedFromId === original root id            | Unit |
| S-37 | Fork when slug collision in user's namespace                               | duplicate slug           | Auto-appends "-1", "-2" suffix               | Unit |
| S-38 | Fork source deleted mid-fork (race condition)                              | concurrent delete + fork | NotFoundError, no partial data               | Unit |
| S-39 | Fork preserves source's showPrompts=false (prompts NOT copied when hidden) | showPrompts=false source | Fork gets empty promptTemplate               | Unit |
| S-40 | Fork copies prompts when showPrompts=true                                  | showPrompts=true source  | Fork gets full promptTemplate                | Unit |

### 5.5 Favorites — favoriteSkill / unfavoriteSkill

| #    | Test Case                               | Input                             | Expected                                 | Type |
| ---- | --------------------------------------- | --------------------------------- | ---------------------------------------- | ---- |
| S-41 | Favorite a public skill                 | userId, public skillId            | Favorite row created, favoriteCount += 1 | Unit |
| S-42 | Unfavorite a favorited skill            | userId, already favorited         | Favorite row deleted, favoriteCount -= 1 | Unit |
| S-43 | Favorite a private skill: REJECTED      | userId, private skillId           | ForbiddenError                           | Unit |
| S-44 | Favorite own skill: ALLOWED             | owner favorites own public skill  | Favorite row created                     | Unit |
| S-45 | Double-favorite (idempotent)            | userId favorites same skill twice | No duplicate row, no error               | Unit |
| S-46 | Unfavorite when not favorited: no error | userId unfavorites non-favorited  | No-op, 200                               | Unit |
| S-47 | Favorite count never goes below 0       | edge: unfavorite on count=0       | favoriteCount === 0                      | Unit |

### 5.6 Usage tracking — incrementUsageCount

| #    | Test Case                                      | Input                 | Expected         | Type |
| ---- | ---------------------------------------------- | --------------------- | ---------------- | ---- |
| S-48 | Increment usage count on skill execution       | skillId               | usageCount += 1  | Unit |
| S-49 | Usage count tracks per-execution, not per-user | same user executes 3x | usageCount === 3 | Unit |
| S-50 | Usage count on non-existent skill: silent skip | invalid skillId       | No error, no-op  | Unit |

### 5.7 Namespaced slugs

| #    | Test Case                                          | Input                                | Expected                  | Type |
| ---- | -------------------------------------------------- | ------------------------------------ | ------------------------- | ---- |
| S-51 | Two users can create skills with identical slugs   | userA: "seo-tool", userB: "seo-tool" | Both created, no conflict | Unit |
| S-52 | Same user cannot create duplicate slugs            | userA: "seo-tool" twice              | ConflictError on second   | Unit |
| S-53 | Slug resolution: @username/slug resolves correctly | GET @rob/seo-tool                    | Returns rob's skill       | Unit |
| S-54 | Slug resolution: bare slug resolves builtin skills | GET "brand-guidelines"               | Returns builtin skill     | Unit |
| S-55 | Slug validation: rejects invalid characters        | slug="My Skill!!!"                   | ValidationError           | Unit |
| S-56 | Slug validation: rejects empty slug                | slug=""                              | ValidationError           | Unit |

### 5.8 Creator info denormalization

| #    | Test Case                                           | Input                     | Expected                             | Type |
| ---- | --------------------------------------------------- | ------------------------- | ------------------------------------ | ---- |
| S-57 | Skill created with creator's current display name   | createSkill by Rob        | creatorDisplayName === "Rob Angeles" | Unit |
| S-58 | Creator name update propagates to their skills      | user updates profile name | All user's skills updated            | Unit |
| S-59 | Skill from deleted user: creator fields set to null | user.onDelete='set null'  | creatorDisplayName === null          | Unit |

### 5.9 Trending — getTrendingSkills

| #    | Test Case                                      | Input                              | Expected                  | Type |
| ---- | ---------------------------------------------- | ---------------------------------- | ------------------------- | ---- |
| S-60 | Returns top N skills by usage in last 7 days   | multiple skills with varying usage | Sorted by usageCount DESC | Unit |
| S-61 | Excludes private skills from trending          | high-usage private skill           | Not in trending results   | Unit |
| S-62 | Excludes unlisted skills from trending         | high-usage unlisted skill          | Not in trending results   | Unit |
| S-63 | Returns empty when no public skills have usage | all usage=0                        | Empty array               | Unit |
| S-64 | Trending limit defaults to 5                   | 10 public skills                   | Returns top 5             | Unit |

### 5.10 Ownership helper — assertSkillOwnership

| #    | Test Case                                  | Input                         | Expected       | Type |
| ---- | ------------------------------------------ | ----------------------------- | -------------- | ---- |
| S-65 | Owner passes ownership check               | owner userId, own skill       | No error       | Unit |
| S-66 | Admin passes ownership check on any skill  | admin userId, any skill       | No error       | Unit |
| S-67 | Non-owner fails ownership check            | other userId, someone's skill | ForbiddenError | Unit |
| S-68 | Non-admin fails on builtin skill           | non-admin, builtin source     | ForbiddenError | Unit |
| S-69 | Nonexistent skill fails with NotFoundError | invalid skillId               | NotFoundError  | Unit |

---

## 6. Unit Tests — Shared Types & Validation

**File:** `packages/shared/src/__tests__/skill.types.test.ts`

| #    | Test Case                                                        | Input                                   | Expected                                                | Type |
| ---- | ---------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- | ---- |
| T-01 | SkillVisibility type accepts valid values                        | 'private', 'unlisted', 'public'         | Pass type check                                         | Unit |
| T-02 | CreateSkillDTO does not include visibility (server-side default) | DTO object                              | No visibility field                                     | Unit |
| T-03 | UpdateSkillDTO includes optional visibility field                | DTO object                              | visibility?: SkillVisibility                            | Unit |
| T-04 | Skill interface includes all new marketplace fields              | Skill object                            | visibility, showPrompts, forkedFromId, usageCount, etc. | Unit |
| T-05 | createSkillSchema rejects missing name                           | { slug, description, category, config } | Validation error                                        | Unit |
| T-06 | createSkillSchema rejects missing config                         | { name, slug, description, category }   | Validation error                                        | Unit |
| T-07 | updateSkillSchema accepts partial updates                        | { visibility: 'public' }                | Passes validation                                       | Unit |
| T-08 | updateSkillSchema rejects invalid visibility value               | { visibility: 'shared' }                | Validation error                                        | Unit |

---

## 7. Integration Tests — API Routes

**File:** `packages/server/src/routes/__tests__/skill.routes.test.ts`
**Pattern:** supertest against Express app

### 7.1 GET /skills/mine (authenticated)

| #    | Test Case                                   | Auth                       | Expected                                    | Status |
| ---- | ------------------------------------------- | -------------------------- | ------------------------------------------- | ------ |
| R-01 | Returns user's skills (all visibilities)    | User A token               | User A's private + unlisted + public skills | 200    |
| R-02 | Does NOT return other users' skills         | User A token               | No User B skills in response                | 200    |
| R-03 | Rejects unauthenticated request             | No token                   | 401 UnauthorizedError                       | 401    |
| R-04 | Category filter works with mine endpoint    | User A + category=generate | Only user A's generate skills               | 200    |
| R-05 | Search filter works with mine endpoint      | User A + search="SEO"      | Only matching user A skills                 | 200    |
| R-06 | Returns empty array for user with no skills | New user token             | `{ success: true, data: [] }`               | 200    |

### 7.2 GET /skills/community (optional auth)

| #    | Test Case                                | Auth              | Expected                             | Status |
| ---- | ---------------------------------------- | ----------------- | ------------------------------------ | ------ |
| R-07 | Returns all public skills from all users | User A token      | All public skills                    | 200    |
| R-08 | Works without authentication             | No token          | All public skills                    | 200    |
| R-09 | Excludes private skills                  | No token          | No private skills in results         | 200    |
| R-10 | Excludes unlisted skills                 | No token          | No unlisted skills in results        | 200    |
| R-11 | Includes builtin skills (always public)  | No token          | Builtin skills present               | 200    |
| R-12 | Category filter on community             | category=research | Only public research skills          | 200    |
| R-13 | Search filter on community               | search="essay"    | Only public matching skills          | 200    |
| R-14 | Pagination: first page                   | page=1, limit=24  | Max 24 results + pagination metadata | 200    |
| R-15 | Pagination: cursor-based next page       | cursor=lastId     | Next batch of results                | 200    |
| R-16 | Sort by usage count (popular)            | sort=popular      | Sorted by usageCount DESC            | 200    |
| R-17 | Sort by newest                           | sort=newest       | Sorted by createdAt DESC             | 200    |
| R-18 | Creator filter                           | creator=userId    | Only that creator's public skills    | 200    |

### 7.3 GET /skills/:idOrSlug (optional auth)

| #    | Test Case                                               | Auth                          | Expected                                           | Status |
| ---- | ------------------------------------------------------- | ----------------------------- | -------------------------------------------------- | ------ |
| R-19 | Owner fetches own private skill by UUID                 | Owner token                   | Full skill data including prompts                  | 200    |
| R-20 | Owner fetches own private skill by slug                 | Owner token                   | Full skill data                                    | 200    |
| R-21 | Non-owner fetches private skill: 404                    | Other user token              | `{ success: false }`                               | 404    |
| R-22 | Unauthenticated fetches private skill: 404              | No token                      | `{ success: false }`                               | 404    |
| R-23 | Non-owner fetches public skill: success                 | Other user token              | Skill data (prompts redacted if showPrompts=false) | 200    |
| R-24 | Non-owner fetches unlisted skill by ID: success         | Other user token              | Skill data                                         | 200    |
| R-25 | Admin fetches any private skill: success                | Admin token                   | Full skill data                                    | 200    |
| R-26 | Prompts redacted when showPrompts=false for non-owner   | Other user, showPrompts=false | promptTemplate=null, systemPrompt=null             | 200    |
| R-27 | Prompts included when showPrompts=true for non-owner    | Other user, showPrompts=true  | promptTemplate populated                           | 200    |
| R-28 | Owner always sees own prompts regardless of showPrompts | Owner, showPrompts=false      | promptTemplate populated                           | 200    |
| R-29 | Invalid UUID and invalid slug: 404                      | Any auth                      | NotFoundError                                      | 404    |

### 7.4 POST /skills (authenticated)

| #    | Test Case                                          | Auth                        | Expected                       | Status |
| ---- | -------------------------------------------------- | --------------------------- | ------------------------------ | ------ |
| R-30 | Creates skill with visibility='private' by default | User token + valid body     | skill.visibility === 'private' | 201    |
| R-31 | Rejects unauthenticated                            | No token                    | UnauthorizedError              | 401    |
| R-32 | Rejects invalid body (missing name)                | User token + { slug, desc } | ValidationError                | 400    |
| R-33 | Rejects duplicate slug within same user            | User token + existing slug  | ConflictError                  | 409    |
| R-34 | Allows duplicate slug across different users       | User A slug = User B slug   | Both created                   | 201    |
| R-35 | Populates creatorDisplayName from user profile     | User token                  | creatorDisplayName set         | 201    |
| R-36 | Creates initial version record                     | User token                  | skillVersions entry exists     | 201    |

### 7.5 PATCH /skills/:id/visibility (authenticated)

| #    | Test Case                               | Auth                        | Expected              | Status |
| ---- | --------------------------------------- | --------------------------- | --------------------- | ------ |
| R-37 | Owner changes private → public          | Owner token                 | visibility='public'   | 200    |
| R-38 | Owner changes public → private          | Owner token                 | visibility='private'  | 200    |
| R-39 | Owner changes to unlisted               | Owner token                 | visibility='unlisted' | 200    |
| R-40 | Non-owner rejected                      | Other user token            | ForbiddenError        | 403    |
| R-41 | Unauthenticated rejected                | No token                    | UnauthorizedError     | 401    |
| R-42 | Invalid visibility value rejected       | Owner + visibility='banana' | ValidationError       | 400    |
| R-43 | Admin can change any skill's visibility | Admin token                 | Updated               | 200    |
| R-44 | Nonexistent skill ID                    | Owner token                 | NotFoundError         | 404    |

### 7.6 POST /skills/:id/fork (authenticated)

| #    | Test Case                                                            | Auth                          | Expected                            | Status |
| ---- | -------------------------------------------------------------------- | ----------------------------- | ----------------------------------- | ------ |
| R-45 | Fork a public skill                                                  | User B token + public skill   | New skill created, forkedFromId set | 201    |
| R-46 | Fork an unlisted skill                                               | User B token + unlisted skill | New skill created                   | 201    |
| R-47 | Fork a private skill: rejected                                       | User B token + private skill  | ForbiddenError                      | 403    |
| R-48 | Fork own skill: rejected                                             | Owner token                   | ValidationError                     | 400    |
| R-49 | Fork unauthenticated: rejected                                       | No token                      | UnauthorizedError                   | 401    |
| R-50 | Fork increments source forkCount                                     | User B forks                  | source.forkCount += 1               | 201    |
| R-51 | Fork creates independent copy (modifying fork doesn't affect source) | Fork then update fork         | Source unchanged                    | 200    |
| R-52 | Fork nonexistent skill: 404                                          | User token + bad ID           | NotFoundError                       | 404    |
| R-53 | Fork respects showPrompts (hidden prompts → empty in fork)           | showPrompts=false source      | Fork promptTemplate empty           | 201    |

### 7.7 POST /skills/:id/favorite (authenticated)

| #    | Test Case                          | Auth                                       | Expected                  | Status |
| ---- | ---------------------------------- | ------------------------------------------ | ------------------------- | ------ |
| R-54 | Favorite a public skill            | User token                                 | 200, favoriteCount += 1   | 200    |
| R-55 | Unfavorite (toggle off)            | User token, already favorited              | 200, favoriteCount -= 1   | 200    |
| R-56 | Favorite a private skill: rejected | User token + private skill                 | ForbiddenError            | 403    |
| R-57 | Double-favorite is idempotent      | User token, already favorited, re-favorite | No error, count unchanged | 200    |
| R-58 | Unauthenticated: rejected          | No token                                   | UnauthorizedError         | 401    |
| R-59 | Favorite nonexistent skill: 404    | User token + bad ID                        | NotFoundError             | 404    |

### 7.8 GET /skills/community/trending (optional auth)

| #    | Test Case                   | Auth     | Expected                                | Status |
| ---- | --------------------------- | -------- | --------------------------------------- | ------ |
| R-60 | Returns top 5 by usage      | No token | Max 5 skills, sorted by usageCount DESC | 200    |
| R-61 | Only includes public skills | No token | No private/unlisted in results          | 200    |
| R-62 | Works unauthenticated       | No token | 200 with results                        | 200    |
| R-63 | Custom limit parameter      | limit=3  | Max 3 results                           | 200    |

### 7.9 PUT /skills/:id (existing endpoint — regression)

| #    | Test Case                                              | Auth                      | Expected                         | Status |
| ---- | ------------------------------------------------------ | ------------------------- | -------------------------------- | ------ |
| R-64 | Owner can still update skill name/description          | Owner token               | Updated                          | 200    |
| R-65 | Non-owner still rejected                               | Other token               | ForbiddenError                   | 403    |
| R-66 | Admin can still update any skill                       | Admin token               | Updated                          | 200    |
| R-67 | Config update still creates new version                | Owner + new config        | currentVersion incremented       | 200    |
| R-68 | Update does NOT change visibility (use PATCH endpoint) | PUT with visibility field | visibility unchanged or explicit | 200    |

### 7.10 DELETE /skills/:id (existing endpoint — regression)

| #    | Test Case                                                       | Auth                          | Expected                        | Status |
| ---- | --------------------------------------------------------------- | ----------------------------- | ------------------------------- | ------ |
| R-69 | Owner can still delete own skill                                | Owner token                   | Deleted                         | 200    |
| R-70 | Non-owner still rejected                                        | Other token                   | ForbiddenError                  | 403    |
| R-71 | Delete skill with favorites: cascading delete removes favorites | Owner deletes favorited skill | skill_favorites rows deleted    | 200    |
| R-72 | Delete skill with forks: forks survive (forkedFromId set null)  | Owner deletes forked skill    | Forks remain, forkedFromId=null | 200    |

---

## 8. Integration Tests — Database Constraints

**File:** `packages/server/src/db/__tests__/skill.constraints.test.ts`

| #     | Test Case                                                            | Expected                                    |
| ----- | -------------------------------------------------------------------- | ------------------------------------------- |
| DB-01 | skill_favorites unique(userId, skillId) prevents duplicate favorites | Constraint violation error                  |
| DB-02 | skills.forkedFromId FK cascades SET NULL on source delete            | forkedFromId becomes null                   |
| DB-03 | skills.userId FK cascades SET NULL on user delete                    | userId becomes null                         |
| DB-04 | skills.visibility column rejects values outside enum                 | DB error (if using CHECK constraint)        |
| DB-05 | idx_skills_visibility partial index exists                           | Index present in schema                     |
| DB-06 | idx_skills_user_id index exists (pre-existing)                       | Index present                               |
| DB-07 | skill_favorites FK to skills cascades DELETE                         | Favorites removed when skill deleted        |
| DB-08 | Composite unique on (userId, slug) enforced                          | ConflictError on duplicate within same user |
| DB-09 | Different users with same slug: no constraint violation              | Both rows inserted                          |
| DB-10 | usageCount, favoriteCount, forkCount default to 0                    | Columns default correctly                   |

---

## 9. End-to-End Tests — User Flows

**File:** `packages/server/src/__tests__/e2e/skill-marketplace.e2e.test.ts`

### E2E-01: Full Skill Privacy Lifecycle

```
Steps:
1. User A creates a skill → verify visibility='private'
2. User B lists community → skill NOT present
3. User B tries GET /skills/:id → 404
4. User A changes visibility to 'public'
5. User B lists community → skill IS present
6. User B fetches skill detail → prompts REDACTED (showPrompts=false)
7. User A enables showPrompts=true
8. User B fetches skill detail → prompts VISIBLE
9. User A changes visibility back to 'private'
10. User B lists community → skill GONE
11. User B tries GET /skills/:id → 404
Expected: Every step returns correct data, no leaks at any point
```

### E2E-02: Fork & Attribution Flow

```
Steps:
1. User A creates skill "SEO Researcher" (public, showPrompts=true)
2. User B browses community → sees skill with creator="User A"
3. User B forks skill → new skill in B's workshop, visibility='private'
4. Verify fork.forkedFromId === original.id
5. Verify fork.creatorDisplayName === "User B" (forker is new owner)
6. Verify original.forkCount === 1
7. User B modifies forked skill's prompt
8. Verify original skill prompt is UNCHANGED
9. User A deletes original skill
10. Verify fork still exists, forkedFromId=null
Expected: Full fork lifecycle with independent copies
```

### E2E-03: Favorite & Community Engagement Flow

```
Steps:
1. User A creates public skill
2. User B favorites skill → verify favoriteCount === 1
3. User C favorites skill → verify favoriteCount === 2
4. User B unfavorites → verify favoriteCount === 1
5. User B re-favorites → verify favoriteCount === 2 (idempotent no double)
6. User A makes skill private
7. User B's favorites list: skill shows as "unavailable"
8. User A deletes skill
9. User B's favorites list: skill removed entirely
Expected: Favorite counts accurate, graceful handling of deleted/hidden skills
```

### E2E-04: Multi-User Namespace Isolation

```
Steps:
1. User A creates skill with slug "content-writer"
2. User B creates skill with slug "content-writer"
3. Both succeed — no conflict
4. GET /skills/@userA/content-writer → returns A's skill
5. GET /skills/@userB/content-writer → returns B's skill
6. User A makes theirs public, User B keeps private
7. Community listing shows only A's "content-writer"
8. User B cannot see or access A's private skills
Expected: Complete namespace isolation between users
```

### E2E-05: Admin Override Flow

```
Steps:
1. User A creates private skill
2. Admin lists all skills (admin endpoint or flag) → sees A's private skill
3. Admin changes visibility to public → succeeds
4. Admin edits skill prompt → succeeds
5. Admin deletes skill → succeeds
Expected: Admin has full access to all skills regardless of ownership/visibility
```

### E2E-06: Trending Skills Flow

```
Steps:
1. Create 10 public skills from various users
2. Simulate usage: Skill A = 50 uses, Skill B = 30, Skill C = 10, rest = 0
3. GET /skills/community/trending → returns [A, B, C] in order
4. Private skill with 100 uses → NOT in trending
5. Unlisted skill with 100 uses → NOT in trending
Expected: Trending reflects only public skills, sorted by usage
```

### E2E-07: Creator Profile Browsing Flow

```
Steps:
1. User A creates 5 public skills, 3 private skills
2. User B browses GET /skills/community/creator/:userAId
3. Returns exactly 5 skills (only public)
4. Each skill shows creatorDisplayName === "User A"
5. User A updates profile name
6. Re-fetch: creatorDisplayName updated on all skills
Expected: Creator view shows only public skills with current profile info
```

---

## 10. Penetration Tests — Security & Exploitation

**File:** `packages/server/src/__tests__/security/skill.pentest.test.ts`

### 10.1 Broken Access Control (OWASP #1)

| #      | Test Case                                                | Attack                                                         | Expected Defense                                                                |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| PEN-01 | IDOR: access private skill by manipulating UUID in URL   | `GET /skills/{victimSkillId}` with attacker token              | 404 (not 403, prevents enumeration)                                             |
| PEN-02 | IDOR: modify another user's skill visibility             | `PATCH /skills/{victimSkillId}/visibility` with attacker token | 403 ForbiddenError                                                              |
| PEN-03 | IDOR: delete another user's skill                        | `DELETE /skills/{victimSkillId}` with attacker token           | 403 ForbiddenError                                                              |
| PEN-04 | IDOR: fork a private skill by knowing the ID             | `POST /skills/{privateSkillId}/fork`                           | 403 ForbiddenError                                                              |
| PEN-05 | IDOR: favorite a private skill                           | `POST /skills/{privateSkillId}/favorite`                       | 403 ForbiddenError                                                              |
| PEN-06 | Privilege escalation: non-admin sets role in token       | Tampered JWT with role=Administrator                           | 401 (JWT signature invalid)                                                     |
| PEN-07 | Horizontal traversal: list another user's private skills | `GET /skills/mine` with manipulated userId param               | Only returns authenticated user's skills (server extracts from JWT, not params) |
| PEN-08 | UUID enumeration: iterate UUIDs to find private skills   | Sequential GET requests with incrementing UUIDs                | All return 404, no timing difference                                            |

### 10.2 Injection Attacks (OWASP #3)

| #      | Test Case                                         | Attack                                                           | Expected Defense                                       |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| PEN-09 | SQL injection via skill name                      | `name: "'; DROP TABLE skills;--"`                                | Parameterized query, name stored safely                |
| PEN-10 | SQL injection via search parameter                | `search: "' OR 1=1 --"`                                          | Parameterized query, no data leak                      |
| PEN-11 | SQL injection via slug parameter                  | `slug: "a]'; DROP TABLE--"`                                      | Parameterized query, rejected by validation            |
| PEN-12 | SQL injection via category filter                 | `category: "' UNION SELECT * FROM users--"`                      | Parameterized query, category validated against enum   |
| PEN-13 | NoSQL/JSONB injection via tags field              | `tags: [{"$gt": ""}]`                                            | JSONB safely serialized by Drizzle ORM                 |
| PEN-14 | XSS via skill name (stored XSS)                   | `name: "<script>alert('xss')</script>"`                          | Stored as-is in DB, React auto-escapes on render       |
| PEN-15 | XSS via skill description                         | `description: "<img onerror='fetch(evil)' src=x>"`               | React auto-escapes, no dangerouslySetInnerHTML         |
| PEN-16 | XSS via prompt template (rendered in detail view) | `promptTemplate: "<script>...</script>"`                         | Rendered in `<pre>` with React escaping                |
| PEN-17 | Template injection via prompt template            | `promptTemplate: "{{constructor.constructor('return this')()}}"` | Prompt is raw text, not template-evaluated client-side |

### 10.3 Authentication & Session Attacks (OWASP #7)

| #      | Test Case                                           | Attack                         | Expected Defense                  |
| ------ | --------------------------------------------------- | ------------------------------ | --------------------------------- |
| PEN-18 | Expired token used for skill operations             | Expired JWT                    | 401 UnauthorizedError             |
| PEN-19 | Malformed JWT                                       | `Authorization: Bearer abc123` | 401 UnauthorizedError             |
| PEN-20 | Missing Authorization header on protected endpoints | No header                      | 401 UnauthorizedError             |
| PEN-21 | Token from deleted user                             | Valid JWT, user deleted        | 401 or operations fail gracefully |
| PEN-22 | Token with wrong secret/signature                   | Forged JWT                     | 401 UnauthorizedError             |

### 10.4 Business Logic Exploitation

| #      | Test Case                                                 | Attack                                            | Expected Defense                                                |
| ------ | --------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| PEN-23 | Race condition: favorite 100x simultaneously              | 100 concurrent POST /skills/:id/favorite          | favoriteCount === 1 (unique constraint)                         |
| PEN-24 | Race condition: fork + delete source simultaneously       | Concurrent fork + delete                          | Either fork succeeds and source deleted, or fork fails with 404 |
| PEN-25 | Visibility toggle spam                                    | Rapid private→public→private→public               | No data corruption, final state consistent                      |
| PEN-26 | Create skills to exhaust storage                          | Loop creating 10,000 skills                       | Rate limiting kicks in (429 TooManyRequestsError)               |
| PEN-27 | Fork chain attack: fork recursively to inflate counts     | Fork, make public, fork that, repeat              | forkedFromId always points to root, no amplification            |
| PEN-28 | Slug squatting: claim popular slugs across namespaces     | Create skills with slug="chatgpt", "openai", etc. | Per-user namespace — doesn't block others                       |
| PEN-29 | Favorite count manipulation via direct DB-style API calls | Attempt to set favoriteCount directly via PUT     | favoriteCount not in UpdateSkillDTO, server-controlled          |

### 10.5 Data Exposure & Information Leakage

| #      | Test Case                                                                      | Attack                                                               | Expected Defense                                              |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| PEN-30 | Timing attack: distinguish "skill exists but private" vs "skill doesn't exist" | Measure response time for 404 on private vs nonexistent              | Same response time (constant-time comparison)                 |
| PEN-31 | Error message leaks: do error messages reveal skill existence?                 | `GET /skills/{private-id}`                                           | Generic "Skill not found" — not "Skill exists but is private" |
| PEN-32 | Response body leaks: does community listing leak userId for private skills?    | Inspect full response JSON                                           | No private skill data in any field                            |
| PEN-33 | Prompt exfiltration: access prompts when showPrompts=false                     | Direct API call to skill detail                                      | promptTemplate=null in response                               |
| PEN-34 | Version history leaks prompts                                                  | `GET /skills/:id/versions` for showPrompts=false skill               | Version config redacted or endpoint requires access check     |
| PEN-35 | Bulk export: can attacker enumerate all public skills' prompts?                | Paginated GET with prompts visible                                   | Only showPrompts=true skills expose prompts                   |
| PEN-36 | Creator email exposure                                                         | Check if user email leaks through creatorDisplayName or API response | Only display name exposed, never email                        |

### 10.6 Rate Limiting & Denial of Service

| #      | Test Case                                  | Attack                               | Expected Defense                          |
| ------ | ------------------------------------------ | ------------------------------------ | ----------------------------------------- |
| PEN-37 | Brute force skill creation                 | 100 POST /skills in 1 minute         | Rate limit: 429 after threshold           |
| PEN-38 | Brute force forking                        | 50 POST /skills/:id/fork in 1 minute | Rate limit: 429 after 10/hour             |
| PEN-39 | Search with extremely long query           | `search: "a".repeat(10000)`          | Input validation: max length 200          |
| PEN-40 | Pagination abuse: request page_size=999999 | `limit=999999`                       | Server caps at max 100, ignores oversized |

---

## 11. Edge Case & Failure Scenario Tests

**File:** `packages/server/src/services/__tests__/skill.service.edge-cases.test.ts`

### 11.1 Boundary conditions

| #    | Test Case                              | Input                         | Expected                            |
| ---- | -------------------------------------- | ----------------------------- | ----------------------------------- |
| E-01 | Skill name at max length (255 chars)   | name = "a".repeat(255)        | Created successfully                |
| E-02 | Skill name exceeding max length        | name = "a".repeat(256)        | ValidationError                     |
| E-03 | Empty description                      | description = ""              | ValidationError (require non-empty) |
| E-04 | Description with only whitespace       | description = " "             | ValidationError                     |
| E-05 | Slug with hyphens and numbers          | slug = "my-skill-v2"          | Created successfully                |
| E-06 | Slug with uppercase (should normalize) | slug = "My-Skill"             | Normalized to "my-skill"            |
| E-07 | Tags array empty                       | tags = []                     | Created, tags = []                  |
| E-08 | Tags with 100 items                    | tags = Array(100).fill("tag") | Created or capped at max            |
| E-09 | Config with empty inputs array         | config.inputs = []            | Created successfully                |
| E-10 | Config with empty outputs array        | config.outputs = []           | Created successfully                |
| E-11 | Unicode in skill name                  | name = "SEO技巧"              | Created successfully                |
| E-12 | Emoji in skill name                    | name = "Rocket Launch 🚀"     | Created successfully                |

### 11.2 State transition edge cases

| #    | Test Case                                     | Input                                 | Expected                                                 |
| ---- | --------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| E-13 | Change visibility to current value (no-op)    | private → private                     | 200, no update timestamp change                          |
| E-14 | Delete skill then try to access by cached ID  | Delete, then GET                      | 404                                                      |
| E-15 | Fork skill, then source changes showPrompts   | Source toggles showPrompts after fork | Fork unaffected (independent copy)                       |
| E-16 | Update skill while someone else is forking it | Concurrent update + fork              | Fork gets pre-update or post-update version (both valid) |
| E-17 | Favorite a skill, then skill goes private     | Favorite, then owner sets private     | Favorite row remains but skill hidden in listing         |

### 11.3 Null / missing data handling

| #    | Test Case                                              | Input                     | Expected                                              |
| ---- | ------------------------------------------------------ | ------------------------- | ----------------------------------------------------- |
| E-18 | Skill with null userId (orphaned after user delete)    | userId = null             | Still visible if public, no creator attribution shown |
| E-19 | Skill with null creatorDisplayName                     | creatorDisplayName = null | UI shows "Unknown Creator" or similar fallback        |
| E-20 | Skill with null forkedFromId                           | Not a fork                | Normal behavior, no "Forked from" shown               |
| E-21 | Fork of deleted original (forkedFromId points to null) | forkedFromId → SET NULL   | Fork still works, "Forked from [deleted skill]" shown |
| E-22 | Favorite a skill with null userId                      | Orphaned skill            | Favorite still works if skill is public               |

---

## 12. Performance Tests

**File:** `packages/server/src/__tests__/perf/skill.perf.test.ts`

| #    | Test Case                                            | Setup                                      | Assertion                                       |
| ---- | ---------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| P-01 | Community listing with 1000 public skills, paginated | Seed 1000 skills                           | Response < 200ms, returns max page_size items   |
| P-02 | Community listing does NOT N+1 on creator info       | Seed 100 skills from 50 users              | Single query (denormalized), no user joins      |
| P-03 | Trending query performance                           | Seed 500 skills with usage data            | Response < 100ms (uses materialized usageCount) |
| P-04 | Search query with partial match on 1000 skills       | Seed 1000, search="cont"                   | Response < 300ms                                |
| P-05 | Favorite toggle is constant time                     | Seed skill with 10,000 favorites           | Toggle < 50ms                                   |
| P-06 | Fork operation completes atomically                  | Fork complex skill (20 inputs, 10 outputs) | < 500ms, all-or-nothing                         |

---

## 13. Frontend Component Tests

**File:** `packages/client/src/components/skills/__tests__/SkillCard.test.tsx`
**File:** `packages/client/src/pages/__tests__/SkillsCatalogPage.test.tsx`

### 13.1 SkillCard component

| #    | Test Case                                         | Expected                                   |
| ---- | ------------------------------------------------- | ------------------------------------------ |
| F-01 | Renders skill name, description, category badge   | All visible in DOM                         |
| F-02 | Shows "built-in" badge for builtin skills         | Badge present when source='builtin'        |
| F-03 | Shows visibility badge (Private/Unlisted/Public)  | Correct badge based on skill.visibility    |
| F-04 | Shows creator name for community skills           | creatorDisplayName rendered                |
| F-05 | Shows usage count badge for public skills         | "Used by N" visible                        |
| F-06 | Shows fork count for public skills                | "N forks" visible                          |
| F-07 | Shows "Forked from @creator/slug" attribution     | Link present when forkedFromId set         |
| F-08 | Edit button visible only when canEdit=true        | Conditional render                         |
| F-09 | Fork button visible on community skills (not own) | Button present for non-owner public skills |
| F-10 | Favorite button (heart icon) toggles state        | Filled/outline heart on click              |
| F-11 | Hover effect: card lifts with shadow              | CSS class applied on hover                 |

### 13.2 SkillsCatalogPage — tabs

| #    | Test Case                                                  | Expected                                |
| ---- | ---------------------------------------------------------- | --------------------------------------- |
| F-12 | Default tab is "My Workshop" when authenticated            | My Workshop tab active                  |
| F-13 | "Community" tab shows public skills from all users         | Different skill set                     |
| F-14 | Tab switch triggers correct API call                       | /skills/mine vs /skills/community       |
| F-15 | Category filters work within each tab                      | Filters applied to active tab's dataset |
| F-16 | Search works within each tab                               | Search scoped to active tab             |
| F-17 | Empty state for My Workshop: "Create your first skill" CTA | EmptyState component rendered           |
| F-18 | Empty state for Community: "No community skills yet"       | Appropriate message                     |
| F-19 | Loading skeleton shown during fetch                        | Spinner/skeleton visible                |

### 13.3 SkillDetail — prompt visibility

| #    | Test Case                                                 | Expected                             |
| ---- | --------------------------------------------------------- | ------------------------------------ |
| F-20 | Owner viewing own skill: prompts always visible           | Prompt section rendered              |
| F-21 | Non-owner, showPrompts=true: prompts visible              | Prompt section rendered              |
| F-22 | Non-owner, showPrompts=false: prompts hidden with message | "Creator has hidden prompts" message |
| F-23 | Visibility toggle shown for skill owner                   | Dropdown/toggle in detail view       |
| F-24 | showPrompts toggle shown for skill owner                  | Toggle in detail view                |
| F-25 | Fork button in detail view for non-owner public skills    | "Fork this skill" button             |

### 13.4 Trending section

| #    | Test Case                                        | Expected                     |
| ---- | ------------------------------------------------ | ---------------------------- |
| F-26 | Trending section renders at top of Community tab | Hero row with gradient cards |
| F-27 | Shows top 5 skills with usage sparklines         | Cards with visual data       |
| F-28 | Empty trending: section hidden (not empty state) | Section not rendered         |
| F-29 | Trending cards clickable → opens skill detail    | Navigation works             |

---

## 14. Test Data Factories

### Skill factory

```typescript
function createTestSkill(overrides: Partial<CreateSkillData> = {}): CreateSkillData {
  return {
    name: overrides.name ?? `Test Skill ${Date.now()}`,
    slug: overrides.slug ?? `test-skill-${Date.now()}`,
    description: overrides.description ?? 'A test skill for automated testing',
    category: overrides.category ?? 'generate',
    icon: overrides.icon ?? 'Zap',
    tags: overrides.tags ?? ['test'],
    config: overrides.config ?? createTestSkillConfig(),
  };
}

function createTestSkillConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    inputs: overrides.inputs ?? [
      { id: 'input-1', key: 'topic', type: 'text', label: 'Topic', required: true },
    ],
    outputs: overrides.outputs ?? [{ key: 'result', type: 'markdown', label: 'Result' }],
    promptTemplate: overrides.promptTemplate ?? 'Generate content about {{topic}}',
    systemPrompt: overrides.systemPrompt ?? 'You are a helpful assistant.',
    capabilities: overrides.capabilities ?? [],
    defaultProvider: overrides.defaultProvider ?? 'anthropic',
    defaultModel: overrides.defaultModel ?? 'claude-sonnet-4-5-20250514',
    temperature: overrides.temperature ?? 0.7,
    maxTokens: overrides.maxTokens ?? 4096,
  };
}
```

### User factory

```typescript
function createTestUser(overrides: Partial<TokenPayload> = {}): TokenPayload {
  const id = crypto.randomUUID();
  return {
    userId: overrides.userId ?? id,
    email: overrides.email ?? `test-${id}@example.com`,
    name: overrides.name ?? `Test User ${id.slice(0, 8)}`,
    role: overrides.role ?? 'User',
    subscriptionTier: overrides.subscriptionTier ?? 'free',
    isEmailVerified: overrides.isEmailVerified ?? true,
  };
}

function createAdminUser(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return createTestUser({ ...overrides, role: 'Administrator' });
}
```

### Multi-user scenario factory

```typescript
function createMarketplaceScenario() {
  const userA = createTestUser({ name: 'Creator Alice' });
  const userB = createTestUser({ name: 'Consumer Bob' });
  const admin = createAdminUser({ name: 'Admin Carol' });

  const privateSkill = createTestSkill({ name: 'Secret Recipe', slug: 'secret-recipe' });
  const publicSkill = createTestSkill({ name: 'SEO Researcher', slug: 'seo-researcher' });
  const unlistedSkill = createTestSkill({ name: 'Beta Tool', slug: 'beta-tool' });

  return { userA, userB, admin, privateSkill, publicSkill, unlistedSkill };
}
```

---

## 15. Regression Checklist

Before marking the marketplace feature complete, verify ALL of the following still work:

### Existing functionality (must not break)

- [ ] Builtin skills still visible to all users
- [ ] Skill creation flow (SkillCreatorPage) still works
- [ ] Skill editing flow still works for owners
- [ ] Skill deletion still works for owners
- [ ] Admin can still edit/delete any skill
- [ ] Skill version history still accessible
- [ ] GitHub import still works (imported skills default to private)
- [ ] Skill execution in orchestrations still works
- [ ] Category filtering still works
- [ ] Search still works
- [ ] SkillDetail view renders correctly for all skill types

### API response shape (must not change without shared type update)

- [ ] `GET /skills` response shape matches `Skill[]` type
- [ ] `GET /skills/:id` response shape matches `Skill` type
- [ ] `POST /skills` response shape matches `Skill` type
- [ ] `PUT /skills/:id` response shape matches `Skill` type
- [ ] Error responses match `ApiResponse` shape

### Database integrity

- [ ] All existing skills migrated to correct visibility value
- [ ] No orphaned skill_inputs or skill_outputs rows
- [ ] No orphaned skill_versions rows
- [ ] All FK indexes still present
- [ ] Existing unique constraint on slug updated to composite (userId, slug)

---

## 16. Test Matrix Summary

```
+===================================================================+
|                    TEST MATRIX SUMMARY                             |
+===================================================================+
| Category                    | Count | Priority | Files             |
+-----------------------------+-------+----------+-------------------+
| Hotfix (data leak)          |    17 | P0       | 2 test files      |
| Unit: Service layer         |    69 | P1       | 1 test file       |
| Unit: Shared types          |     8 | P1       | 1 test file       |
| Integration: API routes     |    72 | P1       | 1 test file       |
| Integration: DB constraints |    10 | P1       | 1 test file       |
| E2E: User flows             |     7 | P1       | 1 test file       |
| Penetration: Security       |    40 | P0       | 1 test file       |
| Edge cases & failures       |    22 | P2       | 1 test file       |
| Performance                 |     6 | P2       | 1 test file       |
| Frontend components         |    29 | P2       | 2 test files      |
+-----------------------------+-------+----------+-------------------+
| TOTAL                       |   280 | —        | 12 test files     |
+===================================================================+

IMPLEMENTATION ORDER:
  1. Hotfix tests (P0) — write + ship immediately
  2. Penetration tests (P0) — security validation
  3. Unit + Integration tests (P1) — core logic
  4. E2E tests (P1) — full flow validation
  5. Edge case + Performance + Frontend (P2) — polish

TEST FILE LOCATIONS:
  packages/server/src/services/__tests__/skill.service.hotfix.test.ts
  packages/server/src/services/__tests__/skill.service.test.ts
  packages/server/src/services/__tests__/skill.service.edge-cases.test.ts
  packages/server/src/routes/__tests__/skill.routes.hotfix.test.ts
  packages/server/src/routes/__tests__/skill.routes.test.ts
  packages/server/src/db/__tests__/skill.constraints.test.ts
  packages/server/src/__tests__/e2e/skill-marketplace.e2e.test.ts
  packages/server/src/__tests__/security/skill.pentest.test.ts
  packages/server/src/__tests__/perf/skill.perf.test.ts
  packages/shared/src/__tests__/skill.types.test.ts
  packages/client/src/components/skills/__tests__/SkillCard.test.tsx
  packages/client/src/pages/__tests__/SkillsCatalogPage.test.tsx
```

---

_Generated: 2026-04-05_
_Feature: Skill Marketplace — Privacy, Sharing & Community_
_Total test cases: 280 across 12 files_
