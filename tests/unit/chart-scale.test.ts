import { describe, expect, it } from "vitest";
import { axisTicks, compactNumber, nearestIndex, niceMax, xPositions } from "@/lib/chart-scale";

describe("escala dos gráficos", () => {
  it("arredonda o máximo para um valor legível", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-5)).toBe(1);
    expect(niceMax(NaN)).toBe(1);
    expect(niceMax(0.7)).toBe(1);
    expect(niceMax(87)).toBe(100);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(101)).toBe(200);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(430)).toBe(500);
    expect(niceMax(5100)).toBe(10000);
  });
  it("gera marcas equidistantes começando em zero", () => {
    expect(axisTicks(430)).toEqual([0, 100, 200, 300, 400, 500]);
    expect(axisTicks(2300)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(axisTicks(180)).toEqual([0, 50, 100, 150, 200]);
    expect(axisTicks(0)).toEqual([0, 0.2, 0.4, 0.6000000000000001, 0.8, 1]);
    expect(axisTicks(430, 4)).toEqual([0, 125, 250, 375, 500]);
  });
  it("posiciona pontos e acha o mais próximo", () => {
    expect(xPositions(0, 10, 100)).toEqual([]);
    expect(xPositions(1, 10, 100)).toEqual([60]);
    expect(xPositions(3, 10, 100)).toEqual([10, 60, 110]);
    expect(nearestIndex([10, 60, 110], 70)).toBe(1);
    expect(nearestIndex([10, 60, 110], 200)).toBe(2);
    expect(nearestIndex([10, 60, 110], -50)).toBe(0);
  });
  it("abrevia números dos eixos de forma determinística", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(125)).toBe("125");
    expect(compactNumber(0.25)).toBe("0,3");
    expect(compactNumber(1000)).toBe("1 mil");
    expect(compactNumber(1500)).toBe("1,5 mil");
    expect(compactNumber(250_000)).toBe("250 mil");
    expect(compactNumber(2_000_000)).toBe("2 mi");
    expect(compactNumber(-1500)).toBe("−1,5 mil");
  });
});
