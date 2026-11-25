import { describe, expect, it } from "vitest";
import { daysBetween, percentChange, previousRange, resolvePeriod } from "@/lib/domain/periods";

describe("períodos do painel", () => {
  it("conta dias inclusive nas duas pontas", () => {
    expect(daysBetween("2026-11-24", "2026-11-24")).toBe(1);
    expect(daysBetween("2026-11-01", "2026-11-30")).toBe(30);
    expect(daysBetween("2026-02-01", "2026-03-01")).toBe(29); // 2026 não é bissexto: fev tem 28 dias
  });

  it("período anterior tem a mesma duração e termina um dia antes", () => {
    expect(previousRange({ from: "2026-11-18", to: "2026-11-24" })).toEqual({ from: "2026-11-11", to: "2026-11-17" });
    expect(previousRange({ from: "2026-11-24", to: "2026-11-24" })).toEqual({ from: "2026-11-23", to: "2026-11-23" });
    expect(previousRange({ from: "2026-03-01", to: "2026-03-10" })).toEqual({ from: "2026-02-19", to: "2026-02-28" });
  });

  it("predefinições", () => {
    const today = "2026-11-24";
    expect(resolvePeriod({ periodo: "hoje" }, today)).toMatchObject({ from: today, to: today, days: 1 });
    expect(resolvePeriod({ periodo: "7d" }, today)).toMatchObject({ from: "2026-11-18", to: today, days: 7 });
    expect(resolvePeriod({ periodo: "30d" }, today)).toMatchObject({ from: "2026-10-26", to: today, days: 30 });
    expect(resolvePeriod({ periodo: "mes" }, today)).toMatchObject({ from: "2026-11-01", to: today, days: 24 });
    expect(resolvePeriod({ periodo: "mes-anterior" }, today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 });
  });

  it("mês anterior atravessa a virada do ano", () => {
    expect(resolvePeriod({ periodo: "mes-anterior" }, "2027-01-15")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("padrão é 30 dias; valor desconhecido também", () => {
    expect(resolvePeriod({}, "2026-11-24").preset).toBe("30d");
    expect(resolvePeriod({ periodo: "qualquer" }, "2026-11-24").preset).toBe("30d");
  });

  it("datas personalizadas têm prioridade, são invertidas se necessário e limitadas a 731 dias", () => {
    expect(resolvePeriod({ periodo: "7d", de: "2026-11-10", ate: "2026-11-12" }, "2026-11-24")).toMatchObject({
      preset: "personalizado", from: "2026-11-10", to: "2026-11-12", days: 3,
    });
    expect(resolvePeriod({ de: "2026-11-12", ate: "2026-11-10" }, "2026-11-24")).toMatchObject({ from: "2026-11-10", to: "2026-11-12" });
    expect(resolvePeriod({ de: "2010-01-01", ate: "2026-11-24" }, "2026-11-24").days).toBe(731);
    // data inválida cai na predefinição
    expect(resolvePeriod({ de: "2026-02-31", ate: "2026-03-01" }, "2026-11-24").preset).toBe("30d");
  });

  it("variação percentual: arredonda a 1 casa e não divide por zero", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(133.33, 100)).toBe(33.3);
    expect(percentChange(10, -20)).toBe(150);
  });
});
