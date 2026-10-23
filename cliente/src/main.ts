// src/main.ts
import Phaser from 'phaser';
import { TallerScene } from './TallerScene';
import { Carrera, Podio } from './carrera';
import { inicial } from './pantalla';
import { Net, crearTransporte, type Config } from './net';

type Accion = { tipo: 'INICIAR_PHASER' };

// 1. Inicializar la gestión de red
const configEnv = (import.meta as { env?: Config }).env || {};
let transport: any;

try {
  transport = crearTransporte(configEnv);
} catch {
  transport = {
    join: async () => {},
    send: () => {},
    close: async () => {}
  };
}

const net = new Net(transport);

const appDiv = obtenerContenedor();
render(appDiv, net, (accion: Accion) => {
  if (accion.tipo === 'INICIAR_PHASER') iniciarJuegoPhaser();
});

// 2. Instancia e inicio de Phaser cuando se completa el ingreso
let game: Phaser.Game | null = null;

function iniciarJuegoPhaser() {
  if (game) return;
  appDiv.replaceChildren();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 360,
    height: 640,
    parent: appDiv,
    backgroundColor: '#1d1d2c',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [TallerScene, Carrera, Podio]
  };

  game = new Phaser.Game(config);
}

function obtenerContenedor(): HTMLElement {
  const existente = document.getElementById('app');
  if (existente) return existente;

  const contenedor = document.createElement('main');
  contenedor.id = 'app';
  document.body.append(contenedor);
  return contenedor;
}

function render(contenedor: HTMLElement, cliente: Net, onAccion: (accion: Accion) => void): void {
  const formulario = document.createElement('form');
  formulario.style.cssText =
    'box-sizing:border-box;display:grid;gap:16px;max-width:360px;margin:12vh auto;padding:24px;color:#fff;font:16px sans-serif';

  const titulo = document.createElement('h1');
  titulo.textContent = 'CircuitSync';
  titulo.style.margin = '0';
  formulario.append(titulo);

  const crearCampo = (texto: string, nombre: string, maxLength: number): HTMLInputElement => {
    const etiqueta = document.createElement('label');
    etiqueta.textContent = texto;
    etiqueta.style.cssText = 'display:grid;gap:6px';
    const campo = document.createElement('input');
    campo.name = nombre;
    campo.maxLength = maxLength;
    campo.autocomplete = 'off';
    campo.required = true;
    campo.style.cssText = 'box-sizing:border-box;width:100%;padding:10px;font-size:20px';
    etiqueta.append(campo);
    formulario.append(etiqueta);
    return campo;
  };

  const codigo = crearCampo('Código de sala', 'codigo', 6);
  codigo.style.textTransform = 'uppercase';
  const alias = crearCampo('Alias', 'alias', 12);

  const boton = document.createElement('button');
  boton.type = 'submit';
  boton.textContent = 'Entrar';
  boton.style.cssText =
    'padding:12px;background:#3bb273;color:#fff;font-size:18px;border:0;cursor:pointer';
  formulario.append(boton);

  const aviso = document.createElement('p');
  aviso.setAttribute('role', 'status');
  aviso.setAttribute('aria-live', 'polite');
  formulario.append(aviso);
  contenedor.append(formulario);

formulario.addEventListener('submit', async (evento: SubmitEvent) => {
  evento.preventDefault();
  boton.disabled = true;

  try {
    // 1. Reiniciar el estado a la fase inicial limpia de 0/5 pods
    cliente.estado = inicial();
    
    // 2. Intentar la conexión con el código y alias ingresados
    await cliente.entrar(codigo.value, alias.value);
    
    // Si la sala de red no existe, arrancar Phaser pero con el estado limpio
    if (cliente.estado.aviso?.includes('No hay una sala')) {
      cliente.limpiarAviso();
      onAccion({ tipo: 'INICIAR_PHASER' });
    }
  } catch {
    onAccion({ tipo: 'INICIAR_PHASER' });
  }
});

cliente.onCambio = (pantalla) => {
  aviso.textContent = pantalla.aviso ?? '';
  
  // Transición a Phaser al estar en sala o taller
  if (pantalla.fase === 'sala' || pantalla.fase === 'taller') {
    onAccion({ tipo: 'INICIAR_PHASER' });
  }
};
}