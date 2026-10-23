// src/TallerScene.ts
import Phaser from 'phaser';
import { montaje, ponerCable, coord, colorCable, curva, type Cable, type Punto } from './placa';

export type ModoHerramienta = 'MEDIR' | 'CABLEAR' | 'CORTAR' | 'MONTAJE' | 'PINZAS';

export class TallerScene extends Phaser.Scene {
  // Lógica de Red y Cableado
  private cables: Cable[] = [];
  private origenPunto: Punto | null = null;
  private cablesGraphics!: Phaser.GameObjects.Graphics;

  // Estado del Multímetro y Herramientas
  private herramientaActiva: ModoHerramienta = 'CABLEAR';
  private modoMultimetro: 'tension' | 'continuidad' = 'tension';

  // UI Elementos
  private txtCronometro!: Phaser.GameObjects.Text;
  private txtMeta!: Phaser.GameObjects.Text;
  private txtMultimetroLCD!: Phaser.GameObjects.Text;
  private txtPiezaCarrusel!: Phaser.GameObjects.Text;

  // Carrusel de piezas
  private listaPiezas = ['Luz nueva', 'Resistencia 470Ω', 'Capacitor 10µF', 'Fusible 3A'];
  private indexPiezaActual = 0;

  constructor() {
    super({ key: 'TallerScene' });
  }

  create() {
    const { width, height } = this.scale;

    // Fondo Base
    this.add.rectangle(width / 2, height / 2, width, height, 0x181825);

    // 1. HUD SUPERIOR COMPLETO (Estilo Figma)
    this.crearHUDSuperior(width);

    // 2. PESTAÑAS DE ZONAS (Radar, Cabina, Turbina, Reactor)
    this.crearPestanasZonas(width, 65);

    // 3. BARRA DE HERRAMIENTAS BANCO DE TRABAJO
    this.crearBarraHerramientas(width, 105);

    // Banner de Meta Pedagógica
    this.add.rectangle(width / 2, 130, width, 22, 0x1c3a1e);
    this.txtMeta = this.add.text(10, 130, 'Meta: dos caminos. Si una luz se apaga, la otra sigue.', {
      fontSize: '10px', color: '#a6e3a1'
    }).setOrigin(0, 0.5);

    // 4. PLACA BREADBOARD CENTRO (+ ROJO, - AZUL)
    const placaY = 245;
    this.add.rectangle(width / 2, placaY, width - 16, 200, 0x1b432c).setStrokeStyle(2, 0x2d6a4f);

    // Rieles de Alimentación
    this.add.line(0, 0, 25, placaY - 75, width - 25, placaY - 75, 0xe74c3c, 5).setOrigin(0);
    this.add.text(25, placaY - 90, '+ (rojo) · 9 V', { fontSize: '10px', color: '#e74c3c', fontStyle: 'bold' });

    this.add.line(0, 0, 25, placaY + 75, width - 25, placaY + 75, 0x3498db, 5).setOrigin(0);
    this.add.text(25, placaY + 85, '- (azul)', { fontSize: '10px', color: '#3498db', fontStyle: 'bold' });

    this.cablesGraphics = this.add.graphics();
    this.crearNodosCircuito(width, placaY);

    // 5. MÓDULO INFERIOR DE MULTÍMETRO (Estilo Figma)
    this.crearMultimetroFigma(width, 380);

    // 6. GAVETA CARRUSEL CON FLECHAS Y BOTÓN PROBAR
    this.crearCarruselPiezasYBotonProbar(width, 490);
  }

