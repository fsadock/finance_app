# Finance App — Progress Log

Checkpoint log for resuming across sessions. Always read top-down to learn current state.

## Stack
- Next.js 16.2 + React 19.2 + TypeScript + Tailwind v4 + Turbopack
- Prisma 7 (adapter-better-sqlite3) + SQLite (dev)
- @anthropic-ai/sdk for AI categorization & recurring detection
- recharts, lucide-react, date-fns, zod
- Toolchain via mise: node 22, pnpm latest. Always run with PATH=`/home/fsadock/.local/share/mise/installs/node/22.22.2/bin:/home/fsadock/.local/share/mise/installs/pnpm/latest:$PATH`

## Conventions
- BR market: BRL currency, pt-BR locale, Brazilian merchants/categories
- Money stored as Float (negative = spend, positive = income)
- Categories with `excludeFromBudget` skip budget calc (transfers, investments)
- Transaction status REVIEW = needs user/AI categorization

## Done
- [x] Repo init, .gitignore, mise.toml (node 22 + pnpm)
- [x] Next.js scaffold (TS, Tailwind v4, app router, src dir, turbopack)
- [x] Deps: prisma, anthropic, recharts, lucide, date-fns, zod, etc.
- [x] Prisma schema + initial migration → `dev.db`
- [x] Seed: 7 accounts, 25 categories, 11 recurrings, ~400 tx, 4 goals, 8 investments
- [x] `src/lib/db.ts` Prisma adapter singleton, `src/lib/queries.ts` helpers, `src/lib/format.ts` BRL/date
- [x] App shell: dark theme, sidebar (8 sections, pt-BR)
- [x] **All 8 pages built + smoke-tested HTTP 200**:
  - Dashboard: net worth, monthly spend gauge, income, cashflow chart, top categories donut, review queue, upcoming, goals
  - Transactions: filterable list (q/cat/status/from/to), 200 rows, totals
  - Categories: 6-month trend line chart + budget cards
  - Cashflow: 12-month bars + cumulative area + monthly table
  - Accounts: grouped by type with credit utilization bars
  - Goals: progress bars + monthly-needed calc
  - Investments: KPIs + diversification donut + 10-year projection (3 scenarios) + holdings table
  - Recurrings: subscriptions/bills/income split with monthly normalized totals + AI badge

## Done (cont.)
- [x] AI categorization service `src/lib/ai/categorize.ts` (claude-haiku-4-5, prompt-cached system prompt with category list)
- [x] AI recurring detection `src/lib/ai/recurrings.ts` (heuristic grouping by normalized merchant + amount stability, then Claude validates cadence)
- [x] API routes `/api/ai/categorize` `/api/ai/recurrings` (POST)
- [x] Dashboard "AI Actions" buttons (`src/components/ai-actions.tsx`) calling routes + `router.refresh()`

## Status
- Anthropic API: wired + key in `.env`. **Credits balance is empty** as of 2026-04-27 — endpoint returns 400 until topped up at console.anthropic.com/settings/billing. Code is functional.

## Next
- [ ] Pluggy SDK integration (awaiting client_id/client_secret)
- [ ] Server actions to manually edit tx category, status, goals, budgets
- [ ] Add account/goal/budget CRUD UIs
- [ ] Per-tx AI categorization with accept/reject UI (instead of blind apply)
- [ ] Date-range selector on dashboard (currently always "current month")
- [ ] Postgres migration path for production deploy

## Resume guide
1. Read this file
2. `git log --oneline` for recent commits
3. `mise exec -- pnpm dev` to run app
4. `mise exec -- pnpm db:studio` to inspect DB
