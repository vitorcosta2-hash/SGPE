import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, dbTestsEnabled, type TestDb } from "./helpers";
import { lineGrossCents } from "@/lib/domain/money";
import { promoPrice } from "@/lib/domain/promotions";
import type { DiscountType } from "@/lib/domain/stock";

const enabled = await dbTestsEnabled();

/** A prévia mostrada no navegador (TypeScript) precisa coincidir com o valor calculado pelo banco. */
describe.skipIf(!enabled)("paridade TypeScript × SQL nos cálculos de preço", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.close();
  });

  it("promo_price: grade de valores", async () => {
    const types: DiscountType[] = ["percentage", "amount_off", "fixed_price"];
    const values = [0.01, 1, 5, 7.5, 10, 12.34, 15, 25, 33.33, 50, 99.99, 150];
    const bases = [0, 0.01, 0.99, 1, 3.33, 10, 19.9, 49.99, 100, 1234.56];
    let checked = 0;
    for (const type of types) {
      for (const value of values) {
        if (type === "percentage" && value >= 100) continue;
        for (const base of bases) {
          const { rows } = await db.admin.query(
            "select private.promo_price($1::public.discount_type, $2::numeric, $3::numeric) as p",
            [type, value, base],
          );
          expect(promoPrice(type, value, base), `${type} ${value} sobre ${base}`).toBe(Number(rows[0].p));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("valor da linha: round(quantidade × preço, 2)", async () => {
    const quantities = [0.001, 0.005, 0.01, 0.125, 0.333, 0.5, 1, 1.5, 2.675, 3, 10.25, 99.999];
    const prices = [0.01, 0.33, 0.99, 1.005 >= 0 ? 1.01 : 0, 3.33, 9.99, 33.33, 123.45];
    for (const q of quantities) {
      for (const p of prices) {
        const { rows } = await db.admin.query("select round($1::numeric * $2::numeric, 2) as v", [q, p]);
        expect(lineGrossCents(q, p), `${q} × ${p}`).toBe(Math.round(Number(rows[0].v) * 100));
      }
    }
  });
});
