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

## Merchant rules (learning loop)
- [x] `MerchantRule` model (pattern unique, categoryId, confidence, source, hits)
- [x] `src/lib/ai/merchant.ts` `normalizeMerchant()` strips digits/diacritics/parc-info
- [x] Categorize flow: pass 1 looks up rules (free, instant, increments hits); pass 2 sends remainder to AI; high-confidence (≥0.8) AI results cached as new rules
- [x] UI message shows `X via regras salvas, Y via IA`

## Mock data wiped (2026-04-27)
- All seeded accounts/transactions/goals/recurrings/investments/budgets/merchant rules/pluggy items deleted via `pnpm db:wipe`
- `prisma/seed.ts` reduced to category-only taxonomy (idempotent upsert)
- Categories preserved (25 BR categories) so AI classifier has target labels
- Empty-state guards added to goals + investments page (NaN%)

## Period filter (2026-04-27)
- Pluggy sync: `from` extended from 90 days to 5 years back (Pluggy returns whatever the bank provides up to that window)
- `src/lib/period.ts`: `parsePeriod(value)` reads `?month=YYYY-MM` or defaults to current month
- `src/components/period-picker.tsx`: client component with prev/next chevrons, month + year selects, "Hoje" shortcut, navigates by updating `?month=` searchParam
- Wired on Dashboard, Categories, Transactions page headers
- Categories trend chart anchors to selected month (6-month rolling window ending at picked month)
- Transactions: `?month=` overrides `?from/?to` only if neither manual date is set

## Pluggy
- [x] `PLUGGY_CLIENT_ID` and `PLUGGY_CLIENT_SECRET` in `.env` (fixed double-underscore typo)
- [x] `src/lib/pluggy/client.ts` singleton wrapper (`pluggy-sdk` v0.85.2)
- [x] `src/lib/pluggy/sync.ts`:
  - `registerItem(itemId)` upserts `PluggyItem`
  - `syncItem(itemId)` pulls accounts (mapping AccountSubtype → our AccountType, credit cards stored negative), 90 days of transactions (paginated, dedup via `pluggyTxId`), investments (best-effort, non-fatal)
  - All synced tx land in `REVIEW` status so AI categorization can claim them
- [x] `POST /api/pluggy/connect-token` → returns `accessToken` for Connect widget (verified 200)
- [x] `POST /api/pluggy/sync` body `{itemId?}` → sync one item, or all known items if empty
- [x] `src/components/pluggy-connect-button.tsx`: lazy-loads CDN script, opens Connect widget, calls sync on success, refreshes UI
- [x] Buttons live on `/accounts` page header

## Next
- [ ] Server actions to manually edit tx category, status, goals, budgets
- [ ] Per-tx AI categorization with accept/reject UI (instead of blind apply)
- [ ] Date-range selector on dashboard
- [ ] Postgres migration path for production deploy
- [ ] Pluggy webhook endpoint for async item updates
- [ ] Cron-style auto-sync (e.g., daily)

## Resume guide
1. Read this file
2. `git log --oneline` for recent commits
3. `mise exec -- pnpm dev` to run app
4. `mise exec -- pnpm db:studio` to inspect DB
