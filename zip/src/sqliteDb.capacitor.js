import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DATABASE_NAME = 'bosco';
const BACKUP_FORMAT = 'bosco-pos-backup';
const BACKUP_VERSION = 1;
let sqliteConnection;
let databasePromise;

async function getConnection() {
  if (!databasePromise) {
    databasePromise = (async () => {
      sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      const { result: connectionExists } = await sqliteConnection.isConnection(
        DATABASE_NAME,
        false,
      );
      const connection = connectionExists
        ? await sqliteConnection.retrieveConnection(DATABASE_NAME, false)
        : await sqliteConnection.createConnection(
            DATABASE_NAME,
            false,
            'no-encryption',
            1,
            false,
          );

      await connection.open();
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS docs (
          id TEXT PRIMARY KEY,
          type TEXT,
          body TEXT NOT NULL,
          createdAt TEXT,
          updatedAt TEXT
        );
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS sync_changes (
          id TEXT PRIMARY KEY,
          body TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS docs_type_idx ON docs(type);',
      );
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs(updatedAt);',
      );
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS docs_created_idx ON docs(createdAt);',
      );
      return connection;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function normalizeDoc(doc, previousUpdatedAt) {
  const now = new Date().toISOString();
  return {
    ...doc,
    _id: doc._id || `doc:${Date.now()}:${Math.floor(Math.random() * 100000)}`,
    createdAt: doc.createdAt || now,
    updatedAt: nextUpdatedAt(previousUpdatedAt),
  };
}

function parseBody(body) {
  return JSON.parse(body);
}

function matchesCondition(value, condition) {
  if (
    condition === null ||
    typeof condition !== 'object' ||
    Array.isArray(condition)
  ) {
    return value === condition;
  }

  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case '$eq':
        return value === expected;
      case '$ne':
        return value !== expected;
      case '$gt':
        return value > expected;
      case '$gte':
        return value >= expected;
      case '$lt':
        return value < expected;
      case '$lte':
        return value <= expected;
      default:
        return false;
    }
  });
}

