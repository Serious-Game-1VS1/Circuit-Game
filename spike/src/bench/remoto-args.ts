export interface ArgsRemoto { codigo: string; region: string; muestras: number; maxSeg: number }

/** Argumentos `--codigo --region --muestras --max-seg`; si faltan, variables BENCH_CODIGO / PHOTON_REGION. */
export function parseArgs(argv: string[], env: Record<string, string | undefined> = {}): ArgsRemoto {
  const get = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1]?.trim() : undefined; };
  const num = (k: string, def: number) => {
    const v = get(k);
    if (v === undefined) return def;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${k} debe ser un número positivo`);
    return n;
  };
  const codigo = (get("codigo") ?? env.BENCH_CODIGO ?? "").toUpperCase();
  if (!codigo) throw new Error("Falta el código de sala: --codigo ABC123");
  return { codigo, region: get("region") ?? env.PHOTON_REGION?.trim() ?? "us", muestras: num("muestras", 100), maxSeg: num("max-seg", 300) };
}