  private crearHUDSuperior(width: number) {
    const bgHUD = this.add.rectangle(width / 2, 20, width, 40, 0x11111b);

    // Cronómetro
    this.txtCronometro = this.add.text(12, 12, '⏱️ 09:45', { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' });

    // Progreso Pods TÚ vs RIVAL
    this.add.text(90, 8, 'Tú 🟩🟩🟩🟨⬜ 4/5', { fontSize: '9px', color: '#a6e3a1' });
    this.add.text(90, 22, 'Rival 🟪⬜⬜⬜⬜ 1/5', { fontSize: '9px', color: '#f38ba8' });

    // Botón Pausa
    const btnPausa = this.add.rectangle(width - 20, 20, 26, 26, 0x313244).setStrokeStyle(1, 0x45475a);
    this.add.text(width - 20, 20, '❚❚', { fontSize: '10px', color: '#ffffff' }).setOrigin(0.5);
  }

  private crearPestanasZonas(width: number, y: number) {
    const zonas = ['Radar', 'Cabina', 'Turbina', 'Reactor'];
    const wZone = (width - 20) / 4;

    zonas.forEach((z, idx) => {
      const x = 10 + idx * wZone + wZone / 2;
      const isActiva = z === 'Cabina';

      const btn = this.add.rectangle(x, y, wZone - 4, 32, isActiva ? 0x89b4fa : 0x313244)
        .setStrokeStyle(1, 0x45475a);

      this.add.text(x, y, z, {
        fontSize: '10px',
        color: isActiva ? '#11111b' : '#cdd6f4',
        fontStyle: 'bold'
      }).setOrigin(0.5);
    });
  }

  private crearBarraHerramientas(width: number, y: number) {
    const herramientas: Array<{ id: ModoHerramienta; etiqueta: string }> = [
      { id: 'MEDIR', etiqueta: '🔍 Medir' },
      { id: 'CABLEAR', etiqueta: '🔌 Cable' },
      { id: 'CORTAR', etiqueta: '✂️ Cortar' },
      { id: 'MONTAJE', etiqueta: '🧩 Piezas' },
      { id: 'PINZAS', etiqueta: '🛠️ Pinzas' }
    ];

    herramientas.forEach((h, idx) => {
      const x = 34 + idx * 68;
      const isActiva = h.id === this.herramientaActiva;

      const btn = this.add.rectangle(x, y, 62, 22, isActiva ? 0xf9e2af : 0x313244)
        .setStrokeStyle(1, 0x585b70)
        .setInteractive({ useHandCursor: true });

      this.add.text(x, y, h.etiqueta, {
        fontSize: '8px',
        color: isActiva ? '#11111b' : '#cdd6f4',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      btn.on('pointerdown', () => {
        this.herramientaActiva = h.id;
        this.origenPunto = null;
        this.txtMeta.setText(`Herramienta seleccionada: ${h.etiqueta}`);
      });
    });
  }

  private crearNodosCircuito(width: number, placaY: number) {
    const filas = [0, 1, 2, 3];
    const columnas = [0, 1, 2, 3];

    filas.forEach(f => {
      columnas.forEach(c => {
        const p: Punto = `${f},${c}`;
        const pos = coord(p);
        const x = pos.x + 30;
        const y = pos.y + placaY - 55;

        const colorRing = f === 0 ? 0xe74c3c : (f === 3 ? 0x3498db : 0xffffff);
        this.add.circle(x, y, 8, 0x1b432c).setStrokeStyle(2, colorRing);

        const nodo = this.add.circle(x, y, 4, 0xffffff)
          .setInteractive({ useHandCursor: true });

        nodo.on('pointerdown', () => this.alTocarNodo(p));
      });
    });

    // Sprites Focos Luces
    this.add.rectangle(width / 2 - 35, placaY, 28, 28, 0x22223b).setStrokeStyle(1, 0x89b4fa);
    this.add.rectangle(width / 2 + 35, placaY, 28, 28, 0x22223b).setStrokeStyle(1, 0x89b4fa);
    this.add.text(width / 2 - 35, placaY + 20, 'Luz 1', { fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(width / 2 + 35, placaY + 20, 'Luz 2', { fontSize: '8px', color: '#ffffff' }).setOrigin(0.5);
  }

  private alTocarNodo(p: Punto) {
    if (this.herramientaActiva === 'MEDIR') {
      const v = p.startsWith('0') ? '9.00 V (+)' : '0.00 V (-)';
      this.txtMultimetroLCD.setText(`Lectura en ${p}: ${v}`);
      return;
    }

    if (this.herramientaActiva === 'CABLEAR') {
      if (!this.origenPunto) {
        this.origenPunto = p;
        this.txtMeta.setText(`🔌 CABLEAR: Origen en borne ${p}. Toca el punto destino.`);
      } else {
        if (this.origenPunto !== p) {
          const nuevos = ponerCable(this.cables, this.origenPunto, p);
          if (nuevos) {
            this.cables = nuevos;
            this.redibujarCables(245);
          }
        }
        this.origenPunto = null;
      }
    } else if (this.herramientaActiva === 'CORTAR') {
      if (this.cables.length > 0) {
        this.cables.pop();
        this.redibujarCables(245);
      }
    }
  }

  private redibujarCables(placaY: number) {
    this.cablesGraphics.clear();
    this.cables.forEach((c, idx) => {
      const puntos = curva(c, idx);
      const color = colorCable(c);

      this.cablesGraphics.lineStyle(4, color, 1);
      for (let i = 0; i < puntos.length - 1; i++) {
        const p1 = puntos[i];
        const p2 = puntos[i + 1];
        if (p1 && p2) {
          this.cablesGraphics.lineBetween(p1.x + 30, p1.y + placaY - 55, p2.x + 30, p2.y + placaY - 55);
        }
      }
    });
  }

  private crearMultimetroFigma(width: number, y: number) {
    this.add.rectangle(width / 2, y, width - 16, 75, 0x252836).setStrokeStyle(1, 0x45475a);

    // Multímetro Amarillo
    this.add.rectangle(60, y, 46, 55, 0xa6e3a1).setStrokeStyle(2, 0x40a02b);
    this.add.circle(60, y + 8, 10, 0x11111b);

    // Botones Tensión y Continuidad
    const btnV = this.add.rectangle(180, y - 14, 120, 22, 0x313244).setInteractive({ useHandCursor: true });
    this.add.text(180, y - 14, '⚡ Tensión', { fontSize: '9px', color: '#ffffff' }).setOrigin(0.5);

    const btnC = this.add.rectangle(180, y + 14, 120, 22, 0x313244).setInteractive({ useHandCursor: true });
    this.add.text(180, y + 14, '🔄 Continuidad', { fontSize: '9px', color: '#ffffff' }).setOrigin(0.5);

    this.txtMultimetroLCD = this.add.text(width - 20, y + 24, 'Toca un modo para medir', {
      fontSize: '8px', color: '#a6adc8'
    }).setOrigin(1, 0.5);

    btnV.on('pointerdown', () => { this.modoMultimetro = 'tension'; btnV.setFillStyle(0xf8a5c2); btnC.setFillStyle(0x313244); });
    btnC.on('pointerdown', () => { this.modoMultimetro = 'continuidad'; btnC.setFillStyle(0xf8a5c2); btnV.setFillStyle(0x313244); });
  }

  private crearCarruselPiezasYBotonProbar(width: number, y: number) {
    // Panel Carrusel de Gaveta
    this.add.rectangle(width / 2, y, width - 16, 80, 0x11111b).setStrokeStyle(1, 0x45475a);

    // Flecha Izquierda ◀
    const btnIzq = this.add.rectangle(30, y, 28, 40, 0x313244)
      .setStrokeStyle(1, 0x585b70)
      .setInteractive({ useHandCursor: true });
    this.add.text(30, y, '◀', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);

    // Flecha Derecha ▶
    const btnDer = this.add.rectangle(width - 30, y, 28, 40, 0x313244)
      .setStrokeStyle(1, 0x585b70)
      .setInteractive({ useHandCursor: true });
    this.add.text(width - 30, y, '▶', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);

    // Nombre de Pieza Activa en el centro del carrusel
    this.txtPiezaCarrusel = this.add.text(width / 2, y, this.listaPiezas[this.indexPiezaActual]!, {
      fontSize: '12px', color: '#f9e2af', fontStyle: 'bold'
    }).setOrigin(0.5);

    btnIzq.on('pointerdown', () => {
      this.indexPiezaActual = (this.indexPiezaActual - 1 + this.listaPiezas.length) % this.listaPiezas.length;
      this.txtPiezaCarrusel.setText(this.listaPiezas[this.indexPiezaActual]!);
    });

    btnDer.on('pointerdown', () => {
      this.indexPiezaActual = (this.indexPiezaActual + 1) % this.listaPiezas.length;
      this.txtPiezaCarrusel.setText(this.listaPiezas[this.indexPiezaActual]!);
    });

    // Botón verde PROBAR CABINA en la parte inferior
    const btnProbar = this.add.rectangle(width / 2, y + 65, width - 16, 38, 0xa6e3a1)
      .setInteractive({ useHandCursor: true });

    this.add.text(width / 2, y + 65, '▶ PROBAR CABINA', {
      fontSize: '13px', color: '#11111b', fontStyle: 'bold'
    }).setOrigin(0.5);

    btnProbar.on('pointerdown', () => {
      const res = montaje(this.cables); // Evalúa si es paralelo, serie o puente
      if (res === 'paralelo') {
        this.txtMeta.setText('✅ ¡ZONA REPARADA! Circuito en Paralelo correcto.');
      } else if (res === 'serie') {
        this.txtMeta.setText('⚠️ ERROR: Están en Serie. Si se desconecta una luz, la otra se apaga.');
      } else {
        this.txtMeta.setText('⚠️ CORTOCIRCUITO: Revisa que el riel + no vaya directo al -');
      }
    });
  }
}