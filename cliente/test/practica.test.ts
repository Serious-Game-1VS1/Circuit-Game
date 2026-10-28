import { describe, expect, it } from "vitest";
import { generar } from "../../spike/src/engine/generador";
import type { ServerMsg } from "../../spike/src/protocol";
import { PracticaTransport } from "../src/practica";

describe("PracticaTransport de un solo pod", () => {
  it("el árbitro recibe solo ese pod (total 1) con las zonas de la misma semilla", async () => {
    const msgs: ServerMsg[] = [];
    const tr = new PracticaTransport(1, 77, false, 2);
    tr.onMessage = (m) => msgs.push(m as ServerMsg);
    await tr.join();
    tr.send({ t: "hello", alias: "ana" });
    await Promise.resolve();
    const start = msgs.find((m) => m.t === "start")!;
    expect(start).toMatchObject({ total: 1, despachados: 0 });
    expect(tr.arbiter.pods).toEqual(generar(77, 1).slice(2, 3));
    await tr.close();
  });
  it("sin pod sigue siendo de 5", () => {
    expect(new PracticaTransport(1, 77).arbiter.pods).toHaveLength(5);
  });
});
