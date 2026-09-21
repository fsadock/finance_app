<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# How to work on this project

The owner's standing request, and the bar for every change:

> "dê uma lida geral no projeto e veja se tudo está organizado, não tem codigo duplicado ou não usado, tudo está segregado como os melhores padroes de software exigem e me retorne. Eu quero que esse projeto fique limpo e não pareça gambiarra em cima de gambiarra (feature em cima de feature) sem pensar no que já foi feito"

What that means in practice:

- **Fix the cause, generally.** A bug report about one purchase, merchant or screen is an example of a rule that is wrong. Never special-case a merchant, account or record, and never edit someone's data by hand to make a screen look right.
- **Keep the bank's data as it came.** Transactions from Open Finance (Pluggy) are the source of truth: don't rewrite their dates, amounts or descriptions to "correct" them. Interpret them when reading (grouping, labels), and show the original.
- **Look at what exists before adding.** Reuse or extend the module that already owns the concern; if two places need the same rule, it lives once. Remove what a change makes unused.
- **Respect the layers** (see README → Development): pages read through `lib/data/`, rules live in `lib/domain/` (no database, no network), processing that writes lives in `lib/jobs/`, `lib/ai/` only calls the API, UI pieces shared by pages live in `components/ui/`.
- **Prove it doesn't break.** `pnpm check` and `pnpm unused` must pass; new rules get tests with the real case that exposed them; check behavior changes against a copy of real data before deploying.
