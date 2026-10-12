import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DATABASE_NAME = 'bosco';
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
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS docs_type_idx ON docs(type);',
      );
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS docs_updated_idx ON docs(updatedAt);',
      );
      return connection;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

function normalizeDoc(doc) {
  const now = new Date().toISOString();
  return {
    ...doc,
    _id: doc._id || `doc:${Date.now()}:${Math.floor(Math.random() * 100000)}`,
    createdAt: doc.createdAt || now,
    updatedAt: now,
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
    const normalized = normalizeDoc(doc);
    await database.run(
      `INSERT INTO docs (id, type, body, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         body = excluded.body,
         updatedAt = excluded.updatedAt;`,
      [
        normalized._id,
        normalized.type || 'unknown',
        JSON.stringify(normalized),
        normalized.createdAt,
        normalized.updatedAt,
      ],
    );
    return {
      ok: true,
      id: normalized._id,
      rev: normalized._rev || '1-restore',
    };
  };

  const remove = async (doc) => {
    const database = await getConnection();
    await database.run('DELETE FROM docs WHERE id = ?;', [doc._id]);
    return { ok: true, id: doc._id, rev: doc._rev || '1-restore' };
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
    await database.run('DELETE FROM docs;');
    return true;
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
  };
}
