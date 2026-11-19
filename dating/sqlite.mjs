import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

// The local server implements the same statement interface as the hosted D1 database.
export function openDatingDatabase(path) {
  const connection = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  connection.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  connection.exec(schema);
  function prepare(sql, values = []) {
    const statement = connection.prepare(sql);
    return {
      bind: (...args) => prepare(sql, args),
      first: () => statement.get(...values) ?? null,
      all: () => ({ results: statement.all(...values) }),
      run: () => statement.run(...values),
    };
  }
  return {
    prepare,
    batch(statements) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.all());
        connection.exec('COMMIT');
        return results;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => connection.close(),
  };
}
