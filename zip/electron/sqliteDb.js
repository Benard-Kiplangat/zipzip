const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function createSqliteDbService(appPath) {

  function nextUpdatedAt(previousUpdatedAt) {
  const previousTime = Date.parse(previousUpdatedAt || '');
  return new Date(
    Math.max(Date.now(), Number.isNaN(previousTime) ? 0 : previousTime + 1),
  ).toISOString();
}

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
    const dateLimit = options.dateLimit;

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

    if (dateLimit !== undefined && dateLimit !== null) {
      let cutoff;
      if (typeof dateLimit === 'number' && Number.isFinite(dateLimit) && dateLimit > 0) {
        cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - dateLimit);
      } else {
        cutoff = new Date(dateLimit);
      }

      if (!Number.isNaN(cutoff.getTime())) {
        clauses.push('createdAt >= ? AND createdAt <= ?');
        params.push(cutoff.toISOString(), new Date().toISOString());
      }
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
    const removeRecord = sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM docs WHERE id = ?').run(doc._id);
    });
    removeRecord();
    return { ok: true, id: doc._id, rev: doc._rev || '1-restore' };
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
          inserted++;
          continue;
        }

        // Both exist → only use backup if it is newer
        const backupTime = new Date(row.updatedAt || 0).getTime();
        const localTime = new Date(local.updatedAt || 0).getTime();

        if (backupTime > localTime) {
          insertOrUpdate.run(row);
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
    sqlite,
  };
}

module.exports = { createSqliteDbService };
