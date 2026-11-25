import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbError, dbTestsEnabled, type TestDb } from "./helpers";

const enabled = await dbTestsEnabled();

interface Tenant {
  userId: string;
  companyId: string;
  categoryId: string;
  productId: string;
  saleId: string;
  customerId: string;
  promotionId: string;
}

describe.skipIf(!enabled)("banco: isolamento entre empresas e controle de acesso", () => {
  let db: TestDb;
  let A: Tenant;
  let B: Tenant;

  const seed = async (name: string): Promise<Tenant> => {
    const base = await db.createCompanyWithOwner(name);
    const product = await db.rpc<{ id: string }>(base.userId, "create_product", [base.companyId, `Produto ${name}`, base.categoryId, `SKU-${name}`, null, null, "un", 5, 10, 0, 50, true, null]);
    const customer = await db.asUser(base.userId, (c) => c.query("insert into public.customers (company_id, name) values ($1, $2) returning id", [base.companyId, `Cliente ${name}`]));
    const sale = await db.rpc<{ id: string }>(base.userId, "register_sale", [base.companyId, null, "cash", JSON.stringify([{ product_id: product.id, quantity: 1 }]), null, null], ["uuid", "uuid", "payment_method", "jsonb", "text", "text"]);
    const promo = await db.rpc<{ id: string }>(base.userId, "save_promotion", [base.companyId, null, `Promo ${name}`, "percentage", 10, "2026-01-01", "2099-12-31", [product.id]], ["uuid", "uuid", "text", "discount_type", "numeric", "date", "date", "uuid[]"]);
    return { ...base, productId: product.id, saleId: sale.id, customerId: customer.rows[0].id, promotionId: promo.id };
  };

  beforeAll(async () => {
    db = await createTestDb();
    A = await seed("Alfa");
    B = await seed("Beta");
  });
  afterAll(async () => {
    await db?.close();
  });

  describe("leitura: um usuário só enxerga a própria empresa", () => {
    const tables = [
      "companies", "company_members", "categories", "products", "stock_movements", "customers",
      "sales", "sale_items", "promotions", "promotion_products",
      "categories_overview", "products_overview", "stock_movements_detailed", "sales_overview",
      "promotions_overview", "promotion_products_detailed",
    ];
    for (const table of tables) {
      it(`${table}: B não vê nenhuma linha de A`, async () => {
        const col = table === "companies" ? "id" : "company_id";
        const { rows } = await db.asUser(B.userId, (c) => c.query(`select ${col} as cid from public.${table}`));
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.cid === B.companyId)).toBe(true);
      });
    }

    it("consulta direta por id de outra empresa retorna vazio", async () => {
      const { rows } = await db.asUser(B.userId, (c) => c.query("select * from public.products where id = $1", [A.productId]));
      expect(rows).toEqual([]);
    });

    it("perfis: só vê a si mesmo e colegas de empresa", async () => {
      const { rows } = await db.asUser(B.userId, (c) => c.query("select id from public.profiles"));
      expect(rows.map((r) => r.id)).toEqual([B.userId]);
      const colleague = await db.createUser("colega@teste.local", { full_name: "Colega" });
      await db.admin.query("insert into public.company_members (company_id, user_id, role) values ($1,$2,'staff')", [B.companyId, colleague]);
      const { rows: after } = await db.asUser(B.userId, (c) => c.query("select id from public.profiles order by id"));
      expect(after.map((r) => r.id).sort()).toEqual([B.userId, colleague].sort());
      const { rows: asColleague } = await db.asUser(colleague, (c) => c.query("select id from public.profiles where id = $1", [A.userId]));
      expect(asColleague).toEqual([]);
    });
  });

  describe("escrita: B não altera dados de A", () => {
    it("update/delete diretos afetam 0 linhas", async () => {
      const u1 = await db.asUser(B.userId, (c) => c.query("update public.products set name = 'invadido' where id = $1", [A.productId]));
      expect(u1.rowCount).toBe(0);
      const u2 = await db.asUser(B.userId, (c) => c.query("update public.categories set name = 'invadida' where id = $1", [A.categoryId]));
      expect(u2.rowCount).toBe(0);
      const u3 = await db.asUser(B.userId, (c) => c.query("update public.customers set name = 'invadido' where id = $1", [A.customerId]));
      expect(u3.rowCount).toBe(0);
      const u4 = await db.asUser(B.userId, (c) => c.query("update public.companies set name = 'invadida' where id = $1", [A.companyId]));
      expect(u4.rowCount).toBe(0);
      const d1 = await db.asUser(B.userId, (c) => c.query("delete from public.categories where id = $1", [A.categoryId]));
      expect(d1.rowCount).toBe(0);
      const { rows } = await db.admin.query("select name from public.products where id = $1", [A.productId]);
      expect(rows[0].name).toBe("Produto Alfa");
    });

    it("inserir registros na empresa de A é bloqueado pela RLS", async () => {
      const e1 = await dbError(db.asUser(B.userId, (c) => c.query("insert into public.categories (company_id, name) values ($1, 'x')", [A.companyId])));
      expect(e1.code).toBe("42501");
      const e2 = await dbError(db.asUser(B.userId, (c) => c.query("insert into public.customers (company_id, name) values ($1, 'x')", [A.companyId])));
      expect(e2.code).toBe("42501");
    });

    it("não é possível entrar numa empresa nem se promover escrevendo em company_members", async () => {
      const e1 = await dbError(db.asUser(B.userId, (c) => c.query("insert into public.company_members (company_id, user_id, role) values ($1,$2,'owner')", [A.companyId, B.userId])));
      expect(e1.code).toBe("42501");
      const e2 = await dbError(db.asUser(B.userId, (c) => c.query("update public.company_members set role = 'owner' where user_id = $1", [B.userId])));
      expect(e2.code).toBe("42501");
    });

    it("funções rpc recusam empresa alheia (42501) e não alteram nada", async () => {
      const call = (fn: string, args: unknown[], casts: string[] = []) => dbError(db.rpc(B.userId, fn, args, casts));
      const items = JSON.stringify([{ product_id: A.productId, quantity: 1 }]);
      expect((await call("register_stock_movement", [A.companyId, A.productId, "entry", 1, null, null], ["uuid", "uuid", "stock_movement_type", "numeric", "text", "text"])).code).toBe("42501");
      expect((await call("register_inventory_count", [A.companyId, A.productId, 1, null, null])).code).toBe("42501");
      expect((await call("create_product", [A.companyId, "Intruso", A.categoryId, null, null, null, "un", 1, 1, 0, 1, true, null])).code).toBe("42501");
      expect((await call("register_sale", [A.companyId, null, "cash", items, null, null], ["uuid", "uuid", "payment_method", "jsonb", "text", "text"])).code).toBe("42501");
      expect((await call("cancel_sale", [A.companyId, A.saleId, null])).code).toBe("42501");
      expect((await call("save_promotion", [A.companyId, null, "x", "percentage", 10, "2026-01-01", "2026-12-31", [A.productId]], ["uuid", "uuid", "text", "discount_type", "numeric", "date", "date", "uuid[]"])).code).toBe("42501");
      expect((await call("end_promotion", [A.companyId, A.promotionId])).code).toBe("42501");
      const { rows } = await db.admin.query("select stock_quantity from public.products where id = $1", [A.productId]);
      expect(Number(rows[0].stock_quantity)).toBe(49);
    });

    it("usar a empresa de B com recursos de A falha (referências cruzadas)", async () => {
      const casts = ["uuid", "uuid", "payment_method", "jsonb", "text", "text"];
      // Produto de A numa venda da empresa B
      expect((await dbError(db.rpc(B.userId, "register_sale", [B.companyId, null, "cash", JSON.stringify([{ product_id: A.productId, quantity: 1 }]), null, null], casts))).code).toBe("SG006");
      // Cliente de A numa venda da empresa B
      expect((await dbError(db.rpc(B.userId, "register_sale", [B.companyId, A.customerId, "cash", JSON.stringify([{ product_id: B.productId, quantity: 1 }]), null, null], casts))).code).toBe("SG006");
      // Categoria de A num produto de B
      expect((await dbError(db.rpc(B.userId, "create_product", [B.companyId, "Cruzado", A.categoryId, null, null, null, "un", 1, 1, 0, 0, true, null]))).code).toBe("SG006");
      // Produto de A numa promoção de B
      expect((await dbError(db.rpc(B.userId, "save_promotion", [B.companyId, null, "x", "percentage", 10, "2026-01-01", "2026-12-31", [A.productId]], ["uuid", "uuid", "text", "discount_type", "numeric", "date", "date", "uuid[]"]))).code).toBe("SG006");
      // Cancelar venda de A usando a empresa de B
      expect((await dbError(db.rpc(B.userId, "cancel_sale", [B.companyId, A.saleId, null]))).code).toBe("SG006");
    });

    it("as chaves estrangeiras compostas impedem referências cruzadas mesmo via SQL administrativo", async () => {
      const e1 = await dbError(
        db.admin.query("insert into public.products (company_id, category_id, name) values ($1, $2, 'Cruzado')", [B.companyId, A.categoryId]),
      );
      expect(e1.code).toBe("23503");
      const e2 = await dbError(
        db.admin.query("insert into public.sales (company_id, sale_number, customer_id, payment_method, subtotal, total) values ($1, 777, $2, 'cash', 0, 0)", [B.companyId, A.customerId]),
      );
      expect(e2.code).toBe("23503");
      const e3 = await dbError(
        db.admin.query("insert into public.promotion_products (company_id, promotion_id, product_id) values ($1, $2, $3)", [B.companyId, B.promotionId, A.productId]),
      );
      expect(e3.code).toBe("23503");
    });

    it("relatórios de uma empresa não expõem dados da outra", async () => {
      const r = await db.asUser(B.userId, async (c) => (await c.query("select public.report_stock_summary($1) as r", [A.companyId])).rows[0].r);
      expect(r).toMatchObject({ total_products: 0, stock_value: 0 });
    });
  });

  describe("acesso não autorizado", () => {
    it("anônimo não lê nenhuma tabela nem view", async () => {
      for (const table of ["products", "companies", "sales", "stock_movements", "products_overview", "profiles", "customers"]) {
        const err = await dbError(db.asAnon((c) => c.query(`select * from public.${table}`)));
        expect(err.code, table).toBe("42501");
      }
    });

    it("anônimo não executa funções", async () => {
      for (const [fn, args] of [
        ["create_company", ["x"]],
        ["register_sale", [A.companyId, null, "cash", "[]", null, null]],
        ["report_stock_summary", [A.companyId]],
        ["cancel_sale", [A.companyId, A.saleId, null]],
      ] as const) {
        const err = await dbError(
          db.asAnon((c) => c.query(`select * from public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args as unknown as unknown[])),
        );
        expect(err.code, fn).toBe("42501");
      }
    });

    it("usuário autenticado sem vínculo com a empresa não executa nada", async () => {
      const stranger = await db.createUser("estranho@teste.local");
      const err = await dbError(db.rpc(stranger, "register_stock_movement", [A.companyId, A.productId, "entry", 1, null, null], ["uuid", "uuid", "stock_movement_type", "numeric", "text", "text"]));
      expect(err.code).toBe("42501");
      const { rows } = await db.asUser(stranger, (c) => c.query("select * from public.products"));
      expect(rows).toEqual([]);
    });

    it("requisição sem identidade (sem sub no JWT) é recusada", async () => {
      const err = await dbError(
        (async () => {
          const client = await db.admin.connect();
          try {
            await client.query("begin");
            await client.query("set local role authenticated");
            await client.query("select * from public.register_stock_movement($1, $2, 'entry', 1)", [A.companyId, A.productId]);
          } finally {
            await client.query("rollback").catch(() => undefined);
            client.release();
          }
        })(),
      );
      expect(err.code).toBe("42501");
    });

    it("tabelas e funções internas (schema private, contadores) não são acessíveis ao cliente", async () => {
      expect((await dbError(db.asUser(A.userId, (c) => c.query("select * from public.company_counters")))).code).toBe("42501");
      expect((await dbError(db.asUser(A.userId, (c) => c.query("select private.apply_stock_movement($1,$2,'entry',1,null,null,null,$3,'x')", [A.companyId, A.productId, A.userId])))).code).toBe("42501");
      expect((await dbError(db.asUser(A.userId, (c) => c.query("select private.assert_member($1)", [A.companyId])))).code).toBe("42501");
    });
  });

  describe("configurações da empresa e papéis", () => {
    it("proprietário altera configurações; funcionário não; colunas sensíveis não são graváveis", async () => {
      const staff = await db.createUser("staff-cfg@teste.local");
      await db.admin.query("insert into public.company_members (company_id, user_id, role) values ($1,$2,'staff')", [A.companyId, staff]);

      const owner = await db.asUser(A.userId, (c) => c.query("update public.companies set name = 'Alfa Comércio', default_min_stock = 3, timezone = 'America/Cuiaba' where id = $1", [A.companyId]));
      expect(owner.rowCount).toBe(1);
      const byStaff = await db.asUser(staff, (c) => c.query("update public.companies set name = 'Staff mudou' where id = $1", [A.companyId]));
      expect(byStaff.rowCount).toBe(0);
      expect((await dbError(db.asUser(A.userId, (c) => c.query("update public.companies set created_by = $2 where id = $1", [A.companyId, B.userId])))).code).toBe("42501");
      const again = await db.asUser(A.userId, (c) => c.query("update public.companies set name = 'Alfa Comércio 2' where id = $1", [A.companyId]));
      expect(again.rowCount).toBe(1);
    });

    it("valida fuso horário, margem mínima, e-mail e moeda", async () => {
      const upd = (set: string) => dbError(db.asUser(A.userId, (c) => c.query(`update public.companies set ${set} where id = $1`, [A.companyId])));
      expect((await upd("timezone = 'Marte/Olympus'")).code).toBe("SG005");
      expect((await upd("min_margin_percent = 100")).code).toBe("23514");
      expect((await upd("default_min_stock = -1")).code).toBe("23514");
      expect((await upd("contact_email = 'sem-arroba'")).code).toBe("23514");
      expect((await upd("currency = 'brl'")).code).toBe("23514");
      expect((await upd("currency = 'real'")).code).toBe("22001");
    });

    it("criação de empresa por função (limite por usuário) e cadastro sem empresa", async () => {
      const lone = await db.createUser(`${randomUUID()}@teste.local`, { full_name: "Sem empresa" });
      const { rows } = await db.admin.query("select count(*)::int n from public.company_members where user_id = $1", [lone]);
      expect(rows[0].n).toBe(0);
      const company = await db.rpc<{ id: string; name: string }>(lone, "create_company", ["  Minha Loja  "]);
      expect(company.name).toBe("Minha Loja");
      const { rows: member } = await db.admin.query("select role from public.company_members where company_id = $1", [company.id]);
      expect(member).toEqual([{ role: "owner" }]);
      expect((await dbError(db.rpc(lone, "create_company", ["x"]))).code).toBe("SG005");
    });
  });
});
