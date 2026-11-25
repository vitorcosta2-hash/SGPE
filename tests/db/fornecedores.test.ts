import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbError, dbTestsEnabled, type TestDb } from "./helpers";

const enabled = await dbTestsEnabled();

describe.skipIf(!enabled)("banco: fornecedores e vínculo com produtos (RF13–RF16, RF18, RF24)", () => {
  let db: TestDb;
  let A: { userId: string; companyId: string; categoryId: string };
  let B: { userId: string; companyId: string; categoryId: string };

  const newSupplier = async (t: typeof A, name: string) =>
    (await db.asUser(t.userId, (c) =>
      c.query("insert into public.suppliers (company_id, name, phone) values ($1, $2, $3) returning id", [t.companyId, name, "67 99999-0000"]),
    )).rows[0].id as string;

  const newProduct = (t: typeof A, name: string, supplierId: string | null) =>
    db.rpc<{ id: string; supplier_id: string | null }>(t.userId, "create_product", [t.companyId, name, t.categoryId, null, null, null, "un", 1, 2, 0, 0, true, null, supplierId]);

  beforeAll(async () => {
    db = await createTestDb();
    A = await db.createCompanyWithOwner("Alfa");
    B = await db.createCompanyWithOwner("Beta");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("cadastra e consulta fornecedor com nome obrigatório e contatos opcionais", async () => {
    await db.asUser(A.userId, (c) => c.query("insert into public.suppliers (company_id, name) values ($1, 'Só nome')", [A.companyId]));
    const err = await dbError(db.asUser(A.userId, (c) => c.query("insert into public.suppliers (company_id, name) values ($1, '   ')", [A.companyId])));
    expect(err.code).toBe("23514");
    const { rows } = await db.asUser(A.userId, (c) => c.query("select name, phone, email from public.suppliers where company_id = $1", [A.companyId]));
    expect(rows[0]).toMatchObject({ name: "Só nome", phone: null, email: null });
  });

  it("impede nome duplicado dentro da empresa (sem diferenciar maiúsculas) mas permite em outra", async () => {
    await newSupplier(A, "Distribuidora X");
    const dup = await dbError(newSupplier(A, "  distribuidora x "));
    expect(dup.code).toBe("23505");
    await expect(newSupplier(B, "Distribuidora X")).resolves.toBeTruthy();
  });

  it("altera dados do fornecedor", async () => {
    const id = await newSupplier(A, "Antigo");
    await db.asUser(A.userId, (c) => c.query("update public.suppliers set name = 'Novo', email = 'a@b.com' where id = $1", [id]));
    const { rows } = await db.asUser(A.userId, (c) => c.query("select name, email from public.suppliers where id = $1", [id]));
    expect(rows[0]).toMatchObject({ name: "Novo", email: "a@b.com" });
  });

  it("associa produto a fornecedor ou deixa vazio; a visão traz o nome e a contagem", async () => {
    const s = await newSupplier(A, "Atacado Sul");
    const com = await newProduct(A, "Com fornecedor", s);
    const sem = await newProduct(A, "Sem fornecedor", null);
    expect(com.supplier_id).toBe(s);
    expect(sem.supplier_id).toBeNull();
    const view = await db.asUser(A.userId, (c) => c.query("select supplier_name from public.products_overview where id = $1", [com.id]));
    expect(view.rows[0].supplier_name).toBe("Atacado Sul");
    const ov = await db.asUser(A.userId, (c) => c.query("select product_count from public.suppliers_overview where id = $1", [s]));
    expect(Number(ov.rows[0].product_count)).toBe(1);
  });

  it("filtra produtos por fornecedor e troca o fornecedor na edição", async () => {
    const s1 = await newSupplier(A, "Forn Filtro 1");
    const s2 = await newSupplier(A, "Forn Filtro 2");
    const p = await newProduct(A, "Produto filtro", s1);
    let r = await db.asUser(A.userId, (c) => c.query("select id from public.products_overview where company_id = $1 and supplier_id = $2", [A.companyId, s1]));
    expect(r.rows.map((x) => x.id)).toEqual([p.id]);
    await db.asUser(A.userId, (c) => c.query("update public.products set supplier_id = $1 where id = $2", [s2, p.id]));
    r = await db.asUser(A.userId, (c) => c.query("select id from public.products_overview where company_id = $1 and supplier_id = $2", [A.companyId, s1]));
    expect(r.rows).toHaveLength(0);
  });

  it("só exclui fornecedor sem produtos vinculados", async () => {
    const usado = await newSupplier(A, "Em uso");
    await newProduct(A, "Produto do usado", usado);
    const err = await dbError(db.asUser(A.userId, (c) => c.query("delete from public.suppliers where id = $1", [usado])));
    expect(err.code).toBe("23503");
    const livre = await newSupplier(A, "Livre");
    const del = await db.asUser(A.userId, (c) => c.query("delete from public.suppliers where id = $1", [livre]));
    expect(del.rowCount).toBe(1);
  });

  it("recusa fornecedor de outra empresa (função e atualização direta)", async () => {
    const alheio = await newSupplier(B, "Fornecedor de B");
    expect((await dbError(newProduct(A, "Cruzado", alheio))).code).toBe("SG006");
    const p = await newProduct(A, "Produto A", null);
    const err = await dbError(db.asUser(A.userId, (c) => c.query("update public.products set supplier_id = $1 where id = $2", [alheio, p.id])));
    expect(err.code).toBe("23503");
  });

  it("isolamento: B não enxerga nem altera fornecedores de A", async () => {
    const idA = await newSupplier(A, "Privado de A");
    const vis = await db.asUser(B.userId, (c) => c.query("select id from public.suppliers where id = $1", [idA]));
    expect(vis.rows).toHaveLength(0);
    const ov = await db.asUser(B.userId, (c) => c.query("select id from public.suppliers_overview where company_id = $1", [A.companyId]));
    expect(ov.rows).toHaveLength(0);
    const upd = await db.asUser(B.userId, (c) => c.query("update public.suppliers set name = 'Hack' where id = $1", [idA]));
    expect(upd.rowCount).toBe(0);
    const ins = await dbError(db.asUser(B.userId, (c) => c.query("insert into public.suppliers (company_id, name) values ($1, 'Intruso')", [A.companyId])));
    expect(ins.code).toBe("42501");
  });

  it("usuário anônimo não acessa fornecedores", async () => {
    const err = await dbError(db.asAnon((c) => c.query("select * from public.suppliers")));
    expect(err.code).toBe("42501");
  });
});
