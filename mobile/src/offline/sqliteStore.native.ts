import * as SQLite from 'expo-sqlite'
import type {
  OfflineAccount,
  OfflineStore,
  OfflineTransaction,
  OutboxItem,
  SyncStatus,
} from './types'

const DB_NAME = 'wallettrails-offline.db'

/**
 * Android expo-sqlite throws `NativeDatabase.prepareAsync` NPE when:
 * - the async API runs two prepares at once, or
 * - the JS database object is GC'd / closed while a statement is prepared.
 * Keep one sync connection at module scope and run every native call on a single queue.
 */
let db: SQLite.SQLiteDatabase | null = null
let dbChain: Promise<unknown> = Promise.resolve()

export function isNativeSqliteError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.name}` : String(err)
  return (
    msg.includes('NativeDatabase') ||
    msg.includes('prepareAsync') ||
    msg.includes('NullPointerException') ||
    msg.includes('null pointer') ||
    msg.includes('database is closed') ||
    msg.includes('NullPointer')
  )
}

function migrateSync(database: SQLite.SQLiteDatabase) {
  // One statement per exec — multi-statement execAsync is another Android crash path.
  // DELETE journal avoids WAL lock fights with the widget process.
  database.execSync('PRAGMA journal_mode = DELETE;')
  database.execSync(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `)
  database.execSync(`
    CREATE TABLE IF NOT EXISTS accounts (
      local_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      opening_balance REAL NOT NULL,
      current_balance REAL NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  database.execSync(`
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
    )
  `)
  database.execSync(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      local_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL
    )
  `)
}

function openDb(): SQLite.SQLiteDatabase {
  const next = SQLite.openDatabaseSync(DB_NAME)
  migrateSync(next)
  db = next
  return next
}

function getDb(): SQLite.SQLiteDatabase {
  return db ?? openDb()
}

export function closeSqliteStore() {
  if (!db) return
  try {
    db.closeSync()
  } catch {
    /* already closed */
  }
  db = null
}

function withDb<T>(fn: (database: SQLite.SQLiteDatabase) => T): T {
  try {
    return fn(getDb())
  } catch (err) {
    if (!isNativeSqliteError(err)) throw err
    closeSqliteStore()
    return fn(openDb())
  }
}

function serial<T>(fn: (database: SQLite.SQLiteDatabase) => T): Promise<T> {
  const run = dbChain.then(
    () => withDb(fn),
    () => withDb(fn),
  )
  dbChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
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
  await serial((database) => {
    migrateSync(database)
  })

  const store: OfflineStore = {
    async getMeta(key) {
      return serial((database) => {
        const row = database.getFirstSync<{ value: string }>(
          'SELECT value FROM meta WHERE key = ?',
          [key],
        )
        return row?.value ?? null
      })
    },
    async setMeta(key, value) {
      return serial((database) => {
        database.runSync(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, value],
        )
      })
    },
    async clearAll() {
      return serial((database) => {
        database.execSync('DELETE FROM meta')
        database.execSync('DELETE FROM accounts')
        database.execSync('DELETE FROM transactions')
        database.execSync('DELETE FROM outbox')
      })
    },
    async upsertAccounts(accounts) {
      return serial((database) => {
        database.withTransactionSync(() => {
          for (const a of accounts) {
            database.runSync(
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
        })
      })
    },
    async listAccounts() {
      return serial((database) => {
        const rows = database.getAllSync<Record<string, unknown>>(
          'SELECT * FROM accounts ORDER BY name COLLATE NOCASE ASC',
        )
        return rows.map(rowToAccount)
      })
    },
    async getAccountByServerId(serverId) {
      return serial((database) => {
        const row = database.getFirstSync<Record<string, unknown>>(
          'SELECT * FROM accounts WHERE server_id = ?',
          [serverId],
        )
        return row ? rowToAccount(row) : undefined
      })
    },
    async updateAccountBalance(serverId, currentBalance) {
      return serial((database) => {
        database.runSync(
          'UPDATE accounts SET current_balance = ?, updated_at = ? WHERE server_id = ?',
          [currentBalance, new Date().toISOString(), serverId],
        )
      })
    },
    async upsertTransactions(txs) {
      return serial((database) => {
        database.withTransactionSync(() => {
          for (const t of txs) {
            database.runSync(
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
        })
      })
    },
    async listTransactions() {
      return serial((database) => {
        const rows = database.getAllSync<Record<string, unknown>>(
          'SELECT * FROM transactions ORDER BY date DESC, created_at DESC',
        )
        return rows.map(rowToTx)
      })
    },
    async getTransaction(localId) {
      return serial((database) => {
        const row = database.getFirstSync<Record<string, unknown>>(
          'SELECT * FROM transactions WHERE local_id = ?',
          [localId],
        )
        return row ? rowToTx(row) : undefined
      })
    },
    async listPendingTransactions() {
      return serial((database) => {
        const rows = database.getAllSync<Record<string, unknown>>(
          `SELECT * FROM transactions WHERE sync_status IN ('pending', 'failed')
           ORDER BY date DESC, created_at DESC`,
        )
        return rows.map(rowToTx)
      })
    },
    async clearSyncedTransactions() {
      return serial((database) => {
        database.runSync(`DELETE FROM transactions WHERE sync_status = 'synced'`)
      })
    },
    async markTransactionSynced(localId, serverId) {
      return serial((database) => {
        database.runSync(
          `UPDATE transactions SET server_id = ?, sync_status = 'synced', last_error = NULL WHERE local_id = ?`,
          [serverId, localId],
        )
      })
    },
    async markTransactionFailed(localId, error) {
      return serial((database) => {
        database.runSync(
          `UPDATE transactions SET sync_status = 'failed', last_error = ? WHERE local_id = ?`,
          [error, localId],
        )
      })
    },
    async addOutbox(item) {
      return serial((database) => {
        database.runSync(
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
      })
    },
    async listOutbox() {
      return serial((database) => {
        const rows = database.getAllSync<Record<string, unknown>>(
          'SELECT * FROM outbox ORDER BY created_at ASC',
        )
        return rows.map(rowToOutbox)
      })
    },
    async removeOutbox(id) {
      return serial((database) => {
        database.runSync('DELETE FROM outbox WHERE id = ?', [id])
      })
    },
    async bumpOutboxAttempt(id, error) {
      return serial((database) => {
        database.runSync(
          `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
          [error, id],
        )
      })
    },
  }

  return store
}
