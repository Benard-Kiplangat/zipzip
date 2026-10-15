const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createSqliteDbService(appPath) {
  const filePath = path.join(appPath, 'bosco.sqlite');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      id TEXT PRIMARY KEY,
      type TEXT,
      body TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_changes (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS docs_type_idx ON docs(type)
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs(updatedAt)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS docs_created_idx ON docs(createdAt)
  `);

  const normalizeDoc = (doc, previousUpdatedAt) => {
    const normalized = { ...doc };
    normalized._id = normalized._id || `doc:${Date.now()}:${Math.floor(Math.random() * 100000)}`;
    normalized.createdAt = normalized.createdAt || new Date().toISOString();
    normalized.updatedAt = nextUpdatedAt(previousUpdatedAt);
    return normalized;
  };

  const parseBody = (body) => {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  };

  const allDocs = (options = {}) => {
    const includeDocs = Boolean(options.include_docs);
    const startKey = typeof options.startkey === 'string' ? options.startkey : null;
    const endKey = typeof options.endkey === 'string' ? options.endkey : null;
    const limit = Number.isInteger(options.limit) ? options.limit : null;

    let query = 'SELECT id, type, body, createdAt, updatedAt FROM docs';
    const clauses = [];
    const params = [];

    if (startKey && endKey) {
      clauses.push('id >= ? AND id <= ?');
      params.push(startKey, endKey);
    } else if (startKey) {
      clauses.push('id >= ?');
      params.push(startKey);
    } else if (endKey) {
      clauses.push('id <= ?');
      params.push(endKey);
    }

    if (clauses.length) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }

    query += ' ORDER BY id ASC';

    if (limit !== null) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const rows = sqlite.prepare(query).all(...params);

    return {
      rows: rows.map((row) => {
        const doc = parseBody(row.body);
        return includeDocs
          ? { id: row.id, key: row.id, doc, value: { rev: doc?._rev || '1-restore' } }
          : { id: row.id, key: row.id, value: { rev: doc?._rev || '1-restore' } };
      }),
    };
  };

  const get = (id, options = {}) => {
    const row = sqlite.prepare('SELECT body FROM docs WHERE id = ?').get(id);
    if (!row) {
      const error = new Error('missing');
      error.status = 404;
      throw error;
    }

    const doc = parseBody(row.body);
    if (!doc) {
      const error = new Error('missing');
      error.status = 404;
      throw error;
    }

    return doc;
  };

  const put = (doc) => {
    const id = doc._id || `doc:${Date.now()}:${Math.floor(Math.random() * 100000)}`;
    const previous = sqlite.prepare('SELECT updatedAt FROM docs WHERE id = ?').get(id);
    const normalized = normalizeDoc({ ...doc, _id: id }, previous?.updatedAt);
    const serialized = JSON.stringify(normalized);
    const record = {
      id: normalized._id,
      type: normalized.type || 'unknown',
      body: serialized,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };

    const save = sqlite.transaction(() => {
      sqlite.prepare(`
        INSERT INTO docs (id, type, body, createdAt, updatedAt)
        VALUES (@id, @type, @body, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          body = excluded.body,
          updatedAt = excluded.updatedAt
      `).run(record);
      queueSyncChange(normalized._id, serialized, normalized.updatedAt);
    });
    save();

    return { ok: true, id: normalized._id, rev: normalized._rev || '1-restore' };
  };

  const remove = (doc) => {
    let existing = null;
    try {
      existing = get(doc._id);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    const tombstone = {
      ...(existing || doc),
      _id: doc._id,
      _deleted: true,
      updatedAt: nextUpdatedAt(existing?.updatedAt),
    };
    const removeRecord = sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM docs WHERE id = ?').run(doc._id);
      queueSyncChange(doc._id, JSON.stringify(tombstone), tombstone.updatedAt);
    });
    removeRecord();
    return { ok: true, id: doc._id, rev: doc._rev || '1-restore' };
  };

  const queueSyncChange = (id, body, updatedAt) => {
    sqlite.prepare(`
      INSERT INTO sync_changes (id, body, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        body = excluded.body,
        updatedAt = excluded.updatedAt
    `).run(id, body, updatedAt || new Date().toISOString());
  };

  const seedSyncChanges = (startDate = new Date(0).toISOString()) => {
    const batchSize = 250;
    let lastId = null;
    let seededCount = 0;
    while (true) {
      const rows = sqlite.prepare(`
        SELECT id, body FROM docs
        WHERE id > ? AND (updatedAt >= ? OR createdAt >= ?)
        ORDER BY id ASC LIMIT ?
      `).all(lastId || '', startDate, startDate, batchSize);
      if (!rows.length) break;

      const seed = sqlite.transaction(() => {
        for (const row of rows) {
          const doc = parseBody(row.body);
          if (!doc || !isSyncDocAfterStart(doc, startDate)) continue;
          const syncDoc = withSyncTimestamp(doc);
          queueSyncChange(syncDoc._id, JSON.stringify(syncDoc), syncDoc.updatedAt);
          seededCount += 1;
        }
      });
      seed();
      lastId = rows[rows.length - 1].id;
      if (rows.length < batchSize) break;
    }
    return seededCount;
  };

  const getPendingSyncChanges = (limit, startDate = new Date(0).toISOString()) => {
    const hasLimit = Number.isInteger(limit) && limit > 0;
    return sqlite.prepare(
      `SELECT id, body, updatedAt FROM sync_changes WHERE updatedAt >= ? ORDER BY updatedAt ASC, id ASC${hasLimit ? ' LIMIT ?' : ''}`
    )
      .all(...(hasLimit ? [startDate, limit] : [startDate]))
      .map((row) => ({ id: row.id, doc: parseBody(row.body), updatedAt: row.updatedAt }))
      .filter((change) => isSyncDocAfterStart(change.doc, startDate));
  };

  const queueSyncDoc = (doc) => {
    const syncDoc = withSyncTimestamp(doc);
    queueSyncChange(syncDoc._id, JSON.stringify(syncDoc), syncDoc.updatedAt);
  };

  const markSyncChangeSynced = (id, updatedAt) => {
    sqlite.prepare(
      'DELETE FROM sync_changes WHERE id = ? AND updatedAt = ?'
    ).run(id, updatedAt);
  };

  const applyRemoteSyncDoc = (doc) => {
    let local = null;
    try {
      local = get(doc._id);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    if (local && compareSyncDocs(local, doc) >= 0) return false;
    if (doc._deleted) {
      sqlite.prepare('DELETE FROM docs WHERE id = ?').run(doc._id);
      return true;
    }
    const normalized = { ...doc };
    sqlite.prepare(`
      INSERT INTO docs (id, type, body, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        body = excluded.body,
        updatedAt = excluded.updatedAt
    `).run(
      normalized._id,
      normalized.type || 'unknown',
      JSON.stringify(normalized),
      normalized.createdAt || '',
      normalized.updatedAt || '',
    );
    return true;
  };

  const getSyncState = (key) => {
    const row = sqlite.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  };

  const setSyncState = (key, value) => {
    sqlite.prepare(`
      INSERT INTO sync_state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  };

  const acknowledgeSyncBaseline = (key, value) => {
    sqlite.prepare(`
      INSERT INTO sync_state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  };

  const destroy = () => {
    sqlite.close();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  };

  const resetDb = () => {
    sqlite.exec('DELETE FROM docs; DELETE FROM sync_changes; DELETE FROM sync_state;');
    return true;
  };

  const mergeBackup = (backupPath) => {
  if (!fs.existsSync(backupPath)) {
    throw new Error("Backup file not found");
  }

  const backupDb = new Database(backupPath, { readonly: true });

  const table = backupDb.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name = 'docs'
`).get();

if (!table) {
  throw new Error("Invalid Boscos POS backup");
}

  try {
    const merge = sqlite.transaction(() => {
      const backupRows = backupDb
        .prepare(`
          SELECT id, type, body, createdAt, updatedAt
          FROM docs
        `)
        .all();

      const getLocal = sqlite.prepare(`
        SELECT updatedAt
        FROM docs
        WHERE id = ?
      `);

      const insertOrUpdate = sqlite.prepare(`
        INSERT INTO docs (
          id,
          type,
          body,
          createdAt,
          updatedAt
        )
        VALUES (
          @id,
          @type,
          @body,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          body = excluded.body,
          updatedAt = excluded.updatedAt
      `);

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of backupRows) {
        const local = getLocal.get(row.id);

        // Doesn't exist locally → import it
        if (!local) {
          insertOrUpdate.run(row);
          queueSyncChange(row.id, row.body, row.updatedAt);
          inserted++;
          continue;
        }

        // Both exist → only use backup if it is newer
        const backupTime = new Date(row.updatedAt || 0).getTime();
        const localTime = new Date(local.updatedAt || 0).getTime();

        if (backupTime > localTime) {
          insertOrUpdate.run(row);
          queueSyncChange(row.id, row.body, row.updatedAt);
          updated++;
        } else {
          skipped++;
        }
      }

      return {
        inserted,
        updated,
        skipped,
        total: backupRows.length
      };
    });

    return merge();

  } finally {
    backupDb.close();
  }
};

  return {
    allDocs,
    get,
    put,
    remove,
    destroy,
    resetDb,
    mergeBackup,
    seedSyncChanges,
    getPendingSyncChanges,
    queueSyncDoc,
    markSyncChangeSynced,
    applyRemoteSyncDoc,
    getSyncState,
    setSyncState,
    acknowledgeSyncBaseline,
    sqlite,
  };
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
  const previousTime = Date.parse(previousUpdatedAt || '');
  return new Date(
    Math.max(Date.now(), Number.isNaN(previousTime) ? 0 : previousTime + 1),
  ).toISOString();
}

function stableStringify(doc) {
  if (Array.isArray(doc)) return `[${doc.map(stableStringify).join(",")}]`;
  if (doc && typeof doc === 'object') {
    const entries = Object.keys(doc)
      .filter((key) => key !== '_rev' && key !== '_conflicts')
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(doc[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(doc);
}

module.exports = { createSqliteDbService };
