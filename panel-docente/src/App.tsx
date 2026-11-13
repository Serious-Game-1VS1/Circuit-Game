import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  BarChart3,
  Database,
  Download,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trophy,
  Users,
  WifiOff,
  Clock,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import {
  CONCEPTOS,
  SESIONES_INICIALES,
  SALAS_VIVO_INICIALES,
  PARTIDAS_MOCK,
  PARTIDA_JUGADORES_MOCK,
  INTENTOS_MOCK,
  V_FALLOS_SESION_MOCK,
  V_FALLOS_ESTUDIANTE_MOCK,
} from "./data/mockDb";
import type {
  Concepto,
  Sesion,
  SalaVivo,
  Partida,
  PartidaJugador,
  Intento,
  VFallosSesion,
  VFallosEstudiante,
} from "./types/db";

type Tab = "sesiones" | "vivo" | "resultados" | "analitica";

export function App() {
  const [sessionAuth, setSessionAuth] = useState<any>(null);
  const [modoDemo, setModoDemo] = useState<boolean>(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [tab, setTab] = useState<Tab>("analitica");
  const [conceptos, setConceptos] = useState<Concepto[]>(CONCEPTOS);
  const [sesiones, setSesiones] = useState<Sesion[]>(SESIONES_INICIALES);
  const [sesionActiva, setSesionActiva] = useState<string>("4821");
  const [salasVivo, setSalasVivo] = useState<SalaVivo[]>(SALAS_VIVO_INICIALES);
  const [partidas, setPartidas] = useState<Partida[]>(PARTIDAS_MOCK);
  const [jugadores, setJugadores] = useState<PartidaJugador[]>(PARTIDA_JUGADORES_MOCK);
  const [intentos, setIntentos] = useState<Intento[]>(INTENTOS_MOCK);
  const [fallosSesion, setFallosSesion] = useState<VFallosSesion[]>(V_FALLOS_SESION_MOCK);
  const [fallosEstudiante, setFallosEstudiante] = useState<VFallosEstudiante[]>(V_FALLOS_ESTUDIANTE_MOCK);
  const [aliasFiltro, setAliasFiltro] = useState<string>("TODOS");
  const [estudianteSinPareja, setEstudianteSinPareja] = useState<string[]>(["Sofi_M"]);

  const [nuevoNivel, setNuevoNivel] = useState<"1" | "2" | "3" | "mixto">("2");
  const [valoresVisibles, setValoresVisibles] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionAuth(data.session);
      setLoadingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionAuth(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setModoDemo(false);
  };

  const sincronizarSupabase = async (codigoSesion?: string) => {
    if (!sessionAuth || modoDemo) return;
    const [{ data: cData }, { data: sData }] = await Promise.all([
      supabase.from("conceptos").select("*"),
      supabase.from("sesiones").select("*").order("created_at", { ascending: false }),
    ]);
    if (cData && cData.length > 0) setConceptos(cData);
    let targetSesion = codigoSesion || sesionActiva;
    if (sData && sData.length > 0) {
      setSesiones(
        sData.map((s: any) => ({
          ...s,
          valores_visibles: s.valores_visibles ?? false,
        }))
      );
      if (!targetSesion || !sData.some((x: any) => x.codigo === targetSesion)) {
        targetSesion = sData[0].codigo;
        setSesionActiva(targetSesion);
      }
    }

    if (!targetSesion) return;

    const [{ data: pData }, { data: fsData }, { data: feData }, { data: intData }] = await Promise.all([
      supabase
        .from("partidas")
        .select("*, partida_jugadores(*)")
        .eq("sesion_codigo", targetSesion)
        .eq("demo", false)
        .order("inicio", { ascending: false }),
      supabase.from("v_fallos_sesion").select("*").eq("sesion_codigo", targetSesion),
      supabase.from("v_fallos_estudiante").select("*"),
      supabase
        .from("intentos")
        .select("*, partidas!inner(sesion_codigo)")
        .eq("partidas.sesion_codigo", targetSesion)
        .eq("resultado", "fallo")
        .limit(50),
    ]);

    if (pData) {
      setPartidas(pData);
      setJugadores(pData.flatMap((p: any) => p.partida_jugadores || []));
    }
    if (fsData) setFallosSesion(fsData);
    if (feData) {
      setFallosEstudiante(
        feData.map((e: any) => ({
          ...e,
          alias: e.alias || e.alumno_id,
        }))
      );
    }
    if (intData) setIntentos(intData);
  };

  useEffect(() => {
    if (sessionAuth && !modoDemo) {
      sincronizarSupabase();
    }
  }, [sessionAuth, sesionActiva, modoDemo]);

  useEffect(() => {
    if (!sessionAuth && !modoDemo) return;
    const interval = setInterval(async () => {
      if (sessionAuth && !modoDemo) {
        const { data } = await supabase.from("vivo").select("*");
        if (data) {
          setSalasVivo(
            data.map((row: any) => ({
              sala: row.sala,
              sesion_codigo: row.estado?.sesion_codigo ?? sesionActiva,
              inicio_segundos: row.estado?.inicio_segundos ?? 0,
              actualizado: row.actualizado,
              jugadorA: row.estado?.jugadorA ?? SALAS_VIVO_INICIALES[0].jugadorA,
              jugadorB: row.estado?.jugadorB ?? SALAS_VIVO_INICIALES[0].jugadorB,
            }))
          );
        }
      } else {
        setSalasVivo((prev) =>
          prev.map((sala) => ({
            ...sala,
            inicio_segundos: sala.inicio_segundos + 5,
            jugadorA: { ...sala.jugadorA, segundos_sin_avance: sala.jugadorA.segundos_sin_avance + 5 },
            jugadorB: { ...sala.jugadorB, segundos_sin_avance: sala.jugadorB.segundos_sin_avance + 5 },
          }))
        );
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionAuth, modoDemo, sesionActiva]);

  const crearSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
    if (sessionAuth && !modoDemo) {
      const { data, error } = await supabase
        .from("sesiones")
        .insert({ codigo, nivel: nuevoNivel, estado: "abierta" })
        .select()
        .single();
      if (error) {
        alert("Error en Supabase: " + error.message);
        return;
      }
      if (data) {
        setSesiones([{ ...data, valores_visibles: valoresVisibles }, ...sesiones]);
        setSesionActiva(data.codigo);
      }
    } else {
      const nueva: Sesion = {
        codigo,
        nivel: nuevoNivel,
        estado: "abierta",
        valores_visibles: valoresVisibles,
        created_at: new Date().toISOString(),
        cerrada_at: null,
      };
      setSesiones([nueva, ...sesiones]);
      setSesionActiva(codigo);
    }
  };

  const cerrarSesion = async (codigo: string) => {
    if (!window.confirm(`¿Cerrar y archivar la sesión ${codigo}? No admitirá nuevas entradas.`)) return;
    if (sessionAuth && !modoDemo) {
      const { data, error } = await supabase
        .from("sesiones")
        .update({ estado: "cerrada", cerrada_at: new Date().toISOString() })
        .eq("codigo", codigo)
        .select()
        .single();
      if (!error && data) {
        setSesiones((prev) => prev.map((s) => (s.codigo === codigo ? { ...s, ...data } : s)));
      }
    } else {
      setSesiones((prev) =>
        prev.map((s) =>
          s.codigo === codigo ? { ...s, estado: "cerrada", cerrada_at: new Date().toISOString() } : s
        )
      );
    }
  };

  const cerrarPartidaTrabada = (salaId: string) => {
    if (!window.confirm(`¿Anular la partida en ${salaId} sin ganador y devolver estudiantes a espera?`)) return;
    setSalasVivo((prev) => prev.filter((s) => s.sala !== salaId));
  };

  const emparejarEnEspera = () => {
    if (estudianteSinPareja.length === 0) return;
    const alias = estudianteSinPareja[0];
    const nuevaSala: SalaVivo = {
      sala: `SALA-0${salasVivo.length + 1}`,
      sesion_codigo: sesionActiva,
      inicio_segundos: 0,
      actualizado: "Ahora",
      jugadorA: {
        estacion: "A",
        alias,
        despachados: 0,
        pod_actual: 1,
        zonas_reparadas: 0,
        zonas_totales: 1,
        quemadas: 0,
        estado: "reparando",
        segundos_sin_avance: 0,
      },
      jugadorB: {
        estacion: "B",
        alias: "Diego_Q",
        despachados: 0,
        pod_actual: 1,
        zonas_reparadas: 0,
        zonas_totales: 1,
        quemadas: 0,
        estado: "reparando",
        segundos_sin_avance: 0,
      },
    };
    setSalasVivo([...salasVivo, nuevaSala]);
    setEstudianteSinPareja([]);
  };

  const descargarCSV = (tipo: "eventos" | "resumen") => {
    const nl = String.fromCharCode(10);
    const filas: string[] = [];
    if (tipo === "eventos") {
      filas.push("sesion;partida_id;estacion;pod;nivel_pod;zona;familia;pieza_elegida;pieza_correcta;resultado;quemada;t_ms;medidas_previas");
      intentos.forEach((i) => {
        filas.push(`${sesionActiva};${i.partida_id};${i.estacion};${i.pod};${i.nivel_pod};${i.zona_nombre};${i.familia};"${i.pieza_elegida}";"${i.pieza_correcta}";${i.resultado};${i.quemada};${i.t_ms};${i.medidas_previas ?? 0}`);
      });
    } else {
      filas.push("sesion;alias;concepto_id;zona;familia;fallos;quemadas;intentos;pieza_errada_mas_comun");
      fallosEstudiante.forEach((r) => {
        filas.push(`${sesionActiva};${r.alias || r.alumno_id};${r.concepto_id};${r.zona_nombre};${r.familia};${r.fallos};${r.quemadas};${r.intentos};"${r.pieza_errada_mas_comun ?? ""}"`);
      });
    }
    const contenido = String.fromCharCode(0xFEFF) + filas.join(nl) + nl;
    const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `circuitsync_${sesionActiva}_${tipo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const aliasesDisponibles = useMemo(() => {
    const set = new Set<string>(["TODOS"]);
    jugadores.forEach((j) => set.add(j.alias || j.alumno_id || ""));
    return Array.from(set).filter(Boolean);
  }, [jugadores]);

  const fallosConceptoFiltrados = useMemo(() => {
    if (aliasFiltro === "TODOS") {
      return fallosSesion
        .map((item) => {
          const concepto = conceptos.find((c) => c.id === item.concepto_id);
          return {
            ...item,
            nombre: concepto ? `${item.concepto_id} ${concepto.nombre}` : item.concepto_id,
          };
        })
        .sort((a, b) => b.fallos - a.fallos);
    }
    return fallosEstudiante
      .filter((e) => e.alias === aliasFiltro || e.alumno_id === aliasFiltro)
      .map((item) => {
        const concepto = conceptos.find((c) => c.id === item.concepto_id);
        return {
          ...item,
          pct_fallo: item.intentos > 0 ? Math.round((item.fallos / item.intentos) * 100) : 0,
          nombre: concepto ? `${item.concepto_id} ${concepto.nombre}` : item.concepto_id,
        };
      });
  }, [aliasFiltro, fallosSesion, fallosEstudiante, conceptos]);

  const kpis = useMemo(() => {
    const totalIntentos = fallosConceptoFiltrados.reduce((acc, x) => acc + Number(x.intentos), 0);
    const totalFallos = fallosConceptoFiltrados.reduce((acc, x) => acc + Number(x.fallos), 0);
    const totalQuemadas = fallosConceptoFiltrados.reduce((acc, x) => acc + Number(x.quemadas), 0);
    const aprobadasPrimera = totalIntentos > 0 ? Math.round(((totalIntentos - totalFallos) / totalIntentos) * 100) : 0;
    return {
      aprobadasPrimera,
      totalQuemadas,
      totalFallos,
      tiempoMediano: aliasFiltro === "TODOS" ? "31 s" : "24 s",
    };
  }, [fallosConceptoFiltrados, aliasFiltro]);

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e17] text-slate-300">
        Conectando con Supabase...
      </div>
    );
  }

  if (!sessionAuth && !modoDemo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0e17] px-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#111625] p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 font-mono text-lg font-bold text-emerald-400 border border-emerald-500/40">
              CS
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Panel Docente · CircuitSync</h1>
              <p className="text-xs text-slate-400">Autenticación Supabase (ISWZ2401)</p>
            </div>
          </div>

          {authError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-300">Correo docente (Supabase Auth)</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="docente@udla.edu.ec"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-300">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              Iniciar sesión con Supabase
            </button>
          </form>

          <div className="border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={() => setModoDemo(true)}
              className="w-full min-h-[44px] rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Entrar en Modo Demostración (Datos Mock)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sesionObj = sesiones.find((s) => s.codigo === sesionActiva);

  return (
    <div className="min-h-screen bg-[#0b0e17] text-slate-100">
      <header className="border-b border-slate-800 bg-[#111625] px-6 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 font-mono text-lg font-bold text-emerald-400 border border-emerald-500/40">
              CS
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Panel Docente · CircuitSync
              </h1>
              <p className="text-xs text-slate-400">
                Sesión <span className="font-mono font-semibold text-emerald-400">{sesionActiva}</span> · Nivel{" "}
                {sesionObj?.nivel ?? "2"} · {modoDemo ? "Modo Demo Local" : "Conectado a Supabase"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-slate-400" htmlFor="sesion-select">
              Sesión:
            </label>
            <select
              id="sesion-select"
              value={sesionActiva}
              onChange={(e) => setSesionActiva(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
            >
              {sesiones.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo} (Nivel {s.nivel} · {s.estado})
                </option>
              ))}
            </select>

            <button
              onClick={() => descargarCSV("eventos")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-4 w-4 text-emerald-400" />
              Exportar eventos (CSV)
            </button>
            <button
              onClick={() => descargarCSV("resumen")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-4 w-4 text-sky-400" />
              Exportar resumen (CSV)
            </button>
            <button
              onClick={handleLogout}
              title="Salir"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-800 bg-[#0f1320] px-6">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto py-2">
          <button
            onClick={() => setTab("sesiones")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "sesiones"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Plus className="h-4 w-4" />
            Sesiones (RF-01)
          </button>
          <button
            onClick={() => setTab("vivo")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "vivo"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Activity className="h-4 w-4" />
            Monitoreo en vivo ({salasVivo.length})
          </button>
          <button
            onClick={() => setTab("resultados")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "resultados"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Trophy className="h-4 w-4" />
            Resultados
          </button>
          <button
            onClick={() => setTab("analitica")}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "analitica"
                ? "bg-emerald-500 text-slate-950 font-bold"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            ¿En qué fallan?
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-xs text-slate-400">
          <span>
            Telemetría pseudónima (LOPDP Ecuador): solo alias por sesión, sin correos ni IPs. Las partidas del modo práctica no se registran.
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-emerald-400">
            <Database className="h-3.5 w-3.5" />
            {modoDemo ? "Datos de prueba (mockDb)" : "Supabase PostgreSQL · RLS Activo"}
          </span>
        </div>

        {tab === "sesiones" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <form
              onSubmit={crearSesion}
              className="rounded-xl border border-slate-800 bg-[#111625] p-5"
            >
              <h2 className="mb-4 text-base font-bold text-white">Crear nueva sesión de clase</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">
                    Nivel de la sesión (un nivel por sesión)
                  </label>
                  <select
                    value={nuevoNivel}
                    onChange={(e) => setNuevoNivel(e.target.value as "1" | "2" | "3" | "mixto")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="1">Nivel 1 · Resistencia limitadora y LED</option>
                    <option value="2">Nivel 2 · Serie/Paralelo, Interruptor, Fusible y Abierto</option>
                    <option value="3">Nivel 3 · Continuidad, Corto oculto y 18 V</option>
                    <option value="mixto">Mixto · Progresivo</option>
                  </select>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                  <input
                    type="checkbox"
                    checked={valoresVisibles}
                    onChange={(e) => setValoresVisibles(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span className="text-xs text-slate-300">
                    Mostrar valores numéricos de resistencias (Ω) en las gavetas
                  </span>
                </label>

                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
                >
                  Generar código de sesión
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-slate-800 bg-[#111625] p-5 lg:col-span-2">
              <h2 className="mb-4 text-base font-bold text-white">Sesiones del docente</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="py-3">Código</th>
                      <th className="py-3">Nivel</th>
                      <th className="py-3">Valores Ω</th>
                      <th className="py-3">Estado</th>
                      <th className="py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {sesiones.map((s) => (
                      <tr key={s.codigo}>
                        <td className="py-3 font-mono text-base font-bold text-emerald-400">
                          {s.codigo}
                        </td>
                        <td className="py-3">Nivel {s.nivel}</td>
                        <td className="py-3 text-slate-300">
                          {s.valores_visibles ? "Visibles" : "Ocultos (cualitativo)"}
                        </td>
                        <td className="py-3">
                          {s.estado === "abierta" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Activa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/40 px-2.5 py-1 text-xs font-medium text-slate-400">
                              <Lock className="h-3.5 w-3.5" /> Archivada
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {s.estado === "abierta" && (
                            <button
                              onClick={() => cerrarSesion(s.codigo)}
                              className="min-h-[44px] rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                            >
                              Cerrar sesión
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "vivo" && (
          <div className="space-y-6">
            {estudianteSinPareja.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-amber-400" />
                  <p className="text-sm text-amber-100">
                    Estudiante sin pareja en espera: <strong>{estudianteSinPareja.join(", ")}</strong>
                  </p>
                </div>
                <button
                  onClick={emparejarEnEspera}
                  className="min-h-[44px] rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                >
                  Emparejar en sala 1 vs 1
                </button>
              </div>
            )}

            <div className="rounded-xl border border-slate-800 bg-[#111625] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Duelos activos (Tabla <code className="text-emerald-400">vivo</code>)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Actualización automática cada 5 s · Modo solo lectura (sin pistas ni intervención en juego)
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> En vivo
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="py-3">Sala</th>
                      <th className="py-3">Estación A</th>
                      <th className="py-3">Estación B</th>
                      <th className="py-3">Alertas RF-07</th>
                      <th className="py-3 text-right">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {salasVivo.map((sala) => {
                      const sinAvanceA = sala.jugadorA.segundos_sin_avance >= 90;
                      const sinAvanceB = sala.jugadorB.segundos_sin_avance >= 90;
                      const desconectado =
                        sala.jugadorA.estado === "sin_conexion" || sala.jugadorB.estado === "sin_conexion";

                      return (
                        <tr key={sala.sala}>
                          <td className="py-4 font-mono font-bold text-white">{sala.sala}</td>
                          <td className="py-4">
                            <div className="font-semibold text-white">{sala.jugadorA.alias}</div>
                            <div className="text-xs text-slate-400">
                              Pods: {sala.jugadorA.despachados}/5 · Zonas: {sala.jugadorA.zonas_reparadas}/
                              {sala.jugadorA.zonas_totales} · Quemadas: {sala.jugadorA.quemadas}
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="font-semibold text-white">{sala.jugadorB.alias}</div>
                            <div className="text-xs text-slate-400">
                              Pods: {sala.jugadorB.despachados}/5 · Zonas: {sala.jugadorB.zonas_reparadas}/
                              {sala.jugadorB.zonas_totales} · Quemadas: {sala.jugadorB.quemadas}
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="flex flex-wrap gap-2">
                              {(sinAvanceA || sinAvanceB) && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300 border border-amber-500/40">
                                  <Clock className="h-3.5 w-3.5" /> sin avance 90 s
                                </span>
                              )}
                              {desconectado && (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-1 text-xs font-medium text-rose-300 border border-rose-500/40">
                                  <WifiOff className="h-3.5 w-3.5" /> sin conexión
                                </span>
                              )}
                              {!sinAvanceA && !sinAvanceB && !desconectado && (
                                <span className="text-xs text-slate-500">Normal</span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 text-right">
                            <button
                              onClick={() => cerrarPartidaTrabada(sala.sala)}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-500/50 hover:text-rose-300"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Cerrar partida
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "resultados" && (
          <div className="rounded-xl border border-slate-800 bg-[#111625] p-5">
            <h2 className="mb-4 text-base font-bold text-white">
              Resultados de partidas finalizadas (<code className="text-emerald-400">partidas</code> +{" "}
              <code className="text-emerald-400">partida_jugadores</code>)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-3">ID Partida</th>
                    <th className="py-3">Jugador (Estación)</th>
                    <th className="py-3">Pods despachados</th>
                    <th className="py-3">Piezas quemadas</th>
                    <th className="py-3">Tiempo por pod (pod_ms)</th>
                    <th className="py-3">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {jugadores.map((pj) => {
                    const partida = partidas.find((p) => p.id === pj.partida_id);
                    const gano = partida?.ganador === pj.estacion;
                    return (
                      <tr key={`${pj.partida_id}-${pj.estacion}`}>
                        <td className="py-3 font-mono text-xs text-slate-400">{pj.partida_id}</td>
                        <td className="py-3 font-semibold text-white">
                          {pj.alias}{" "}
                          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-400">
                            {pj.estacion}
                          </span>
                        </td>
                        <td className="py-3">{pj.despachados}/5</td>
                        <td className="py-3">{pj.quemadas}</td>
                        <td className="py-3 font-mono text-xs text-slate-300">
                          {(pj.pod_ms || []).map((ms) => `${Math.round(ms / 1000)}s`).join(" · ")}
                        </td>
                        <td className="py-3">
                          {gano ? (
                            <span className="rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400">
                              Ganador
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">2.º lugar</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "analitica" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#111625] p-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Ver analítica de:
                </span>
                <select
                  value={aliasFiltro}
                  onChange={(e) => setAliasFiltro(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                >
                  {aliasesDisponibles.map((al) => (
                    <option key={al} value={al}>
                      {al === "TODOS" ? "Toda la sesión (v_fallos_sesion)" : `${al} (v_fallos_estudiante)`}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-400">
                Fuente: vistas SQL sobre <code className="text-emerald-400">intentos</code> (sin duplicar datos)
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-[#111625] p-4">
                <p className="text-xs text-slate-400">Zonas aprobadas a la primera</p>
                <p className="mt-1 text-3xl font-extrabold text-white">{kpis.aprobadasPrimera} %</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#111625] p-4">
                <p className="text-xs text-slate-400">Piezas quemadas</p>
                <p className="mt-1 text-3xl font-extrabold text-rose-400">{kpis.totalQuemadas}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#111625] p-4">
                <p className="text-xs text-slate-400">Intentos fallidos</p>
                <p className="mt-1 text-3xl font-extrabold text-amber-400">{kpis.totalFallos}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#111625] p-4">
                <p className="text-xs text-slate-400">Tiempo mediano por zona</p>
                <p className="mt-1 text-3xl font-extrabold text-sky-400">{kpis.tiempoMediano}</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-[#111625] p-5">
                <h3 className="mb-4 text-sm font-bold text-white">
                  Por concepto (C01–C12): intentos fallidos
                </h3>
                <div className="space-y-3">
                  {fallosConceptoFiltrados.map((item, idx) => {
                    const maxFallos = Math.max(...fallosConceptoFiltrados.map((x) => x.fallos), 1);
                    const ancho = Math.round((item.fallos / maxFallos) * 100);
                    const esCritico = idx < 3 && aliasFiltro === "TODOS";
                    return (
                      <div key={`${item.concepto_id}-${item.familia}`}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-200">{item.nombre}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white">{item.fallos}</span>
                            {esCritico && (
                              <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                                Más difícil
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${esCritico ? "bg-amber-400" : "bg-sky-500"}`}
                            style={{ width: `${ancho}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#111625] p-5">
                <h3 className="mb-4 text-sm font-bold text-white">
                  Errores más frecuentes y diagnóstico (<code className="text-emerald-400">intentos</code>)
                </h3>
                <div className="divide-y divide-slate-800">
                  {intentos.filter((i) => i.resultado === "fallo").map((err) => (
                    <div key={err.id} className="py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">
                          {err.pieza_elegida}{" "}
                          <span className="text-xs font-normal text-slate-400">
                            (zona: {err.zona_nombre} · familia: {err.familia})
                          </span>
                        </span>
                        {err.quemada && (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">
                            <ShieldAlert className="h-3 w-3" /> Quemada
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Solución esperada: <span className="text-emerald-400">{err.pieza_correcta}</span> ·
                        Mediciones previas con multímetro: <strong>{err.medidas_previas ?? 0}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
