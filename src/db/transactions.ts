import { db } from './index';
import { nowISO } from '../core/dates';

export type TxType = 'expense' | 'income';

export interface NewTransaction {
  type: TxType;
  amountCents: number;
  category: string;
  description: string;
  /** ISO com offset (use core/dates.resolveOccurredAt). */
  occurredAt: string;
}

export interface TransactionRow {
  id: number;
  type: TxType;
  amount_cents: number;
  category: string;
  description: string;
  occurred_at: string;
  created_at: string;
  source_msg_id: string | null;
}

export type CreateResult =
  | { status: 'created'; id: number }
  | { status: 'duplicate' };

const insertTx = db.prepare(`
  INSERT INTO transactions
    (type, amount_cents, category, description, occurred_at, created_at, source_msg_id)
  VALUES
    (@type, @amountCents, @category, @description, @occurredAt, @createdAt, @sourceMsgId)
`);

// INSERT "strict" (sem OR IGNORE): colide (throw) se o message_id ja existe.
const insertProcessedStrict = db.prepare(
  'INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?)',
);

/**
 * True SOMENTE para colisao de PK/UNIQUE (message_id ja processado).
 * NAO engloba outras violacoes (ex.: CHECK de amount_cents) — essas devem
 * propagar como erro de verdade, nunca virar "duplicata".
 */
function isDuplicateMessage(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  return code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Registra uma transacao E marca o message_id como processado na MESMA transacao
 * SQLite (tudo-ou-nada). Se o message_id ja foi processado, a colisao de PK faz
 * rollback do insert -> sem gasto duplicado. Se o insert falhar, a marca tambem
 * sofre rollback -> sem gasto perdido. A marca so "existe" se o insert commitou.
 */
export function createTransactionIdempotent(input: NewTransaction, messageId: string): CreateResult {
  const createdAt = nowISO();
  const run = db.transaction((): number => {
    insertProcessedStrict.run(messageId, createdAt); // 1) marca (throw se duplicado)
    const info = insertTx.run({ ...input, createdAt, sourceMsgId: messageId }); // 2) insere
    return Number(info.lastInsertRowid);
  });

  try {
    const id = run();
    return { status: 'created', id };
  } catch (err) {
    if (isDuplicateMessage(err)) return { status: 'duplicate' };
    throw err;
  }
}

// ---------- Consultas (base para a Fase 4) ----------

const selectRecent = db.prepare(`
  SELECT * FROM transactions
  ORDER BY occurred_at DESC, id DESC
  LIMIT ?
`);

export function listRecent(limit = 10): TransactionRow[] {
  return selectRecent.all(limit) as TransactionRow[];
}

const selectTotalByType = db.prepare(`
  SELECT COALESCE(SUM(amount_cents), 0) AS total
  FROM transactions
  WHERE type = ? AND occurred_at >= ? AND occurred_at <= ?
`);

/** Soma (centavos) de um tipo em um intervalo [startISO, endISO]. */
export function totalByTypeInRange(type: TxType, startISO: string, endISO: string): number {
  const row = selectTotalByType.get(type, startISO, endISO) as { total: number };
  return row.total;
}

const selectByCategory = db.prepare(`
  SELECT category, COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS count
  FROM transactions
  WHERE type = ? AND occurred_at >= ? AND occurred_at <= ?
  GROUP BY category
  ORDER BY total DESC
`);

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

/** Totais por categoria (centavos) de um tipo em um intervalo. */
export function totalsByCategoryInRange(type: TxType, startISO: string, endISO: string): CategoryTotal[] {
  return selectByCategory.all(type, startISO, endISO) as CategoryTotal[];
}
