import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config';
import { logger } from '../logger';

const dbPath = resolve(process.cwd(), config.DATABASE_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Migracoes idempotentes (CREATE TABLE IF NOT EXISTS). Schema pensado para migrar
 * facil para Postgres depois: tipos simples, dinheiro SEMPRE em centavos (INTEGER).
 */
const migrations: Array<{ name: string; sql: string }> = [
  {
    name: '001_processed_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id   TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
    `,
  },
  {
    name: '002_categories',
    sql: `
      CREATE TABLE IF NOT EXISTS categories (
        name  TEXT PRIMARY KEY,
        emoji TEXT NOT NULL DEFAULT ''
      );
    `,
  },
  {
    name: '003_transactions',
    sql: `
      CREATE TABLE IF NOT EXISTS transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        type          TEXT    NOT NULL CHECK (type IN ('expense','income')),
        amount_cents  INTEGER NOT NULL CHECK (amount_cents >= 0),
        category      TEXT    NOT NULL,
        description   TEXT    NOT NULL DEFAULT '',
        occurred_at   TEXT    NOT NULL,
        created_at    TEXT    NOT NULL,
        source_msg_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tx_occurred_at ON transactions (occurred_at);
      CREATE INDEX IF NOT EXISTS idx_tx_type        ON transactions (type);
      CREATE INDEX IF NOT EXISTS idx_tx_category    ON transactions (category);
    `,
  },
];

/** Categorias iniciais (editaveis). */
const SEED_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['alimentação', '🍔'],
  ['transporte', '🚗'],
  ['moradia', '🏠'],
  ['lazer', '🎮'],
  ['saúde', '💊'],
  ['educação', '📚'],
  ['assinaturas', '🔁'],
  ['mercado', '🛒'],
  ['outros', '📦'],
];

function migrate(): void {
  db.transaction(() => {
    for (const m of migrations) db.exec(m.sql);
    const seed = db.prepare('INSERT OR IGNORE INTO categories (name, emoji) VALUES (?, ?)');
    for (const [name, emoji] of SEED_CATEGORIES) seed.run(name, emoji);
  })();
  logger.debug({ migrations: migrations.length }, 'migracoes/seed aplicados');
}

migrate();

// ---- Idempotencia (leitura + marcacao para operacoes SEM escrita no banco) ----
// Para operacoes COM escrita (registrar transacao), a marcacao acontece na MESMA
// transacao SQLite do insert — ver db/transactions.ts.

const selectProcessed = db.prepare('SELECT 1 FROM processed_messages WHERE message_id = ?');
const insertProcessedOrIgnore = db.prepare(
  'INSERT OR IGNORE INTO processed_messages (message_id, processed_at) VALUES (?, ?)',
);

/** Leitura: a mensagem ja foi processada? (nao marca nada). */
export function wasProcessed(messageId: string): boolean {
  return selectProcessed.get(messageId) !== undefined;
}

/**
 * Marca uma mensagem como processada. Use SOMENTE depois de processar com sucesso
 * uma operacao que NAO escreve transacao (echo, consultas, comandos).
 * @returns true se marcou agora, false se ja estava marcada.
 */
export function markProcessed(messageId: string): boolean {
  return insertProcessedOrIgnore.run(messageId, new Date().toISOString()).changes > 0;
}
