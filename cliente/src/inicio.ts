/**
 * Menú de inicio «Hangar de reparación» (escena Entrar): fondo con scroll lento, título, la mejor nave del
 * jugador sobre la bahía, placa de perfil y acciones (duelo, aprender, logros). Solo dibuja: la entrada y la
 * práctica llaman a `net` como siempre. Textos de perfil en perfil.ts (bienvenida, textoNivel).
 */
import * as Phaser from "phaser";
import type { Nivel } from "../../spike/src/protocol";
import { salasAbiertas, textoSala, type Net, type SalaInfo } from "./net";
import type { DificultadBot } from "./contraBot";
import { anim, letras, marco } from "./arte";
import { alternarSilencio, desbloquear, silenciado, sonar } from "./audio";
import { bienvenida, cambiarNivel, cargarPerfil, INSIGNIAS, mejorNave, nivelElegido, progresoRango, recordarAlias, textoNivel, tutorialCompletado, ultimoAlias } from "./perfil";
import type { Pantalla } from "./pantalla";
import { MECANICAS } from "./tutorial";
import { chasis } from "./podio";
import { panelLogros } from "./recompensas";

const W = 360, D = 1900; // el panel de recompensas/logros va a 2000: queda encima
const AMBAR = 0xe0a43c, CIAN = 0x7fe0ff, GRIS = 0x9ab0c8, ROJO = 0xff6b6b, VERDE = 0x8fe3a0;
const CAMPO = `width:100%;box-sizing:border-box;height:44px;font:700 22px "Courier New",monospace;letter-spacing:2px;color:#e8f6ff;background:#10141e;border:3px solid ${"#7fe0ff"};border-radius:0;padding:0 10px;outline:none`;

