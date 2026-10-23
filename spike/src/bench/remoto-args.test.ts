import { describe, expect, it } from "vitest";
import { parseArgs } from "./remoto-args.js";

describe("bench:remoto · argumentos", () => {
  it("lee código, región y límites; el código va en mayúsculas", () => {
    expect(parseArgs(["--codigo", "abc123", "--region", "sa", "--muestras", "20", "--max-seg", "60"]))
      .toEqual({ codigo: "ABC123", region: "sa", muestras: 20, maxSeg: 60 });
  });
  it("usa valores por defecto y variables de entorno", () => {
    expect(parseArgs([], { BENCH_CODIGO: "XYZ789" })).toEqual({ codigo: "XYZ789", region: "us", muestras: 100, maxSeg: 300 });
  });
  it("rechaza sin código o con números inválidos", () => {
    expect(() => parseArgs([])).toThrow(/código/);
    expect(() => parseArgs(["--codigo", "A", "--muestras", "0"])).toThrow(/muestras/);
  });
});
