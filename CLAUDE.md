# CLAUDE.md

Project Rules for Claude Code Project: Content Pilot

------------------------------------------------------------------------

# Project Overview

Content Pilot is a content operations platform built for creators, consultants, founders, and small teams who are tired of juggling disconnected tools just to stay visible online.

It combines the strategic clarity of a launch engine with the speed of a content repurposing system, giving users one place to plan, create, transform, schedule, and distribute content across multiple channels. Instead of forcing people to choose between "what should I say?" and "how do I get this everywhere?", Content Pilot handles both.

At its core, Content Pilot helps users turn a single idea into a complete content system. A long-form post, voice note, article, webinar, or product insight can be transformed into short-form posts, email copy, promotional snippets, captions, hooks, launch sequences, and platform-specific variations. It is designed to reduce the friction between ideation and execution, so content no longer gets stuck in drafts, scattered notes, or half-finished campaigns.

Where many tools focus only on publishing, Content Pilot is built around momentum. It does not just help users post more. It helps them move from idea to audience with intention. That means supporting the full workflow: content planning, repurposing, messaging refinement, campaign coordination, publishing cadence, and launch support. The result is a system that treats content as an asset, not a one-time activity.

Content Pilot is especially useful for people building a brand, launching an offer, growing a newsletter, promoting a service, or maintaining a consistent presence without hiring a full content team. It gives users a way to create once, adapt intelligently, and distribute with purpose.

------------------------------------------------------------------------

# Workflow Orchestration

## 1. Plan Mode Default

-   Enter plan mode for ANY non-trivial task (3+ steps or architectural
    decisions)
-   If something goes sideways, STOP and re-plan immediately --- do not
    keep pushing
-   Use plan mode for verification steps, not just building
-   Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

-   Use subagents liberally to keep main context window clean
-   Offload research, exploration, and parallel analysis to subagents
-   For complex problems, use multiple subagents for parallel reasoning
-   One task per subagent for focused execution

## 3. Self-Improvement Loop

-   After ANY correction from the user: update `tasks/lessons.md`
-   After ANY significant implementation, architectural decision, or
    non-obvious bug fix: record it in `tasks/lessons.md`
-   Format: Problem / Fix / Rule
-   Write rules that prevent repeating mistakes
-   Review lessons at session start

## 4. Verification Before Done

-   Never mark a task complete without proving it works
-   Diff behavior between main and your changes when relevant
-   Ask: "Would a staff engineer approve this?"
-   Run tests, check logs, demonstrate correctness
-   When any user-facing feature is added or modified, the corresponding
    `docs/` file must be created or updated before the task is marked
    complete

## 5. Demand Elegance (Balanced)

-   For non-trivial changes ask: "Is there a more elegant solution?"
-   If a fix feels hacky, refactor before presenting
-   Avoid over-engineering simple problems

## 6. Autonomous Bug Fixing

-   When given a bug report: investigate logs and errors and resolve it
-   Do not require the user to guide debugging steps
-   Fix failing tests and CI issues independently when possible

## 7. Testing Standards

Act as a senior QA engineer. Test at the smallest level possible.

When a new feature is added, generate:

1.  Unit tests — for services, utilities, and pure functions
2.  Integration tests — for API routes with real database
3.  End-to-end tests — for full user flows
4.  Edge cases and failure scenarios

Rules:

-   Every new service function needs a unit test
-   Every new API endpoint needs an integration test
-   Every user-facing feature needs at least one E2E test
-   Test the unhappy path: invalid input, missing auth, rate limits,
    edge cases

### Regression Testing Protocol

After every new feature, before marking work complete:

1. Run the full test suite: `pnpm test`
2. Run integration tests: `pnpm test:integration`
3. Check for TypeScript errors: `pnpm tsc`
4. If any DB schema changes were made, run `drizzle-kit push` (from `packages/server/`) to sync the remote database
5. Smoke test all affected routes and list them in your task summary
6. Confirm no existing tests were broken, modified, or deleted without justification
7. Report pass/fail results before closing the task

Never consider a feature done until all existing tests pass and the database schema is in sync.    

## 8. Enterprise Code Quality

Every change must meet production-grade standards:

-   No shortcuts, workarounds, or "good enough" implementations
-   Every feature must be tested end-to-end before marking complete
-   Error handling must be specific and actionable (no generic messages)
-   Configuration must be admin-controllable (no hardcoded values that
    users need to change)
-   API keys and credentials must be database-driven via the
    Integrations panel
-   UI changes must refresh immediately without requiring a page reload
-   Unused or experimental code must not ship — verify all code paths
    work
-   When integrating any external API, make a real test call during
    implementation to verify the endpoint/model/key works


# Architecture Principles

The system must follow:

-   Separation of concerns
-   Modular architecture
-   Maintainable code
-   Scalable services
-   Clear folder structure

Frontend, backend, AI services, prompts, and knowledge content must
remain separated.

------------------------------------------------------------------------

# Project Folder Structure

This is a **pnpm monorepo**. All application code lives under `packages/`.

    culinaire-kitchen/

    packages/
      client/
        src/
          components/
          pages/
          context/
          hooks/
          styles/
      server/
        src/
          routes/
          controllers/
          services/
          db/            ← Drizzle ORM schema + migrations (no models/ folder)
          middleware/
          utils/
      shared/
        src/
          types/
          utils/
    prompts/
      chatbot/

    docs/
      architecture/
      specs/

    tasks/
      todo.md
      lessons.md

