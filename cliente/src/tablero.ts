// src/tablero.ts
import Phaser from 'phaser';
import { 
  montaje, 
  ponerCable, 
  quitarCable, 
  coord, 
  curva, 
  colorCable, 
  cableTocado, 
  type Cable, 
  type Punto 
} from './placa';

export class Tablero4x4 extends Phaser.GameObjects.Container {
  private cables: Cable[] = [];
  private cablesGraphics: Phaser.GameObjects.Graphics;
  private origenPunto: Punto | null = null;
  private puntosGrafo: Map<Punto, Phaser.GameObjects.Arc> = new Map();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.cablesGraphics = scene.add.graphics();
    this.add(this.cablesGraphics);

    this.dibujarPlaca();
    scene.add.existing(this);
  }

  /**
   * Dibuja los conectores y los nodos de la placa 4x4
   */
  private dibujarPlaca(): void {
    const filas = [0, 1, 2, 3];
    const columnas = [0, 1, 2, 3];

    filas.forEach(f => {
      columnas.forEach(c => {
        const p: Punto = `${f},${c}`;
        const pos = coord(p);
        
        const circulo = this.scene.add.circle(pos.x, pos.y, 6, 0x4a4e69)
          .setInteractive({ useHandCursor: true });

        circulo.on('pointerdown', () => this.alTocarPunto(p));
        this.add(circulo);
        this.puntosGrafo.set(p, circulo);
      });
    });
  }

  /**
   * Maneja la selección secuencial de nodos para crear o retirar cables
   */
  private alTocarPunto(p: Punto): void {
    if (!this.origenPunto) {
      this.origenPunto = p;
    } else {
      if (this.origenPunto !== p) {
        const nuevosCables = ponerCable(this.cables, this.origenPunto, p);
        if (nuevosCables) {
          this.cables = nuevosCables;
          this.redibujarCables();
        }
      }
      this.origenPunto = null;
    }
  }

  /**
   * Renderiza las curvas de los cables en la placa
   */
  private redibujarCables(): void {
    this.cablesGraphics.clear();
    this.cables.forEach((c, idx) => {
      const puntos = curva(c, idx);
      const color = colorCable(c);
      
      this.cablesGraphics.lineStyle(4, color, 1);
      for (let i = 0; i < puntos.length - 1; i++) {
        const p1 = puntos[i];
        const p2 = puntos[i + 1];
        if (p1 && p2) {
          this.cablesGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
        }
      }
    });
  }

  /**
   * Obtiene la evaluación del montaje (serie, paralelo o puente)
   */
  public obtenerEvaluacion(): "serie" | "paralelo" | "puente" | null {
    return montaje(this.cables);
  }

  /**
   * Reinicia los cables puestos
   */
  public reiniciarTablero(): void {
    this.cables = [];
    this.origenPunto = null;
    this.cablesGraphics.clear();
  }
}