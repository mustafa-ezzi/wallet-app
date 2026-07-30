import * as SQLite from 'expo-sqlite'
import type {
  OfflineAccount,
  OfflineStore,
  OfflineTransaction,
  OutboxItem,
  SyncStatus,
} from './types'

const DB_NAME = 'cashtrail-offline.db'

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      local_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      opening_balance REAL NOT NULL,
      current_balance REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      local_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      sync_status TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      account_server_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      client_mutation_id TEXT NOT NULL,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      local_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
  `)
}

function rowToAccount(r: Record<string, unknown>): OfflineAccount {
  return {
    localId: String(r.local_id),
    serverId: Number(r.server_id),
    name: String(r.name),
    type: String(r.type),
    openingBalance: Number(r.opening_balance) || 0,
    currentBalance: Number(r.current_balance) || 0,
    updatedAt: String(r.updated_at),
  }
}

function rowToTx(r: Record<string, unknown>): OfflineTransaction {
  return {
    localId: String(r.local_id),
    serverId: r.server_id == null ? null : Number(r.server_id),
    syncStatus: String(r.sync_status) as SyncStatus,
    type: r.type === 'income' ? 'income' : 'expense',
    amount: Number(r.amount) || 0,
    date: String(r.date),
    accountServerId: Number(r.account_server_id),
    category: String(r.category || ''),
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
    clientMutationId: String(r.client_mutation_id),
    lastError: r.last_error != null ? String(r.last_error) : undefined,
  }
}

function rowToOutbox(r: Record<string, unknown>): OutboxItem {
  return {
    id: String(r.id),
    entity: 'transaction',
    localId: String(r.local_id),
    payload: JSON.parse(String(r.payload)),
    attempts: Number(r.attempts) || 0,
    lastError: r.last_error != null ? String(r.last_error) : undefined,
    createdAt: String(r.created_at),
  }
}

export async function createSqliteStore(): Promise<OfflineStore> {
  const db = await SQLite.openDatabaseAsync(DB_NAME)
  await migrate(db)

  const store: OfflineStore = {
    async getMeta(key) {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM meta WHERE key = ?',
        [key],
      )
      return row?.value ?? null
    },
    async setMeta(key, value) {
      await db.runAsync(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, value],
      )
    },
    async clearAll() {
      await db.execAsync(`
        DELETE FROM meta;
        DELETE FROM accounts;
        DELETE FROM transactions;
        DELETE FROM outbox;
      `)
    },
    async upsertAccounts(accounts) {
      for (const a of accounts) {
        await db.runAsync(
          `INSERT INTO accounts (local_id, server_id, name, type, opening_balance, current_balance, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(local_id) DO UPDATE SET
             server_id = excluded.server_id,
             name = excluded.name,
             type = excluded.type,
             opening_balance = excluded.opening_balance,
             current_balance = excluded.current_balance,
             updated_at = excluded.updated_at`,
          [a.localId, a.serverId, a.name, a.type, a.openingBalance, a.currentBalance, a.updatedAt],
        )
      }
    },
    async listAccounts() {
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM accounts ORDER BY name COLLATE NOCASE ASC',
      )
      return rows.map(rowToAccount)
    },
    async getAccountByServerId(serverId) {
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM accounts WHERE server_id = ?',
        [serverId],
      )
      return row ? rowToAccount(row) : undefined
    },
    async updateAccountBalance(serverId, currentBalance) {
      await db.runAsync(
        'UPDATE accounts SET current_balance = ?, updated_at = ? WHERE server_id = ?',
        [currentBalance, new Date().toISOString(), serverId],
      )
    },
    async upsertTransactions(txs) {
      for (const t of txs) {
        await db.runAsync(
          `INSERT INTO transactions (
             local_id, server_id, sync_status, type, amount, date, account_server_id,
             category, notes, created_at, client_mutation_id, last_error
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(local_id) DO UPDATE SET
             server_id = excluded.server_id,
             sync_status = excluded.sync_status,
             type = excluded.type,
             amount = excluded.amount,
             date = excluded.date,
             account_server_id = excluded.account_server_id,
             category = excluded.category,
             notes = excluded.notes,
             created_at = excluded.created_at,
             client_mutation_id = excluded.client_mutation_id,
             last_error = excluded.last_error`,
          [
            t.localId,
            t.serverId,
            t.syncStatus,
            t.type,
            t.amount,
            t.date,
            t.accountServerId,
            t.category,
            t.notes,
            t.createdAt,
            t.clientMutationId,
            t.lastError ?? null,
          ],
        )
      }
    },
    async listTransactions() {
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM transactions ORDER BY date DESC, created_at DESC',
      )
      return rows.map(rowToTx)
    },
    async getTransaction(localId) {
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM transactions WHERE local_id = ?',
        [localId],
      )
      return row ? rowToTx(row) : undefined
    },
    async listPendingTransactions() {
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM transactions WHERE sync_status IN ('pending', 'failed')
         ORDER BY date DESC, created_at DESC`,
      )
      return rows.map(rowToTx)
    },
    async clearSyncedTransactions() {
      await db.runAsync(`DELETE FROM transactions WHERE sync_status = 'synced'`)
    },
    async markTransactionSynced(localId, serverId) {
      await db.runAsync(
        `UPDATE transactions SET server_id = ?, sync_status = 'synced', last_error = NULL WHERE local_id = ?`,
        [serverId, localId],
      )
    },
    async markTransactionFailed(localId, error) {
      await db.runAsync(
        `UPDATE transactions SET sync_status = 'failed', last_error = ? WHERE local_id = ?`,
        [error, localId],
      )
    },
    async addOutbox(item) {
      await db.runAsync(
        `INSERT INTO outbox (id, entity, local_id, payload, attempts, last_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           entity = excluded.entity,
           local_id = excluded.local_id,
           payload = excluded.payload,
           attempts = excluded.attempts,
           last_error = excluded.last_error,
           created_at = excluded.created_at`,
        [
          item.id,
          item.entity,
          item.localId,
          JSON.stringify(item.payload),
          item.attempts,
          item.lastError ?? null,
          item.createdAt,
        ],
      )
    },
    async listOutbox() {
      const rows = await db.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM outbox ORDER BY created_at ASC',
      )
      return rows.map(rowToOutbox)
    },
    async removeOutbox(id) {
      await db.runAsync('DELETE FROM outbox WHERE id = ?', [id])
    },
    async bumpOutboxAttempt(id, error) {
      await db.runAsync(
        `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
        [error, id],
      )
    },
  }

  return store
}