export function menu(s: Phaser.Scene, net: Net) {
  const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const sono = (fn: () => void) => () => { desbloquear(); sonar("clic"); fn(); };

  // --- Fondo: cielo y capa lejana de 360x800 recortadas al lienzo de 640; la lejana avanza despacio ---
  s.add.image(0, 0, "capa_cielo_movil").setOrigin(0).setScale(4);
  const lejana = s.add.tileSprite(0, 0, 90, 200, "capa_lejana_movil").setOrigin(0).setScale(4);
  if (!reducido) s.tweens.add({ targets: lejana, tilePositionX: 180, duration: 90000, repeat: -1 }); // 180 px de textura = un período

  // --- Cabecera ---
  const foco = anim(s, 20, 28, "foco_parpadeo", 2);
  if (reducido) foco.stop();
  letras(s, 40, 20, "TALLER LISTO", 2, GRIS);
  // Silencio: sobre los paneles (D+300), dentro del borde del panel (no sobre su esquina); 32x32 visibles, zona táctil 44x44.
  const SX = W - 50, SY = 46;
  const cajaSil = s.add.rectangle(SX, SY, 32, 32, 0x3a4466).setStrokeStyle(2, CIAN).setDepth(D + 300);
  const iconoSil = s.add.text(SX, SY + 1, "", { fontSize: "22px", color: "#fff" }).setOrigin(0.5).setDepth(D + 301);
  const pintarSil = () => { iconoSil.setText(silenciado() ? "×" : "♪").setColor(silenciado() ? "#ff6b6b" : "#8fe3a0"); };
  s.add.zone(SX, SY, 44, 44).setDepth(D + 302).setInteractive({ useHandCursor: true }).on("pointerdown", () => { desbloquear(); alternarSilencio(); pintarSil(); });
  void cajaSil; pintarSil();

  // --- Título y eslogan ---
  const titulo = letras(s, W / 2, 58, "CIRCUITSYNC", 4, AMBAR).setOrigin(0.5, 0);
  const led = s.add.image(W / 2 + titulo.width / 2 + 16, 74, "led_rojo_encendido").setScale(2);
  const cabecera = s.add.container(0, 0, [titulo, led]);
  if (!reducido) {
    cabecera.setAlpha(0).y = -60;
    s.tweens.add({ targets: cabecera, y: 0, alpha: 1, duration: 400, ease: "Back.Out" });
    let on = true;
    s.time.addEvent({ delay: 600, loop: true, callback: () => led.setTexture((on = !on) ? "led_rojo_encendido" : "led_rojo_tenue") });
  }
  letras(s, W / 2, 100, "Repara el pod. Entiende el circuito.", 2, CIAN).setOrigin(0.5, 0);

  // --- Nave sobre la bahía ---
  anim(s, W / 2, 218, "bahia", 4);
  const nave = s.add.sprite(0, 0, "pod1_cometa_reparado_0").setOrigin(0.5, 1).setScale(2);
  const humo = anim(s, -64, -62, "humo", 3);
  const llama = anim(s, -92, -30, "llama_turbo_cian", 2);
  const flota = s.add.container(W / 2, 214, [llama, nave, humo]);
  if (reducido) { humo.stop(); llama.stop(); }
  else s.tweens.add({ targets: flota, y: 214 - 6, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.InOut" }); // ±3 px

  const bien = letras(s, W / 2, 290, "", 2, 0xdde8f2).setOrigin(0.5, 0).setMaxWidth(328).setCenterAlign();

  // --- Placa de perfil (toca para abrir Logros) ---
  marco(s, W / 2, 386, "panel_oscuro", 328, 118, 2);
  const rango = letras(s, 34, 341, "", 2, 0xffffff);
  const xp = letras(s, 326, 341, "", 2, GRIS).setOrigin(1, 0);
  s.add.rectangle(34, 368, 292, 10, 0x3a4466).setOrigin(0, 0.5);
  const barra = s.add.rectangle(34, 368, 292, 10, CIAN).setOrigin(0, 0.5);
  s.add.image(45, 392, "icono_estrella").setScale(2);
  const insignias = letras(s, 62, 384, "", 2, 0xffffff);
  const iconoN2 = s.add.image(45, 418, "icono_candado").setScale(2);
  const nivel2 = letras(s, 62, 410, "", 2, GRIS);
  s.add.zone(W / 2, 386, 328, 118).setInteractive({ useHandCursor: true }).on("pointerdown", sono(() => panelLogros(s, refrescar())));

  // --- Botones ---
  const boton = (x: number, y: number, w: number, h: number, t: string, primario: boolean, fn: () => void, k = 3) => {
    const m = marco(s, x, y, primario ? "boton_primario" : "boton_secundario", w, h, 4);
    const l = letras(s, x, y, t, k).setOrigin(0.5);
    const z = s.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).on("pointerdown", sono(fn));
    return [m, l, z];
  };
  boton(W / 2, 481, 328, 56, "JUGAR DUELO", true, () => abrir(duelo));
  boton(W / 2 - 84, 541, 160, 48, "APRENDER", false, () => abrir(aprender));
  boton(W / 2 + 84, 541, 160, 48, "LOGROS", false, () => panelLogros(s, refrescar()));
  const aviso = letras(s, W / 2, 574, "", 2, ROJO).setOrigin(0.5, 0).setMaxWidth(328).setCenterAlign().setDepth(D + 200);

  // --- Paneles emergentes (se crean ocultos; los campos HTML se esconden con ellos) ---
  const panel = (y: number, h: number, t: string) => {
    const c = s.add.container(0, 0).setDepth(D).setVisible(false);
    c.add(s.add.rectangle(W / 2, 320, W, 640, 0x0b0e16, 0.88).setInteractive()); // tapa y bloquea lo de abajo
    c.add(marco(s, W / 2, y + h / 2, "panel_oscuro", 328, h, 2));
    c.add(letras(s, W / 2, y + 16, t, 3, AMBAR).setOrigin(0.5, 0));
    return c;
  };
  const etiqueta = (c: Phaser.GameObjects.Container, x: number, y: number, t: string) => c.add(letras(s, x, y, t, 2, GRIS));
  let abierto: Phaser.GameObjects.Container | null = null;
  const abrir = (c: Phaser.GameObjects.Container | null) => {
    abierto?.setVisible(false);
    abierto = c;
    c?.setVisible(true);
    for (const f of [codigoDom, aliasDom]) f.setVisible(c === duelo);
    aviso.setY(c === duelo ? 426 : 574);
    if (c === duelo) void consultar();
    if (c !== duelo) aviso.setText(""); // el error del duelo no sigue visible en otros paneles
  };

  // Duelo: código de sala + alias. Los campos HTML son uno por entrada, sobre el canvas.
  const campoDom = (y: number, nombre: string, extra: string) =>
    s.add.dom(W / 2, y).createFromHTML(`<div style="width:296px"><input name="${nombre}" autocomplete="off" ${extra}
      onfocus="this.style.borderColor='#e0a43c'" onblur="this.style.borderColor='#7fe0ff'" style="${CAMPO}"></div>`).setVisible(false);
  const aliasDom = campoDom(104, "alias", `maxlength="12" placeholder="Tu alias" aria-label="Alias"`);
  const codigoDom = campoDom(166, "codigo", `maxlength="6" placeholder="ABC123" aria-label="Código de sala"`);
  const campo = (d: Phaser.GameObjects.DOMElement) => d.node.querySelector("input")!;
  const codigoIn = campo(codigoDom), aliasIn = campo(aliasDom);
  codigoIn.style.cssText = CAMPO + ";text-transform:uppercase"; // un solo atributo style: el del HTML de arriba se ignoraría
  aliasIn.style.cssText = CAMPO;
  aliasIn.value = net.estado.alias || ultimoAlias(); // «Volver a jugar» y la sesión anterior conservan el alias
  const alias = () => aliasIn.value.trim();

  const duelo = panel(16, 612, "JUGAR DUELO");
  etiqueta(duelo, 34, 60, "ALIAS");
  etiqueta(duelo, 34, 128, "CODIGO DE SALA (6)");
  const entrar = () => { if (alias()) recordarAlias(alias()); void net.entrar(codigoIn.value, aliasIn.value); };
  duelo.add(boton(W / 2, 220, 296, 44, "ENTRAR", true, entrar, 2.5));
  for (const i of [codigoIn, aliasIn]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });
  aliasIn.addEventListener("input", () => refrescar());

  // Salas abiertas: hasta 4 tarjetas, «MAS» pasa de página; se consultan cada 4 s mientras el duelo está abierto.
  etiqueta(duelo, 34, 250, "SALAS ABIERTAS");
  let salas: SalaInfo[] = [], pagina = 0, motivo: string | undefined, consulta = 0;
  const vacio = letras(s, W / 2, 322, "", 2, GRIS).setOrigin(0.5).setMaxWidth(296).setCenterAlign();
  duelo.add(vacio);
  const filas = [0, 1, 2, 3].map((k) => {
    const y = 284 + 38 * k;
    const m = marco(s, W / 2, y, "boton_secundario", 296, 34, 4);
    const l = letras(s, 50, y, "", 2).setOrigin(0, 0.5);
    const z = s.add.zone(W / 2, y, 296, 34).setInteractive({ useHandCursor: true }).on("pointerdown", sono(() => {
      const sala = salasAbiertas(salas)[pagina * 4 + k];
      if (!sala) return;
      codigoIn.value = sala.codigo;
      if (alias()) entrar();
      else { aviso.setText("Escribe tu alias para entrar"); aliasIn.focus(); }
    }));
    duelo.add([m, l, z]);
    return { m, l, z };
  });
  const mas = letras(s, W - 34, 250, "", 2, CIAN).setOrigin(1, 0);
  duelo.add(mas);
  duelo.add(s.add.zone(W - 60, 258, 60, 28).setInteractive({ useHandCursor: true }).on("pointerdown", sono(() => { pagina++; pintarSalas(); })));
  function pintarSalas() {
    const ab = salasAbiertas(salas);
    if (pagina * 4 >= ab.length) pagina = 0;
    filas.forEach((f, k) => {
      const sala = ab[pagina * 4 + k];
      f.m.setVisible(!!sala); f.l.setVisible(!!sala); f.z.input!.enabled = !!sala && abierto === duelo;
      if (sala) f.l.setText(textoSala(sala));
    });
    mas.setText(ab.length > 4 ? `MAS ${pagina + 1}/${Math.ceil(ab.length / 4)}` : "");
    vacio.setText(motivo ? "Sin conexión a salas" : ab.length ? "" : "No hay salas abiertas. Crea una o juega solo.");
  }
  const consultar = async () => {
    const mia = ++consulta;
    const r = await net.listarSalas(3500);
    if (mia !== consulta || abierto !== duelo) return; // llegó tarde: se cerró el duelo o hay una consulta más nueva
    salas = r.salas; motivo = r.motivo; pintarSalas();
  };
  s.time.addEvent({ delay: 4000, loop: true, callback: () => { if (abierto === duelo) void consultar(); } });
  s.events.once("shutdown", () => { consulta = Infinity; });
  pintarSalas();

  // Jugar solo: duelo contra un bot con dificultad recordada.
  const DIFS: [DificultadBot, string][] = [["facil", "FACIL"], ["normal", "NORMAL"], ["dificil", "DIFICIL"]];
  let dif: DificultadBot = "normal";
  try { const g = localStorage.getItem("circuitsync.dificultad"); if (g === "facil" || g === "normal" || g === "dificil") dif = g; } catch { /* sin disco */ }
  duelo.add(letras(s, W / 2, 462, "Duelo contra un rival bot", 2, CIAN).setOrigin(0.5, 0));
  const chips = DIFS.map(([d, nombre], k) => {
    const x = W / 2 + (k - 1) * 100;
    const m = marco(s, x, 504, "boton_secundario", 92, 40, 4);
    const l = letras(s, x, 504, nombre, 2, 0x140f1f).setOrigin(0.5);
    const z = s.add.zone(x, 504, 92, 40).setInteractive({ useHandCursor: true }).on("pointerdown", sono(() => {
      dif = d; try { localStorage.setItem("circuitsync.dificultad", d); } catch { /* sin disco */ } pintarDif();
    }));
    duelo.add([m, l, z]);
    return { m, d };
  });
  const pintarDif = () => { for (const c of chips) c.m.setTexture(c.d === dif ? "boton_primario" : "boton_secundario"); };
  pintarDif();
  duelo.add(boton(W / 2, 552, 296, 48, "JUGAR SOLO", true, () => { if (alias()) recordarAlias(alias()); void net.jugarSolo(alias() || ultimoAlias(), nivelElegido(pf, 1), dif); }));
  duelo.add(boton(W / 2, 604, 296, 40, "CANCELAR", false, () => abrir(null), 2.5));

  // Aprender: MECÁNICAS (tarjetas por mecánica), PRÁCTICA con selector de nivel (en duelo el nivel lo fija el servidor) y VOLVER.
  let sel: Nivel = 1, pf = cargarPerfil(alias() || "Aprendiz");
  const quien = () => alias() || "Aprendiz";
  const jugar = () => { recordarAlias(quien()); return quien(); }; // el Taller guarda el ✓ en este mismo perfil
  const aprender = panel(60, 450, "APRENDER");
  aprender.add(boton(W / 2, 190, 296, 56, "MECANICAS", false, () => abrir(mecs)));

  // Mecánicas: 2 columnas x 5 filas. El candado de nivel 2 solo informa: el toque siempre abre (demo).
  const mecs = panel(40, 480, "MECANICAS");
  const tarjetas = MECANICAS.map((m, k) => {
    const x = W / 2 + (k % 2 ? 76 : -76), y = 112 + 60 * Math.floor(k / 2);
    const f = marco(s, x, y, "boton_secundario", 144, 54, 4);
    const nombre = letras(s, x - 6, y, m.nombre.toUpperCase(), 1.5).setOrigin(0.5);
    const marca = s.add.image(x + 58, y - 16, "icono_pasa").setScale(1.5);
    const candado = s.add.image(x - 58, y - 16, "icono_candado").setScale(1.5);
    const z = s.add.zone(x, y, 144, 54).setInteractive({ useHandCursor: true }).on("pointerdown", sono(() => {
      void net.practicar(jugar(), m.nivel, true, false, m.id);
    }));
    mecs.add([f, nombre, marca, candado, z]);
    return { f, marca, candado, m };
  });
  const infoMec = letras(s, W / 2, 400, "", 2, GRIS).setOrigin(0.5, 0).setMaxWidth(296).setCenterAlign();
  mecs.add(infoMec);
  mecs.add(boton(W / 2, 480, 296, 48, "VOLVER", false, () => abrir(aprender)));
  const fichas = ([1, 2] as Nivel[]).map((n) => {
    const x = W / 2 + (n === 1 ? -76 : 76);
    const m = marco(s, x, 276, "boton_secundario", 144, 48, 4);
    const candado = s.add.image(x - 44, 276, "icono_candado").setScale(2);
    const l = letras(s, x + (n === 2 ? 10 : 0), 276, `NIVEL ${n}`, 2).setOrigin(0.5);
    const z = s.add.zone(x, 276, 144, 48).setInteractive({ useHandCursor: true }).on("pointerdown", sono(() => { if (n !== sel) { sel = cambiarNivel(pf, sel); refrescar(); } }));
    aprender.add([m, candado, l, z]);
    return { m, candado, n };
  });
  const textoSel = letras(s, W / 2, 308, "", 2, GRIS).setOrigin(0.5, 0).setMaxWidth(296).setCenterAlign();
  aprender.add(textoSel);
  aprender.add(boton(W / 2, 396, 296, 56, "PRACTICAR", true, () => void net.practicar(jugar(), nivelElegido(pf, sel))));
  aprender.add(boton(W / 2, 460, 296, 48, "VOLVER", false, () => abrir(null)));

  // Perfil del alias escrito (o «Aprendiz»): rango, XP, insignias, nivel 2 y nivel de práctica.
  function refrescar() {
    pf = cargarPerfil(quien());
    const r = progresoRango(pf.xp);
    sel = nivelElegido(pf, sel);
    bien.setText(bienvenida(pf));
    rango.setText(r.actual.toUpperCase());
    xp.setText(r.siguiente ? `${r.n}/${r.m} XP` : `${pf.xp} XP`);
    barra.width = Math.max(2, 292 * (r.siguiente ? r.n / r.m : 1));
    insignias.setText(`INSIGNIAS ${pf.insignias.length}/${INSIGNIAS.length}`);
    const abierto2 = pf.nivelDesbloqueado === 2;
    iconoN2.setTexture(abierto2 ? "icono_pasa" : "icono_candado");
    nivel2.setText(abierto2 ? "NIVEL 2: ABIERTO" : "NIVEL 2: BLOQUEADO").setTint(abierto2 ? VERDE : GRIS);
    nave.play(`${chasis(mejorNave(pf))}_reparado`);
    for (const f of fichas) {
      f.m.setTexture(f.n === sel ? "boton_primario" : "boton_secundario");
      f.candado.setVisible(f.n === 2 && !abierto2);
    }
    textoSel.setText(textoNivel(pf, sel));
    infoMec.setText(abierto2 ? "" : "Nivel 2: ábrelo igual para aprender");
    const sug = MECANICAS.find((m) => !tutorialCompletado(pf, m.id));
    for (const t of tarjetas) {
      t.marca.setVisible(tutorialCompletado(pf, t.m.id));
      t.candado.setVisible(t.m.nivel === 2 && !abierto2 && !tutorialCompletado(pf, t.m.id));
      t.f.setTexture(t.m === sug ? "boton_primario" : "boton_secundario");
    }
    return pf;
  }
  refrescar();

  return {
    refrescar,
    /** Avisos de la red (errores de entrada o «Práctica terminada…»). */
    pintar(p: Pantalla) { aviso.setText(p.aviso ?? "").setTint(p.aviso?.startsWith("Práctica terminada") ? VERDE : ROJO); },
  };
}
