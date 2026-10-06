# Agent instructions (Codex)

You develop this project in parallel with Claude. Read `AI_HANDOFF.md` before any sizable task; it is the shared source of truth with `git` history and PRs. Chat context is not shared between agents.

## Default focus

Backend, data logic and engineering: sync, enrichment, timing evidence, APIs, schema, infrastructure. Claude leans product, UX and frontend. These are tendencies, not walls — finish a simple full-stack change yourself rather than splitting it.

## Before starting

1. Check the current branch, `git status`, recent commits and open PRs.
2. Check whether Claude changed related code (`claude/*` branches, PRs, `AI_HANDOFF.md`). Build on an existing implementation instead of re-implementing it.
3. Don't assume uncommitted files are yours.

## Rules

- Work in your own worktree on `codex/<task>`. Don't edit Claude's worktree or rewrite `claude/*` branches.
- Stage only files you changed; never `git add -A` in a folder another agent may use.
- Finish independently reviewable changes with a PR: problem, approach, key files, API/schema/core logic impact, unfinished work, and points for Claude to review. Prefer compatibility and small focused changes over unnecessary rewrites.
- Schema or API shape changes: describe them in the PR and in `AI_HANDOFF.md` — the frontend and `/api/ask` depend on them. Ship migrations in the PR that needs them.
- Deploy only committed code. Production deploys need the user's approval.
- When your quota is running out: commit what works, push the branch or open a PR, and write status and next steps so Claude can continue.

## Project basics

- `npm test` runs all regression suites; `npx tsc --noEmit` must pass.
- Secrets live in `.env.local` (gitignored) and Vercel; never commit them.

- All Gemini models are forbidden; translation must be free. Paid calls require a successful shared budget reservation; never fall back to unmetered spending.
