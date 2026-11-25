import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Infraestrutura dos testes de integração do banco.
 *
 * Cada arquivo de teste cria um banco PostgreSQL isolado e descartável, aplica o
 * shim do Supabase + as migrations reais e executa as consultas COMO o papel
 * "authenticated" (com claims JWT simuladas), exatamente como o PostgREST faz.
 *
 * Variável: TEST_DATABASE_ADMIN_URL (padrão: postgres local do ambiente de dev).
 * Nunca aponte para um banco de produção: o helper cria e APAGA bancos "sgpe_test_*".
 */
const ROOT = join(__dirname, "..", "..");
const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://sgpe_test:sgpe_test@localhost:5432/postgres";

export const dbTestsEnabled = async (): Promise<boolean> => {
  const pool = new Pool({ connectionString: ADMIN_URL, max: 1, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
};

export interface TestDb {
  admin: Pool;
  close: () => Promise<void>;
  createUser: (email: string, meta?: Record<string, unknown>) => Promise<string>;
  /** Executa fn numa transação como usuário autenticado (papel authenticated + claims). */
  asUser: <T>(userId: string, fn: (c: PoolClient) => Promise<T>) => Promise<T>;
  /** Executa fn numa transação como anônimo. */
  asAnon: <T>(fn: (c: PoolClient) => Promise<T>) => Promise<T>;
  /** Chama uma função (rpc) como usuário autenticado e retorna a primeira linha. */
  rpc: <T extends QueryResultRow = QueryResultRow>(
    userId: string,
    fn: string,
    args: unknown[],
    casts?: string[],
  ) => Promise<T>;
  /** Cria usuário + empresa (via gatilho de cadastro) e devolve ids. */
  createCompanyWithOwner: (name?: string) => Promise<{ userId: string; companyId: string; categoryId: string }>;
}

function migrationFiles(): string[] {
  const dir = join(ROOT, "supabase", "migrations");
  return [
    join(ROOT, "supabase", "tests", "00_supabase_shim.sql"),
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(dir, f)),
  ];
}

export async function createTestDb(): Promise<TestDb> {
  const dbName = `sgpe_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const adminMain = new Pool({ connectionString: ADMIN_URL, max: 1 });
  await adminMain.query(`create database ${dbName}`);
  await adminMain.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const admin = new Pool({ connectionString: url.toString(), max: 10 });
  // O banco é apagado com "force" no fim: conexões ociosas recebem 57P01, o que é esperado.
  admin.on("error", () => undefined);

  for (const file of migrationFiles()) {
    await admin.query(readFileSync(file, "utf8"));
  }

  const asUser: TestDb["asUser"] = async (userId, fn) => {
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  const asAnon: TestDb["asAnon"] = async (fn) => {
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("set local role anon");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  const createUser: TestDb["createUser"] = async (email, meta = {}) => {
    const { rows } = await admin.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify(meta)],
    );
    return rows[0].id;
  };

  const rpc: TestDb["rpc"] = (userId, fn, args, casts = []) =>
    asUser(userId, async (c) => {
      const placeholders = args.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ""}`).join(", ");
      const { rows } = await c.query(`select * from public.${fn}(${placeholders})`, args as unknown[]);
      return rows[0] as never;
    });

  const createCompanyWithOwner: TestDb["createCompanyWithOwner"] = async (name = "Empresa Teste") => {
    const userId = await createUser(`${randomUUID()}@teste.local`, { full_name: "Dona Teste", company_name: name });
    const { rows } = await admin.query<{ company_id: string }>(
      "select company_id from public.company_members where user_id = $1",
      [userId],
    );
    const companyId = rows[0].company_id;
    const cat = await admin.query<{ id: string }>("select id from public.categories where company_id = $1", [companyId]);
    return { userId, companyId, categoryId: cat.rows[0].id };
  };

  const close = async () => {
    await admin.end();
    const main = new Pool({ connectionString: ADMIN_URL, max: 1 });
    await main.query(`drop database if exists ${dbName} with (force)`);
    await main.end();
  };

  return { admin, close, createUser, asUser, asAnon, rpc, createCompanyWithOwner };
}

/** Captura o SQLSTATE/mensagem de uma promise rejeitada pelo banco. */
export async function dbError(promise: Promise<unknown>): Promise<{ code?: string; message: string; detail?: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; message: string; detail?: string };
    return { code: e.code, message: e.message, detail: e.detail };
  }
  throw new Error("Era esperado um erro do banco, mas a operação foi concluída.");
}
