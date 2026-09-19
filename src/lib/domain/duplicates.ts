type Tx = { accountId: string; date: Date; amount: number; description: string };

const isMidnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
const dayKey = (t: Tx) => `${t.accountId}|${t.amount}|${t.description}|${t.date.getFullYear()}-${t.date.getMonth()}-${t.date.getDate()}`;

/**
 * Some connectors (Nubank via Meu Pluggy) send a card payment twice: once date-only (midnight) and once
 * with its real time. Returns the date-only copies that have a timed twin (same account, amount,
 * description and day). Two timed transactions are never duplicates — e.g. two identical Uber rides.
 */
export function dateOnlyDuplicates<T extends Tx>(txs: T[]): T[] {
  const timed = new Set(txs.filter((t) => !isMidnight(t.date)).map(dayKey));
  return txs.filter((t) => isMidnight(t.date) && timed.has(dayKey(t)));
}
