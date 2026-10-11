import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

let sqliteConn = null;
let db = null;

async function getConnection() {
  if (db) return db;
  sqliteConn = new SQLiteConnection(CapacitorSQLite);
  const isConn = (await sqliteConn.isConnection("bosco", false)).result;
  if (isConn) {
    db = await sqliteConn.retrieveConnection("bosco", false);
  } else {
    db = await sqliteConn.createConnection("bosco", false, "no-encryption", 1, false);
  }
  await db.open();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS docs (
      id TEXT PRIMARY KEY,
      type TEXT,
      body TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS docs_type_idx ON docs(type);
    CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs(updatedAt);
  `);
  return db;
}

const normalizeDoc = (doc) => {
  const normalized = {...doc };
  normalized._id = normalized._id || `doc:${Date.now()}:${Math.floor(Math.random() * 100000)}`;
  normalized.createdAt = normalized.createdAt || new Date().toISOString();
  normalized.updatedAt = new Date().toISOString(); // always update on put
  return normalized;
};

const parseBody = (body) => {
  try { return JSON.parse(body); } catch { return null; }
};

export function createSqliteDbService() {
  const allDocs = async (options = {}) => {
    const db = await getConnection();
    const includeDocs = Boolean(options.include_docs);
    const startKey = typeof options.startkey === 'string'? options.startkey : null;
    const endKey = typeof options.endkey === 'string'? options.endkey : null;
    const limit = Number.isInteger(options.limit)? options.limit : null;

    let query = 'SELECT id, type, body, createdAt, updatedAt FROM docs';
    const clauses = [];
    const params = [];

    if (startKey && endKey) {
      clauses.push('id >=? AND id <=?');
      params.push(startKey, endKey);
    } else if (startKey) {
      clauses.push('id >=?');
      params.push(startKey);
    } else if (endKey) {
      clauses.push('id <=?');
      params.push(endKey);
    }

    if (clauses.length) query += ` WHERE ${clauses.join(' AND ')}`;
    query += ' ORDER BY id ASC';
    if (limit!== null) {
      query += ' LIMIT?';
      params.push(limit);
    }
    query += ';';

    const ret = await db.query(query, params);
    return {
      rows: ret.values.map((row) => {
        const doc = parseBody(row.body);
        return includeDocs
         ? { id: row.id, key: row.id, doc, value: { rev: doc?._rev || '1-restore' } }
          : { id: row.id, key: row.id, value: { rev: doc?._rev || '1-restore' } };
      }),
    };
  };

  const get = async (id) => {
    const db = await getConnection();
    const ret = await db.query('SELECT body FROM docs WHERE id =?;', [id]);
    if (!ret.values.length) { const e = new Error('missing'); e.status = 404; throw e; }
    const doc = parseBody(ret.values[0].body);
    if (!doc) { const e = new Error('missing'); e.status = 404; throw e; }
    return doc;
  };

  const put = async (doc) => {
    const db = await getConnection();
    const normalized = normalizeDoc(doc);
    const serialized = JSON.stringify(normalized);
    await db.run(`
      INSERT INTO docs (id, type, body, createdAt, updatedAt)
      VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type, body=excluded.body, updatedAt=excluded.updatedAt;
    `, [normalized._id, normalized.type || 'unknown', serialized, normalized.createdAt, normalized.updatedAt]);
    return { ok: true, id: normalized._id, rev: normalized._rev || '1-restore' };
  };

  const remove = async (doc) => {
    const db = await getConnection();
    await db.run('DELETE FROM docs WHERE id =?;', [doc._id]);
    return { ok: true, id: doc._id, rev: doc._rev || '1-restore' };
  };

  const resetDb = async () => {
    const db = await getConnection();
    await db.execute('DELETE FROM docs;');
    return true;
  };

  const destroy = async () => {
    const db = await getConnection();
    await db.execute('DELETE FROM docs;');
    return true;
  };

  // For backup merge on Android, backup is a JSON array exported via createBackup
  const mergeBackup = async (backupRows) => {
    const db = await getConnection();
    let inserted=0, updated=0, skipped=0;
    for (const row of backupRows) {
      const localRet = await db.query('SELECT updatedAt FROM docs WHERE id =?;', [row.id]);
      if (!localRet.values.length) {
        await db.run('INSERT INTO docs (id,type,body,createdAt,updatedAt) VALUES (?,?,?,?,?);',
          [row.id, row.type, row.body, row.createdAt, row.updatedAt]);
        inserted++;
      } else {
        const backupTime = new Date(row.updatedAt||0).getTime();
        const localTime = new Date(localRet.values[0].updatedAt||0).getTime();
        if (backupTime > localTime) {
          await db.run('INSERT OR REPLACE INTO docs (id,type,body,createdAt,updatedAt) VALUES (?,?,?,?,?);',
            [row.id, row.type, row.body, row.createdAt, row.updatedAt]);
          updated++;
        } else skipped++;
      }
    }
    return { inserted, updated, skipped, total: backupRows.length };
  };

  return { allDocs, get, put, remove, destroy, resetDb, mergeBackup };
}
