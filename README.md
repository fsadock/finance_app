# Finanças

Personal finance app for Brazil. It syncs bank accounts, credit cards and investments through **Open Finance
(Pluggy)**, categorizes transactions (deterministic Brazilian rules → your merchant rules → optional AI with
Claude), and gives you budgets, cash flow, card installments ("parcelas"), recurring bills and subscriptions,
goals, investments vs CDI/IPCA and an IRPF helper.

It is a **single-user app that runs on your machine**: one SQLite file, no login. The UI is in Portuguese (pt-BR, BRL).

- [Installation](#installation)
- [Usage](#usage)
- [How categorization works](#how-categorization-works)
- [How the numbers work](#how-the-numbers-work)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Development](#development)

---

## Installation

### 1. Prerequisites

| What | Why |
| --- | --- |
| **Node.js 24 (LTS)** and **pnpm 10** | `better-sqlite3` is a native module compiled for one Node major version. Use exactly Node 24. |
| **[mise](https://mise.jdx.dev)** (recommended) | Installs the pinned Node/pnpm versions from `mise.toml` automatically. |
| A **Pluggy** account | Bank/card sync (Open Finance Brasil). Required. |
| An **Anthropic API key with credits** | AI categorization and recurring detection. **Optional**: a Claude.ai subscription does *not* include API credits. |
| git | To clone and update the project. |

### 2. Get the code and dependencies

```bash
git clone <repo-url> finance_app
cd finance_app

mise install     # installs Node 24 + pnpm 10 (skip if you manage Node yourself)
pnpm install     # also generates the Prisma client
```

> Without mise, check `node -v` prints `v24.x` before `pnpm install`. If you install with another Node
> version and switch later, run `pnpm rebuild better-sqlite3`.

### 3. Create your Pluggy credentials

1. Create an account at [dashboard.pluggy.ai](https://dashboard.pluggy.ai).
2. Go to **Applications** and create an application.
3. Copy the **Client ID** (a UUID like `3f8e…-…`) and the **Client Secret**.

Check Pluggy's current plans and terms for how many connections your account allows.

### 4. (Optional) Create an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → **API Keys** and create a key.
2. Add credits under **Plans & Billing**. Categorization uses Claude Haiku, which is inexpensive, but the API does
   not work at all with a zero balance.

You can skip this: the app works without AI (see [Using the app without AI](#using-the-app-without-ai)).

### 5. Configure the environment

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
DATABASE_URL="file:./prisma/dev.db"      # where the SQLite database lives
PLUGGY_CLIENT_ID="your-client-id-uuid"
PLUGGY_CLIENT_SECRET="your-client-secret"
ANTHROPIC_API_KEY="sk-ant-..."           # optional — leave the placeholder to run without AI
```

`.env` and `*.db` are git-ignored. Never commit them.

### 6. Create the database

```bash
pnpm db:setup    # applies all migrations and seeds the category list
```

### 7. Run

```bash
pnpm dev                      # development, http://127.0.0.1:3000
```

or, for day-to-day use (faster pages):

```bash
pnpm build && pnpm start      # production, http://127.0.0.1:3000
```

Both bind to `127.0.0.1` on purpose: the app has **no authentication**, and its server actions are plain POST
endpoints. Don't expose it to your network or the internet. To use it from your phone, put it behind something that
authenticates you, e.g. `tailscale serve 3000` (reachable only inside your tailnet).

---

## Usage

### First-time setup (about 15 minutes)

1. **Connect your banks.** Open **Contas** → **Conectar conta**. Pluggy's widget opens; pick your bank, or
   **MeuPluggy** if you already connected your banks at meu.pluggy.ai, and authorize. When it closes, the app syncs
   automatically: accounts, card bills, up to 5 years of transactions and investments. Repeat for each bank.
   In development the widget also lists Pluggy's **sandbox** banks, handy for testing.

   **Connect the bank where your salary lands.** If you receive your salary elsewhere and move it by Pix, the
   app only sees a "Pix from your own CPF" and can't know it's income (see [limitations](#known-limitations)).

2. **Categorize what's pending.** On the **Dashboard**, the *Transações para revisar* card shows how many
   transactions still need a category. Click **Categorizar pendentes**: it applies the built-in rules, your rules,
   and then the AI (if configured) to everything pending. Without AI, categorize by hand (next step); every choice
   teaches the app.

3. **Review and correct.** Go to **Transações** → status *Revisar*, or scan the Dashboard list. Click a category
   to change it. The choice applies to every transaction from the same merchant and becomes a rule for future
   syncs (see [How categorization works](#how-categorization-works)). A Pix/TED that arrives with no counterparty
   name only changes that one transaction.

4. **Set budgets.** In **Categorias**, click *Definir orçamento* on a category and type the monthly limit
   (`1.234,56` or `1234.56` both work). A budget **applies from that month onward** until you change it.

5. **Set the card goal (optional).** On the **Dashboard**, under *Ritmo de Gastos*, click
   **Definir meta mensal de cartões**. Set how much you want to spend per month across your cards and the
   *Fechamento dia* (closing day, 1–28). The chart then shows card spending pace and a daily allowance.

6. **Check recurring items.** Open **Recorrentes**. Subscriptions, fixed bills and housing are listed with
   **cost per year**, what you paid in the last 12 months, and price-increase badges. Hover a row to **pause** what
   you cancelled or **delete** what isn't recurring.

7. **Create goals (optional).** **Metas** → **Nova meta**. Link a goal to an account (e.g. an emergency-fund
   account) and its progress follows that account's balance automatically.

### Routine

| When | What to do |
| --- | --- |
| Every few days | **Contas** → **Sincronizar** (syncs all connections and runs categorization). |
| After syncing | Dashboard → *Transações para revisar*: fix anything wrong or pending. |
| Monthly | **Categorias**: check budgets; use **Ajuste inteligente** to move leftover budget to overspent categories *for that month only*. Look at **Fluxo de Caixa** and **Recorrentes**. |
| Every ~11 months | **Contas** → *Conexões Open Finance*: renew consents before they expire (**Reconectar**). |
| Tax season (Mar–May) | **Imposto de Renda**: review the previous year. |

### Pages

| Page | What it's for |
| --- | --- |
| **Dashboard** | Month overview: free-to-spend (budget − spent − bills still due), spending vs budget, income, net worth, spending pace chart with card goal, top categories, transactions to review, cash flow, upcoming recurring items, budget progress. Use the month picker at the top. |
| **Transações** | Search (description, merchant or note), filter by category (including *Sem categoria*), account, direction (in/out/transfers), status and date range. Change categories, add **notes** and **tags**, undo a wrong **Transferência** pairing (hover the badge → ✕), paginate, and **export CSV** with the current filters (opens correctly in Excel). |
| **Categorias** | Spending vs budget per category, 6-month trend, create categories (**Nova categoria**; tick *É receita* for income categories), set budgets, toggle **rollover** (↻ icon: leftovers/overspend carry to next month), **Ajuste inteligente**. |
| **Fluxo de Caixa** | 12 months of income vs expenses, cumulative balance, and a Sankey diagram of where the selected month's money went. |
| **Contas** | Connections (status, last sync, consent expiry, errors, **Reconectar**), net worth history, balances by type, open card bill and closed bills, credit limit usage. The 👁 icon hides an account from all totals. |
| **Metas** | Savings goals with progress, deadline and the monthly amount needed. |
| **Investimentos** | Positions and allocation, live **CDI, Selic, IPCA** from the Banco Central, and a 10-year projection (CDI after tax, 100% CDI, IPCA + 6%). Change **aporte/mês** to your monthly contribution. |
| **Recorrentes** | Subscriptions, fixed bills and housing sorted by yearly cost, with price changes and "no recent charge" flags. Paused/ended items at the bottom. |
| **Parcelas** | Card purchases in installments: remaining amount, when each ends, and how much of each upcoming bill is already committed. |
| **Imposto de Renda** | Per calendar year: income by category and month, and deductible expenses (health, education, PGBL) grouped by payee with CNPJ/CPF. A helper for checking, not a substitute for official income statements and receipts. |
| **Regras** | Every merchant rule, where it came from (*Você* or *IA*) and how often it was used. Change the category (this turns it into your rule) or delete it. The *Zona de risco* at the bottom holds **Reclassificar com IA** and its undo. |

### Using the app without AI

Everything works without an Anthropic key except automatic categorization of *unknown* merchants and automatic
recurring detection:

- Built-in rules still classify own-account Pix, card bill payments, investment moves and balance yield.
- Your merchant rules still apply on every sync, so after you categorize a merchant once, it's automatic.
- New merchants stay in *Revisar* until you pick a category. The sync message shows *IA indisponível* when AI was
  skipped or failed.

---

## How categorization works

Each sync runs this pipeline on new transactions:

1. **Built-in Brazilian rules** (no AI):
   - Pix/TED **to your own CPF** → *Transferências* (your CPF comes from Pluggy's identity data). Money *arriving*
     from your own CPF is not decided here: it only becomes a transfer if it pairs with an outflow from one of your
     connected accounts.
   - Card credits like *PAGAMENTO RECEBIDO* / *PAGAMENTO*, and bank debits like *Pagamento de fatura* /
     *CardBankslip* → *Pagamento de fatura*.
   - *Aplicação/Resgate RDB/CDB*, *caixinha*, *Compra de criptomoedas / Renda Variável* → *Investimentos*.
   - Balance yield (*ValorRendimentoSaldoRemunerado*, *Valor de rendimento*) → *Rendimentos*.
   - Card installments are detected from Pluggy's card data (or *PARC 03/12* in the description) and re-dated so
     each installment lands in its own month.
2. **Transfer pairing:** an outflow and an inflow of the same amount (±0.5%) between two of your accounts within
   5 days become a transfer pair; money arriving on a card becomes *Pagamento de fatura*.
3. **Merchant rules** (the **Regras** page): each rule maps a merchant to a category. For generic descriptions
   like *Pix*, *TED* or *Bankslip*, the rule is keyed by the **counterparty's name**, so "Pix to the bakery" and
   "Pix to a friend" never share a rule. **Your** rules always win; AI never overwrites them.
4. **AI** (if configured): Claude Haiku classifies what's left using the description plus structured data (payment
   method, CPF/CNPJ counterparty, merchant, MCC, installment, the bank's own category). Answers with confidence
   ≥ 0.6 are applied; ≥ 0.8 are also saved as *IA* rules so that merchant never needs the AI again. Anything
   below 0.6 stays in *Revisar*.

After categorization, **recurring detection** links new charges to known recurring items and updates their next
dates (no AI), then uses AI (if configured) to detect new ones.

Buttons:

- **Categorizar pendentes** (Dashboard, Contas): runs steps 1–4 on *all* pending transactions. Keeps every rule.
- **Reclassificar com IA** (bottom of **Regras**, in the *Zona de risco*): deletes all *IA* rules and sends the
  transactions those rules categorized back through the AI. It is deliberately hard to trigger:
  1. **Ver o que seria alterado…** shows a preview first: how many rules get deleted, how many transactions go back to
     the AI (by category), and how many are protected. Your rules, categories you set directly, and built-in
     classifications (transfers, bill payments, investments, yield) are never touched.
  2. You must type `RECLASSIFICAR` (checked on the server too). Without an API key or credits the button stays
     blocked and nothing changes.
  3. A **restore point** is saved before any change. **Desfazer última reclassificação** restores the deleted rules
     and previous categories, keeping any merchant you re-categorized yourself afterwards.

  It spends API credits, so use it only after big changes to your category list.

---

## How the numbers work

- **Expense, refund, income.** Negative amounts are expenses. A positive amount in an **income category** (e.g.
  Salário, Rendimentos, Doações recebidas), or an uncategorized deposit into a bank account, is **income**. Any
  other positive amount (card *estornos*, a refund in an expense category) **reduces spending** instead of
  counting as income.
- **Excluded from spending:** transfers, card bill payments and investment moves (categories marked
  *excludeFromBudget*), so paying a card bill never counts your purchases twice.
- **Budgets carry forward** from the month you set them until changed. **Rollover** carries each month's leftover
  or overspend into the next (up to 6 months of history). **Ajuste inteligente** only changes the selected month.
- **Credit card cycle:** uses the closing day set on the Dashboard; otherwise Pluggy's close date; otherwise the
  last bill's due date minus 7 days.
- **Net worth history** comes from daily balance snapshots taken on every sync. Months before your first sync are
  estimated from cash flow (the chart says so).
- **Investment rates:** fetched from the Banco Central's public SGS API and cached for a day; reference values
  are used if it's unreachable.

---

## Maintenance

### Updating the app

```bash
git pull
pnpm install          # new dependencies + regenerated Prisma client
pnpm db:deploy        # apply new database migrations
pnpm build && pnpm start   # or restart `pnpm dev`
```

Always **restart the server after `pnpm install` or a migration**.

### Backups

All your data is in one file (`prisma/dev.db` by default). This copies it safely even while the app is running:

```bash
node -e "require('better-sqlite3')('prisma/dev.db', { readonly: true }).backup('prisma/backup.db').then(() => console.log('ok'))"
```

Keep copies outside the project folder. To restore, stop the app and put the backup file back as `prisma/dev.db`.

### Database scripts

| Script | What it does |
| --- | --- |
| `pnpm db:setup` | Apply migrations + seed categories (first install). |
| `pnpm db:deploy` | Apply pending migrations (after updating). |
| `pnpm db:seed` | Re-create missing default categories. Safe to run anytime. |
| `pnpm db:studio` | Browse and edit the raw database in Prisma Studio. |
| `pnpm db:wipe` | ⚠ Deletes **all** data (accounts, transactions, rules, budgets, goals, recurring items, connections). Keeps categories. Back up first. |
| `pnpm db:dedupe` | One-off cleanup for duplicate accounts created by old versions. |

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `better_sqlite3.node was compiled against a different Node.js version (NODE_MODULE_VERSION …)` | Wrong Node version. Use Node 24 (`mise install`), then `pnpm rebuild better-sqlite3`. |
| *Credenciais da Pluggy não configuradas* / `clientId must be a UUID` | `.env` still has placeholder Pluggy values. Fill them in and restart the server. |
| *IA indisponível: sem créditos na conta Anthropic* | The API key has no credits. Add credits, or keep using the app without AI. |
| *IA indisponível: ANTHROPIC_API_KEY inválida* | Wrong or revoked key. Create a new one. |
| `PrismaClientValidationError` about an unknown field after updating | Restart the server; if it persists, run `pnpm install && pnpm db:deploy`. |
| A connection shows *Credenciais inválidas*, *Aguardando ação* or an expired consent | **Contas** → **Reconectar** on that connection. |
| A card's current bill differs from the bank app | Pluggy can take days to deliver a newly closed bill. The app estimates from dates meanwhile. Setting the closing day on the Dashboard improves the estimate. |
| Income looks too low / months look negative | Your salary probably lands in an account that isn't connected. Connect it; on the first sync of a new bank, the app re-pairs transfers across your whole history. |
| Something failed during a sync | Sync and AI errors are logged to the server console (and `.next/dev/logs/next-development.log` in development). |

---

## Known limitations

- **Single user, no login.** Don't share one running instance: whoever opens it sees everything. Each person
  should run their own copy with their own Pluggy credentials and database.
- **Salary received in an unconnected bank** arrives as a Pix from your own CPF, indistinguishable from moving
  your own money. It goes to *Revisar* unless it pairs with an outflow. Connecting that bank fixes it.
- **One card closing day** is shared by all cards.
- **Duplicate transactions** can appear when a bank recreates a pending transaction with a new ID.
- **Deterministic rules** were written against real Nubank and BTG descriptions. Other banks may word things
  differently; those transactions fall back to your rules or AI.
- IRPF limits and categories are reference values. Always confirm against the Receita Federal rules for the year.

---

## Development

```bash
pnpm dev          # dev server with hot reload
pnpm check        # typecheck + lint + tests (run before committing)
pnpm test:watch   # tests in watch mode
pnpm db:migrate   # create a migration after editing prisma/schema.prisma
```

- Stack: Next.js 16 (App Router, server actions), React 19, Prisma 7 + SQLite (better-sqlite3 adapter),
  Tailwind CSS 4, Recharts, Pluggy SDK, Anthropic SDK (structured outputs), Vitest.
- This Next.js version has breaking changes from older ones. Read `node_modules/next/dist/docs/` before changing
  framework-level code (see `AGENTS.md`).

```
prisma/              schema, migrations, seed / wipe / dedupe scripts
src/app/             pages (App Router), API routes, server actions (src/app/actions)
src/components/      UI components
src/lib/             business logic: queries, flows (money model), budgets, billing, installments,
                     recurrence, brazil (BR parsing/rules), deterministic, transfers, rates (BCB), irpf,
                     transaction-filters, snapshots
src/lib/ai/          categorization and recurring detection (Claude)
src/lib/pluggy/      Pluggy client and sync pipeline
src/lib/__tests__/   unit tests for the pure logic
```
