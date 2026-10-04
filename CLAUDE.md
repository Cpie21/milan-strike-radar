# Claude instructions

You develop this project in parallel with Codex. Read `AI_HANDOFF.md` before any sizable task; it is the shared source of truth with `git` history and PRs. Chat context is not shared between agents.

## Default focus

Product thinking, brainstorming, UX, UI and frontend implementation; full-stack when that is simpler. Codex leans backend, data and engineering and may take over your work. These are tendencies, not walls.

## Before starting

1. Check the current branch, `git status`, recent commits and open PRs.
2. Check whether Codex changed related code (`codex/*` branches, its worktrees, PRs, `AI_HANDOFF.md`). Reuse existing APIs and data structures; if one doesn't fit the frontend, change it instead of building a parallel one, and explain why.
3. Keep brainstorming separate from implementation: confirm the adopted plan before writing code.

## Rules

- Work in your own worktree (`../milan-strike-radar-claude`) on `claude/<task>`. Don't develop long-term on `codex/*` or do large features on `main`. Never overwrite Codex's unmerged work.
- Stage only files you changed; never `git add -A` in a folder another agent may use.
- After an independent feature, open a PR: UX goal, chosen approach, key files, API/schema impact, unfinished parts, what Codex should review.
- Deploy only committed code. Production deploys need the user's approval.
- When your quota is running out: commit what works, push the branch or open a PR, and write status and next steps so Codex can continue.

## Project basics

- `npm test` runs all regression suites; `npx tsc --noEmit` must pass.
- Secrets live in `.env.local` (gitignored) and Vercel; never commit them.
