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
- [x] Prisma schema (Account, Category, Budget, Transaction, Goal, Recurring, Investment, PluggyItem)
- [x] Initial migration applied → `prisma/dev.db`
- [x] Seed script `prisma/seed.ts` with realistic BR mock data (7 accounts, 25 categories, 11 recurrings, ~400 transactions over 6 months, 4 goals, 8 investments)
- [x] `src/lib/db.ts` — Prisma client singleton with `PrismaBetterSqlite3` adapter

## Next
- [ ] App shell (sidebar nav, dark theme)
- [ ] Dashboard page
- [ ] Transactions, Categories, Cash flow, Accounts, Goals, Investments, Recurrings pages
- [ ] AI categorization service (Claude haiku-4-5)
- [ ] Pluggy SDK integration (awaiting keys)

## Resume guide
1. Read this file
2. `git log --oneline` for recent commits
3. `mise exec -- pnpm dev` to run app
4. `mise exec -- pnpm db:studio` to inspect DB
