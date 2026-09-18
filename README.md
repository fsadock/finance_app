# Finanças

Personal finance app for Brazil. It syncs bank accounts, credit cards and investments through **Open Finance (Pluggy)**, categorizes transactions (deterministic Brazilian rules → your merchant rules → optional AI with Claude), and gives you budgets, cash flow, card installments ("parcelas"), recurring bills and subscriptions, goals, investments vs CDI/IPCA and an IRPF helper.

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

### Quick install (no Node.js needed)

Download the project ([**Code → Download ZIP**](https://github.com/fsadock/finance_app/archive/refs/heads/main.zip) on GitHub), extract it, then:

| System | Install | Open the app |
| --- | --- | --- |
| **Windows** | Double-click `install.bat` | Double-click `start.bat` |
| **macOS / Linux** | In a terminal inside the folder: `bash install.sh` | `bash start.sh` |

The installer downloads a private copy of Node.js 24 into `.runtime/` (no admin rights; it doesn't touch any Node.js you already have), installs dependencies with pnpm, creates `.env`, prepares the database and builds the app. It needs about 1.2 GB of disk and a few minutes. The app opens at <http://127.0.0.1:3000> on the setup screen ([step 6](#6-finish-on-the-setup-screen)); keep the window open while you use it.

**Updating:** close the app, replace the files with the new version (keep `prisma/dev.db` and `.env`), and run the installer again. It backs up the database to `prisma/backups/` before applying migrations.

<details>
<summary>Security warnings on first run</summary>

- **Windows:** SmartScreen may show *"O Windows protegeu o computador"*. Click **Mais informações → Executar assim mesmo**.
- **macOS:** if the terminal refuses to run the file, run `xattr -dr com.apple.quarantine .` inside the folder once.

The scripts aren't signed. Read them first if you like; they only touch this folder.
</details>

### Docker (starts with the computer)

If you have Docker, this runs the app in the background and brings it back every time the computer starts, with no terminal window to keep open. Docker itself must start at boot (on Linux: `sudo systemctl enable --now docker`; Docker Desktop: *Start Docker Desktop when you sign in*).

```bash
docker compose up -d --build    # build and start; open http://127.0.0.1:3100
```

The data lives in the Docker volume `financas_data` (`/data/finance.db` inside the container), not in `prisma/dev.db`. The port is published on `127.0.0.1` only, because the app has no login. It uses port 3100 (3000 is often taken by other tools); to change it: `FINANCAS_PORT=3200 docker compose up -d`. A `.env` file, if present, is passed to the container for credentials; its `DATABASE_URL` is ignored.

| Task | Command |
| --- | --- |
| Logs | `docker compose logs -f` |
| Update | `git pull && docker compose up -d --build` (migrations run on start; the database is backed up to `/data/backups/` first) |
| Stop (won't come back on boot) | `docker compose stop` · start again with `docker compose up -d` |
| Back up | `docker compose exec app node -e "require('better-sqlite3')('/data/finance.db',{readonly:true}).backup('/data/manual-backup.db')"` then `docker compose cp app:/data/manual-backup.db ./finance-backup.db` |
| Remove the app **and its data** | `docker compose down -v` |

<details>
<summary>Moving an existing <code>prisma/dev.db</code> into Docker</summary>

Stop the non-Docker app first (so the file isn't being written), then:

```bash
docker compose up --no-start --build                   # create the container and its empty volume
docker compose cp -a prisma/dev.db app:/data/finance.db
docker compose up -d
```

`prisma/dev.db` is left untouched; from now on the container's copy is the one in use.
</details>

<details>
<summary>Daily backups to a folder outside Docker (optional)</summary>

The container only backs up by itself before migrations, into the same volume as the data, so `docker compose down -v` or a lost volume takes both. To keep a daily copy in a normal folder (here `~/Backups/financas`, last 30 days), on Linux with systemd:

1. Save this as `~/.local/bin/financas-backup` and run `chmod +x ~/.local/bin/financas-backup` (adjust the project path):

   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cd ~/repos/finance_app                  # where compose.yaml is
   dest=~/Backups/financas
   mkdir -p "$dest"
   docker compose exec -T app node -e "require('better-sqlite3')('/data/finance.db',{readonly:true}).backup('/data/daily-backup.db')"
   docker compose cp app:/data/daily-backup.db "$dest/finance-$(date +%Y%m%d).db"
   find "$dest" -name 'finance-*.db' -mtime +30 -delete
   ```

2. Save this as `~/.config/systemd/user/financas-backup.service`:

   ```ini
   [Unit]
   Description=Back up the Finanças database

   [Service]
   Type=oneshot
   ExecStart=%h/.local/bin/financas-backup
   ```

3. Save this as `~/.config/systemd/user/financas-backup.timer`:

   ```ini
   [Unit]
   Description=Daily Finanças backup

   [Timer]
   OnCalendar=daily
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

4. Enable it and run it once to check:

   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now financas-backup.timer
   systemctl --user start financas-backup.service && ls ~/Backups/financas
   ```

`Persistent=true` catches up on a missed day the next time you log in. Your user must be able to run `docker` without sudo (member of the `docker` group). The files contain your data and API keys: keep the folder private. To restore one, see [Backups](#backups) and copy it back with `docker compose cp -a <file> app:/data/finance.db` while the app is stopped (`docker compose stop`, then `docker compose start`).
</details>

The steps below are the manual install, for development or if you manage Node.js yourself.

### 1. Prerequisites

| What | Why |
| --- | --- |
| **Node.js 24 (LTS)** and **pnpm 10** | `better-sqlite3` is a native module compiled for one Node major version. Use exactly Node 24. |
| **[mise](https://mise.jdx.dev)** (recommended) | Installs the pinned Node/pnpm versions from `mise.toml` automatically. |
| A **Pluggy** account | Bank/card sync (Open Finance Brasil). Required; created during setup (step 6). |
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

### 3. Create the environment file

```bash
cp .env.example .env
```

The only value you need here is the database location (the default is fine). Credentials are entered in the app's **setup screen** (step 6). `.env` and `*.db` are git-ignored; never commit them.

<details>
<summary>Prefer configuring credentials in <code>.env</code>?</summary>

```dotenv
PLUGGY_CLIENT_ID="your-client-id-uuid"
PLUGGY_CLIENT_SECRET="your-client-secret"
ANTHROPIC_API_KEY="sk-ant-..."           # optional
```

Values saved on the setup screen take priority over `.env`; placeholders are ignored.
</details>

### 4. Create the database

```bash
pnpm db:setup    # applies all migrations and seeds the category list
```

### 5. Run

```bash
pnpm dev                      # development, http://127.0.0.1:3000
```

or, for day-to-day use (faster pages):

```bash
pnpm build && pnpm start      # production, http://127.0.0.1:3000
```

### 6. Finish on the setup screen

Open <http://127.0.0.1:3000>. On first run the app opens **/setup**, a three-step wizard:

1. **Pluggy** — create an account at [dashboard.pluggy.ai](https://dashboard.pluggy.ai), create an application under **Applications**, and paste its **Client ID** (a UUID) and **Client Secret**. The app tests them against Pluggy before saving. Personal use through Meu Pluggy is free; check Pluggy's current plans.
2. **AI (optional)** — paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com), or skip. The key is tested with a one-token call, so a missing credit balance shows up right away. A Claude.ai subscription does *not* include API credits. See [Using the app without AI](#using-the-app-without-ai).
3. **Connect your banks** — connect them at [meu.pluggy.ai](https://meu.pluggy.ai), then click **Conectar conta** and choose **MeuPluggy**.

Change or re-test credentials anytime in **Configurações** (sidebar). They are stored in the local database, so a **database backup also contains your keys** — keep backups private.

Both bind to `127.0.0.1` on purpose: the app has **no authentication**, and its server actions are plain POST endpoints. Don't expose it to your network or the internet. To use it from your phone, put it behind something that authenticates you, e.g. `tailscale serve 3000` (reachable only inside your tailnet).

---

## Usage

### First-time setup (about 15 minutes)

1. **Connect your banks.** Finish the [setup screen](#6-finish-on-the-setup-screen), or open **Contas** → **Conectar conta**. Pluggy's widget opens; pick your bank, or **MeuPluggy** if you already connected your banks at meu.pluggy.ai, and authorize. When it closes, the app syncs automatically: accounts, card bills, up to 5 years of transactions and investments. Repeat for each bank. In development the widget also lists Pluggy's **sandbox** banks, handy for testing.

   **Connect the bank where your salary lands.** If you receive your salary elsewhere and move it by Pix, the app only sees a "Pix from your own CPF" and can't know it's income (see [limitations](#known-limitations)).

2. **Categorize what's pending.** On the **Dashboard**, the *Transações para revisar* card shows how many transactions still need a category. Click **Categorizar pendentes**: it applies the built-in rules, your rules, and then the AI (if configured) to everything pending. Without AI, categorize by hand (next step); every choice teaches the app.

3. **Review and correct.** Go to **Transações** → status *Revisar*, or scan the Dashboard list. Click a category to change it. The choice applies to every transaction from the same merchant and becomes a rule for future syncs (see [How categorization works](#how-categorization-works)). A Pix/TED that arrives with no counterparty name only changes that one transaction.

4. **Set budgets.** In **Categorias**, click *Definir orçamento* on a category and type the monthly limit (`1.234,56` or `1234.56` both work). A budget **applies from that month onward** until you change it.

5. **Set the card goal (optional).** On the **Dashboard**, under *Ritmo de Gastos*, click **Definir meta mensal de cartões**. Set how much you want to spend per month across your cards and the *Fechamento dia* (closing day, 1–28). The chart then shows card spending pace and a daily allowance.

6. **Check recurring items.** Open **Recorrentes**. Subscriptions, fixed bills and housing are listed with **cost per year**, what you paid in the last 12 months, and price-increase badges. Hover a row to **pause** what you cancelled or **delete** what isn't recurring.

7. **Create goals (optional).** **Metas** → **Nova meta**. Link a goal to an account (e.g. an emergency-fund account) and its progress follows that account's balance automatically.

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

Everything works without an Anthropic key except automatic categorization of *unknown* merchants and automatic recurring detection:

- Built-in rules still classify own-account Pix, card bill payments, investment moves and balance yield.
- Your merchant rules still apply on every sync, so after you categorize a merchant once, it's automatic.
- New merchants stay in *Revisar* until you pick a category. Without a key, AI steps are skipped silently; with a key that fails (e.g. no credits), the sync message shows *IA indisponível*.

---

## How categorization works

Each sync runs this pipeline on new transactions:

1. **Built-in Brazilian rules** (no AI):
   - Pix/TED **to your own CPF** → *Transferências* (your CPF comes from Pluggy's identity data). Money *arriving* from your own CPF is not decided here: it only becomes a transfer if it pairs with an outflow from one of your connected accounts.
   - Card credits like *PAGAMENTO RECEBIDO* / *PAGAMENTO*, and bank debits like *Pagamento de fatura* / *CardBankslip* → *Pagamento de fatura*.
   - *Aplicação/Resgate RDB/CDB*, *caixinha*, *Compra de criptomoedas / Renda Variável* → *Investimentos*.
   - Balance yield (*ValorRendimentoSaldoRemunerado*, *Valor de rendimento*) → *Rendimentos*.
   - Card installments are detected from Pluggy's card data (or *PARC 03/12* in the description) and re-dated so each installment lands in its own month.
2. **Transfer pairing:** an outflow and an inflow of the same amount (±0.5%) between two of your accounts within 5 days become a transfer pair; money arriving on a card becomes *Pagamento de fatura*.
3. **Merchant rules** (the **Regras** page): each rule maps a merchant to a category. For generic descriptions like *Pix*, *TED* or *Bankslip*, the rule is keyed by the **counterparty's name**, so "Pix to the bakery" and "Pix to a friend" never share a rule. **Your** rules always win; AI never overwrites them.
4. **AI** (if configured): Claude Haiku classifies what's left using the description plus structured data (payment method, CPF/CNPJ counterparty, merchant, MCC, installment, the bank's own category). Answers with confidence ≥ 0.6 are applied; ≥ 0.8 are also saved as *IA* rules so that merchant never needs the AI again. Anything below 0.6 stays in *Revisar*.

After categorization, **recurring detection** links new charges to known recurring items and updates their next dates (no AI), then uses AI (if configured) to detect new ones.

Buttons:

- **Categorizar pendentes** (Dashboard, Contas): runs steps 1–4 on *all* pending transactions. Keeps every rule.
- **Reclassificar com IA** (bottom of **Regras**, in the *Zona de risco*): deletes all *IA* rules and sends the transactions those rules categorized back through the AI. It is deliberately hard to trigger:
  1. **Ver o que seria alterado…** shows a preview first: how many rules get deleted, how many transactions go back to the AI (by category), and how many are protected. Your rules, categories you set directly, and built-in classifications (transfers, bill payments, investments, yield) are never touched.
  2. You must type `RECLASSIFICAR` (checked on the server too). Without an API key or credits the button stays blocked and nothing changes.
  3. A **restore point** is saved before any change. **Desfazer última reclassificação** restores the deleted rules and previous categories, keeping any merchant you re-categorized yourself afterwards.

  It spends API credits, so use it only after big changes to your category list.

---

## How the numbers work

- **Expense, refund, income.** Negative amounts are expenses. A positive amount in an **income category** (e.g. Salário, Rendimentos, Doações recebidas), or an uncategorized deposit into a bank account, is **income**. Any other positive amount (card *estornos*, a refund in an expense category) **reduces spending** instead of counting as income.
- **Excluded from spending:** transfers, card bill payments and investment moves (categories marked *excludeFromBudget*), so paying a card bill never counts your purchases twice.
- **Budgets carry forward** from the month you set them until changed. **Rollover** carries each month's leftover or overspend into the next (up to 6 months of history). **Ajuste inteligente** only changes the selected month.
- **Credit card cycle:** uses the closing day set on the Dashboard; otherwise Pluggy's close date; otherwise the last bill's due date minus 7 days.
- **Net worth history** comes from daily balance snapshots taken on every sync. Months before your first sync are estimated from cash flow (the chart says so).
- **Investment rates:** fetched from the Banco Central's public SGS API and cached for a day; reference values are used if it's unreachable.

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
| *Credenciais da Pluggy não configuradas* / *client keys are invalid* | Open **Configurações** and enter valid Pluggy credentials (they are tested before saving). |
| *IA indisponível: sem créditos na conta Anthropic* | The API key has no credits. Add credits, or remove the key in **Configurações** and use the app without AI. |
| *IA indisponível: chave da Anthropic inválida ou revogada* | Create a new key and save it in **Configurações**. |
| `PrismaClientValidationError` about an unknown field after updating | Restart the server; if it persists, run `pnpm install && pnpm db:deploy`. |
| A connection shows *Credenciais inválidas*, *Aguardando ação* or an expired consent | **Contas** → **Reconectar** on that connection. |
| A card's current bill differs from the bank app | Pluggy can take days to deliver a newly closed bill. The app estimates from dates meanwhile. Setting the closing day on the Dashboard improves the estimate. |
| Income looks too low / months look negative | Your salary probably lands in an account that isn't connected. Connect it; on the first sync of a new bank, the app re-pairs transfers across your whole history. |
| Something failed during a sync | Sync and AI errors are logged to the server console (and `.next/dev/logs/next-development.log` in development). |

---

## Known limitations

- **Single user, no login.** Don't share one running instance: whoever opens it sees everything. Each person should run their own copy with their own Pluggy credentials and database.
- **Salary received in an unconnected bank** arrives as a Pix from your own CPF, indistinguishable from moving your own money. It goes to *Revisar* unless it pairs with an outflow. Connecting that bank fixes it.
- **One card closing day** is shared by all cards.
- **Duplicate transactions** can appear when a bank recreates a pending transaction with a new ID.
- **Deterministic rules** were written against real Nubank and BTG descriptions. Other banks may word things differently; those transactions fall back to your rules or AI.
- IRPF limits and categories are reference values. Always confirm against the Receita Federal rules for the year.

---

## Development

```bash
pnpm dev          # dev server with hot reload
pnpm check        # typecheck + lint + tests (run before committing)
pnpm test:watch   # tests in watch mode
pnpm db:migrate   # create a migration after editing prisma/schema.prisma
```

- Stack: Next.js 16 (App Router, server actions), React 19, Prisma 7 + SQLite (better-sqlite3 adapter), Tailwind CSS 4, Recharts, Pluggy SDK, Anthropic SDK (structured outputs), Vitest.
- This Next.js version has breaking changes from older ones. Read `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

```text
prisma/              schema, migrations, seed / wipe / dedupe scripts
src/app/             pages (App Router), API routes, server actions (src/app/actions)
src/components/      UI components
src/lib/domain/      pure rules, no database or network: money model (flows), Brazil (brazil), recurrence,
                     installments, billing cycles, budgets, IRPF, goals, investments, merchant keys, formatting
src/lib/data/        everything pages read, one module per subject (spending, cashflow, cards, recurrings…)
src/lib/jobs/        processing that writes derived data; pipeline.ts runs after every sync:
                     deterministic rules → transfers → categorize → recurrings
src/lib/pluggy/      Pluggy client and data import
src/lib/ai/          Claude calls only: category suggestions and recurring detection
src/lib/infra/       database, config and credentials, logger, retry, rate limit
src/lib/__tests__/   unit tests for the pure logic
```

Rules that keep it that way: pages call `data/` (never the database directly), `domain/` imports neither the database nor `ai/`, and `ai/` only talks to the API. `pnpm unused` (knip) lists unused files, exports and dependencies.