Claude must follow this structure when generating code. Never create
files under `client/`, `server/`, or `shared/` at the repo root —
always use `packages/client/`, `packages/server/`, `packages/shared/`.

------------------------------------------------------------------------

# Separation of Concerns

## Frontend

Location:

    packages/client/src/

Responsibilities:

-   UI rendering
-   chat interface
-   API communication
-   state management

Rules:

-   HTML contains structure only
-   CSS contains styling only
-   JavaScript handles UI behavior
-   No business logic allowed

------------------------------------------------------------------------

## Backend

Location:

    packages/server/src/

Responsibilities:

-   API endpoints
-   request validation
-   authentication
-   orchestration of services

Backend must never contain frontend UI logic.

------------------------------------------------------------------------

## Services Layer

Location:

    packages/server/src/services/

Examples:

-   aiService
-   chatService
-   knowledgeService

Responsibilities:

-   domain logic
-   AI integration
-   knowledge retrieval

------------------------------------------------------------------------

## Routes

Location:

    packages/server/src/routes/

Routes must remain thin.

They should:

-   receive requests
-   call controllers
-   return responses

------------------------------------------------------------------------

## Controllers

Location:

    packages/server/src/controllers/

Responsibilities:

-   validate input
-   call services
-   format responses

Controllers must not contain heavy business logic.

------------------------------------------------------------------------

## Database / Models

Location:

    packages/server/src/db/

The project uses **Drizzle ORM** with PostgreSQL. There is no `models/`
folder. Database entities (User, Conversation, Message, etc.) are
defined as Drizzle table schemas in `packages/server/src/db/schema.ts`.
Migrations are managed via `drizzle-kit` and output to
`packages/server/drizzle/`.


# API Design

Example endpoint:

    POST /api/chat

Request:

    { "message": "How do I write AI Governance?" }

Response:

    { "response": "...", "sources": [] }

# AI Integration

AI service location:

    packages/server/src/services/aiService.ts

Responsibilities:

-   construct prompts
-   call LLM APIs
-   return responses

Routes must never call LLM APIs directly.

------------------------------------------------------------------------

# Security Guidelines

-   Store API keys in environment variables
-   Never commit secrets
-   Validate all request inputs
-   Sanitize user data
-   Implement rate limiting

------------------------------------------------------------------------

# Documentation

Documentation location:

    docs/

Structure:

    docs/
      architecture/
      specs/

------------------------------------------------------------------------

# Code Quality Rules

-   Keep files small and focused
-   Prefer modular functions
-   Avoid deeply nested logic
-   Use descriptive variable names
-   Avoid duplicated logic

------------------------------------------------------------------------

# When Generating Code

Claude must:

-   follow the folder structure
-   maintain separation of concerns
-   keep files modular
-   avoid monolithic code
-   generate production-quality implementations

# Security and Testing Standards

Security must be considered during development, not after.

All new functionality must include security review and testing aligned with OWASP principles.

## Security Review Requirements

When generating or modifying code:

- Review for common vulnerabilities
- Validate input handling
- Ensure proper authentication and authorization
- Prevent injection vulnerabilities
- Avoid hardcoded secrets
- Validate external dependencies
- Ensure secure configuration defaults

## OWASP Risk Categories

Code and APIs must be reviewed for the following classes of risk:

1. Broken Access Control
2. Cryptographic Failures
3. Injection Vulnerabilities
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable or Outdated Components
7. Authentication Failures
8. Software and Data Integrity Failures
9. Logging and Monitoring Failures
10. Server-Side Request Forgery (SSRF)

## Security Testing Expectations

When implementing a feature Claude must generate:

- Unit tests for validation logic
- Integration tests for API and service communication
- Security tests for malicious inputs
- Authentication and authorization tests
- Edge-case and failure scenario tests

## Threat Modeling

For new features Claude should evaluate:

- potential attack surfaces
- privilege escalation risks
- data exposure risks
- abuse scenarios

## Secure Coding Practices

Claude must prefer:

- parameterized queries
- strict input validation
- least privilege access
- strong encryption libraries
- environment variables for secrets
- dependency vulnerability checks

## Security First Principle

If a feature introduces security risk, Claude must:

- flag the risk
- propose a safer implementation
- document the mitigation

------------------------------------------------------------------------

# Git Workflow

Solo developer. `main` is the production branch — Railway auto-deploys on every push to it.

## Rules

- **MANDATORY**: Always ask for explicit user confirmation before running `git push`. Never push automatically.
- Work in a **feature branch** for anything beyond a 2-file change
- Merge to `main` with `--no-ff` when the feature is tested and ready to deploy
- For small bug fixes or config changes, commit directly to `main`
- For production hotfixes, use a `hotfix/` branch

## Branch Naming

    feature/translation-layer-editor
    fix/guest-session-timeout
    hotfix/stripe-webhook-failure

## Merge Flow

    git checkout -b feature/my-feature
    # ... work and commit ...
    git checkout main
    git merge feature/my-feature --no-ff
    git push origin main
    git branch -d feature/my-feature

## Commit Message Format

    <verb> <area>: <detail>

    Examples:
    Add content parsing endpoint
    Fix streaming burst mode: selfHandleResponse in Vite proxy
    Update usage middleware: replace console.log with pino logger

## Never

- Push to any remote without explicit user confirmation
- Push broken code to `main`
- Commit `.env` files or secrets
- Use PRs for solo work (unnecessary overhead)