export function createSqliteDbService() {
  const allDocs = async (options = {}) => {
    const database = await getConnection();
    const conditions = [];
    const values = [];
    if (typeof options.startkey === 'string') {
      conditions.push('id >= ?');
      values.push(options.startkey);
    }
    if (typeof options.endkey === 'string') {
      conditions.push('id <= ?');
      values.push(options.endkey);
    }

    let statement = 'SELECT id, type, body FROM docs';
    if (conditions.length) statement += ` WHERE ${conditions.join(' AND ')}`;
    statement += ' ORDER BY id ASC';
    if (Number.isInteger(options.limit) && options.limit >= 0) {
      statement += ' LIMIT ?';
      values.push(options.limit);
    }

    const result = await database.query(statement, values);
    return {
      rows: (result.values || []).map((row) => {
        const doc = parseBody(row.body);
        const entry = {
          id: row.id,
          key: row.id,
          value: { rev: doc._rev || '1-restore' },
        };
        if (options.include_docs) entry.doc = doc;
        return entry;
      }),
    };
  };

  const get = async (id) => {
    const database = await getConnection();
    const result = await database.query(
      'SELECT body FROM docs WHERE id = ?;',
      [id],
    );
    if (!result.values?.length) {
      const error = new Error('missing');
      error.status = 404;
      throw error;
    }
    return parseBody(result.values[0].body);
  };

  const put = async (doc) => {
    const database = await getConnection();
    const id = doc._id || `doc:${Date.now()}:${Math.floor(Math.random() * 100000)}`;
    const previous = await database.query(
      'SELECT updatedAt FROM docs WHERE id = ?;',
      [id],
    );
    const normalized = normalizeDoc(
      { ...doc, _id: id },
      previous.values?.[0]?.updatedAt,
    );
    const body = JSON.stringify(normalized);
    await database.executeSet(
      [
        {
          statement: `INSERT INTO docs (id, type, body, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              type = excluded.type,
              body = excluded.body,
              updatedAt = excluded.updatedAt;`,
          values: [normalized._id, normalized.type || 'unknown', body, normalized.createdAt, normalized.updatedAt],
        },
        {
          statement: `INSERT INTO sync_changes (id, body, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt;`,
          values: [normalized._id, body, normalized.updatedAt],
        },
      ],
      true,
    );
    return {
      ok: true,
      id: normalized._id,
      rev: normalized._rev || '1-restore',
    };
  };

  const remove = async (doc) => {
    const database = await getConnection();
    const existing = await get(doc._id).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    const tombstone = {
      ...(existing || doc),
      _id: doc._id,
      _deleted: true,
      updatedAt: nextUpdatedAt(existing?.updatedAt),
    };
    const body = JSON.stringify(tombstone);
    await database.executeSet(
      [
        { statement: 'DELETE FROM docs WHERE id = ?;', values: [doc._id] },
        {
          statement: `INSERT INTO sync_changes (id, body, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt;`,
          values: [doc._id, body, tombstone.updatedAt],
        },
      ],
      true,
    );
    return { ok: true, id: doc._id, rev: doc._rev || '1-restore' };
  };

  const upsertWithoutQueue = async (doc) => {
    const database = await getConnection();
    if (doc._deleted) {
      await database.run('DELETE FROM docs WHERE id = ?;', [doc._id]);
      return;
    }
    const body = JSON.stringify(doc);
    await database.run(
      `INSERT INTO docs (id, type, body, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         body = excluded.body,
         updatedAt = excluded.updatedAt;`,
      [doc._id, doc.type || 'unknown', body, doc.createdAt || '', doc.updatedAt || ''],
    );
  };

  const seedSyncChanges = async (startDate = new Date(0).toISOString()) => {
    const database = await getConnection();
    const batchSize = 250;
    let lastId = null;
    let seededCount = 0;
    while (true) {
      const result = await database.query(
        `SELECT id, body FROM docs
         WHERE id > ? AND (updatedAt >= ? OR createdAt >= ?)
         ORDER BY id ASC LIMIT ?;`,
        [lastId || '', startDate, startDate, batchSize],
      );
      const rows = result.values || [];
      if (!rows.length) break;

      const statements = rows.flatMap((row) => {
        const doc = parseBody(row.body);
        if (!doc || !isSyncDocAfterStart(doc, startDate)) return [];
        const syncDoc = withSyncTimestamp(doc);
        return [{
          statement: `INSERT INTO sync_changes (id, body, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt;`,
          values: [
            syncDoc._id,
            JSON.stringify(syncDoc),
            syncDoc.updatedAt,
          ],
        }];
      });
      if (statements.length) await database.executeSet(statements, true);
      seededCount += statements.length;
      lastId = rows[rows.length - 1].id;
      if (rows.length < batchSize) break;
    }
    return seededCount;
  };

  const getPendingSyncChanges = async (limit, startDate = new Date(0).toISOString()) => {
    const database = await getConnection();
    const hasLimit = Number.isInteger(limit) && limit > 0;
    const result = await database.query(
      `SELECT id, body, updatedAt FROM sync_changes WHERE updatedAt >= ? ORDER BY updatedAt ASC, id ASC${hasLimit ? ' LIMIT ?' : ''};`,
      hasLimit ? [startDate, limit] : [startDate],
    );
    return (result.values || []).map((row) => ({
      id: row.id,
      doc: parseBody(row.body),
      updatedAt: row.updatedAt,
    })).filter((change) => isSyncDocAfterStart(change.doc, startDate));
  };

  const queueSyncDoc = async (doc) => {
    const database = await getConnection();
    const syncDoc = withSyncTimestamp(doc);
    await queueSyncChange(
      database,
      syncDoc._id,
      JSON.stringify(syncDoc),
      syncDoc.updatedAt,
    );
  };

  const markSyncChangeSynced = async (id, updatedAt) => {
    const database = await getConnection();
    await database.run(
      'DELETE FROM sync_changes WHERE id = ? AND updatedAt = ?;',
      [id, updatedAt],
    );
  };

  const applyRemoteSyncDoc = async (doc) => {
    const local = await get(doc._id).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    if (local && compareSyncDocs(local, doc) >= 0) return false;
    await upsertWithoutQueue(doc);
    return true;
  };

  const getSyncState = async (key) => {
    const database = await getConnection();
    const result = await database.query('SELECT value FROM sync_state WHERE key = ?;', [key]);
    return result.values?.length ? JSON.parse(result.values[0].value) : null;
  };

  const setSyncState = async (key, value) => {
    const database = await getConnection();
    await database.run(
      `INSERT INTO sync_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [key, JSON.stringify(value)],
    );
  };

  const acknowledgeSyncBaseline = async (key, value) => {
    const database = await getConnection();
    await database.executeTransaction(
      [
        {
          statement: 'INSERT INTO sync_state (key, value) VALUES (?, ?);',
          values: [key, JSON.stringify(value)],
        },
        { statement: 'DELETE FROM sync_changes;', values: [] },
      ],
      true,
    );
  };

  const find = async ({ selector = {}, limit } = {}) => {
    const result = await allDocs({ include_docs: true });
    const docs = result.rows
      .map((row) => row.doc)
      .filter((doc) =>
        Object.entries(selector).every(([field, condition]) =>
          matchesCondition(doc[field], condition),
        ),
      );
    return {
      docs:
        Number.isInteger(limit) && limit >= 0 ? docs.slice(0, limit) : docs,
    };
  };

  const clear = async () => {
    const database = await getConnection();
    await database.executeSet(
      [
        { statement: 'DELETE FROM docs;', values: [] },
        { statement: 'DELETE FROM sync_changes;', values: [] },
        { statement: 'DELETE FROM sync_state;', values: [] },
      ],
      true,
    );
    return true;
  };

  const createBackup = async () => {
    const result = await allDocs({ include_docs: true });
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      docs: result.rows.map((row) => row.doc).filter(Boolean),
    };
  };

  const mergeBackup = async (backup) => {
    if (
      !backup ||
      backup.format !== BACKUP_FORMAT ||
      backup.version !== BACKUP_VERSION ||
      !Array.isArray(backup.docs)
    ) {
      throw new Error('This is not a supported POS database backup.');
    }

    const backupIds = new Set();
    for (const doc of backup.docs) {
      if (
        !doc ||
        typeof doc !== 'object' ||
        Array.isArray(doc) ||
        typeof doc._id !== 'string' ||
        !doc._id.trim() ||
        doc._deleted
      ) {
        throw new Error('The backup contains an invalid database record.');
      }
      if (backupIds.has(doc._id)) {
        throw new Error(`The backup contains duplicate record "${doc._id}".`);
      }
      backupIds.add(doc._id);
    }

    const database = await getConnection();
    const statements = [];
    const counts = { inserted: 0, updated: 0, skipped: 0, total: backup.docs.length };
    for (const doc of backup.docs) {
      let local = null;
      try {
        local = await get(doc._id);
      } catch (error) {
        if (error.status !== 404) throw error;
      }

      if (local) {
        const backupTime = Date.parse(doc.updatedAt || 0);
        const localTime = Date.parse(local.updatedAt || 0);
        if (!(backupTime > localTime)) {
          counts.skipped++;
          continue;
        }
        counts.updated++;
      } else {
        counts.inserted++;
      }

      const body = JSON.stringify(doc);
      const updatedAt = doc.updatedAt || '';
      statements.push(
        {
          statement: `INSERT INTO docs (id, type, body, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              type = excluded.type,
              body = excluded.body,
              updatedAt = excluded.updatedAt;`,
          values: [doc._id, doc.type || 'unknown', body, doc.createdAt || '', updatedAt],
        },
        {
          statement: `INSERT INTO sync_changes (id, body, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt;`,
          values: [doc._id, body, updatedAt || new Date().toISOString()],
        },
      );
    }

    if (statements.length) {
      await database.executeSet(statements, true);
    }
    return counts;
  };

  return {
    allDocs,
    get,
    put,
    remove,
    find,
    createIndex: async () => ({ result: 'created' }),
    destroy: clear,
    resetDb: clear,
    seedSyncChanges,
    getPendingSyncChanges,
    queueSyncDoc,
    markSyncChangeSynced,
    applyRemoteSyncDoc,
    getSyncState,
    setSyncState,
    acknowledgeSyncBaseline,
    createBackup,
    mergeBackup,
  };
}

async function queueSyncChange(database, id, body, updatedAt) {
  await database.run(
    `INSERT INTO sync_changes (id, body, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt;`,
    [id, body, updatedAt || new Date().toISOString()],
  );
}

function compareSyncDocs(left, right) {
  const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
  const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return stableStringify(left).localeCompare(stableStringify(right));
}

function withSyncTimestamp(doc) {
  return {
    ...doc,
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

function isSyncDocAfterStart(doc, startDate) {
  const startTime = Date.parse(startDate);
  if (Number.isNaN(startTime)) return false;
  return [doc?.createdAt, doc?.updatedAt].some((value) => {
    const timestamp = Date.parse(value || '');
    return !Number.isNaN(timestamp) && timestamp >= startTime;
  });
}

function nextUpdatedAt(previousUpdatedAt) {
  const previousTime = Date.parse(previousUpdatedAt || "");
  return new Date(
    Math.max(Date.now(), Number.isNaN(previousTime) ? 0 : previousTime + 1),
  ).toISOString();
}

function stableStringify(doc) {
  if (Array.isArray(doc)) return `[${doc.map(stableStringify).join(",")}]`;
  if (doc && typeof doc === "object") {
    const entries = Object.keys(doc)
      .filter((key) => key !== "_rev" && key !== "_conflicts")
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(doc[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(doc);
}
