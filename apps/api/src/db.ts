import postgres from 'postgres';
import { config } from './config.js';

// Cliente PostgreSQL. Las consultas usan plantillas etiquetadas (sql`...`), que escapan los
// parámetros automáticamente y evitan inyección SQL.
export const sql: postgres.Sql<any> = postgres(config.databaseUrl, {
  max: 5,
  ssl: config.dbSsl ? 'require' : false,
  prepare: false, // compatible con el pooler de Supabase
  idle_timeout: 20,
  transform: { undefined: null },
  types: {
    // NUMERIC llega como texto por defecto; lo convertimos a número para la API.
    numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
  },
});

// Db: interfaz mínima común a la conexión principal y a una transacción (sql.begin).
export interface Db {
  <T extends readonly any[] = postgres.Row[]>(template: TemplateStringsArray, ...params: any[]): postgres.PendingQuery<T>;
  json: postgres.Sql<any>['json'];
  unsafe: postgres.Sql<any>['unsafe'];
}
