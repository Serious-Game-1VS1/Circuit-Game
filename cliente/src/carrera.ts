// src/carrera.ts
import Phaser from 'phaser';

export class Carrera extends Phaser.Scene {
  constructor() {
    super({ key: 'Carrera' });
  }

  create(): void {
    // Fondo de pista de carreras
    this.add.rectangle(180, 320, 360, 640, 0x111122);
    this.add.text(180, 80, '¡GRAN CARRERA DE PODS!', { fontSize: '18px', color: '#00ffff' }).setOrigin(0.5);

    // Líneas de pista
    this.add.rectangle(90, 320, 4, 640, 0xffffff, 0.3);
    this.add.rectangle(270, 320, 4, 640, 0xffffff, 0.3);

    // Pods en pista
    const miPod = this.add.rectangle(90, 520, 40, 60, 0x00ff00);
    const rivalPod = this.add.rectangle(270, 520, 40, 60, 0xff3333);

    this.add.text(90, 560, 'TÚ', { fontSize: '12px', color: '#00ff00' }).setOrigin(0.5);
    this.add.text(270, 560, 'RIVAL', { fontSize: '12px', color: '#ff3333' }).setOrigin(0.5);

    // Semáforo y animación de avance
    const semaforoTxt = this.add.text(180, 200, '3', { fontSize: '48px', color: '#ffff00' }).setOrigin(0.5);

    let cuenta = 3;
    const timer = this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        cuenta--;
        if (cuenta > 0) {
          semaforoTxt.setText(`${cuenta}`);
        } else if (cuenta === 0) {
          semaforoTxt.setColor('#00ff00');
          semaforoTxt.setText('¡YA!');

          // Animación de 4 segundos acelerando
          this.tweens.add({
            targets: miPod,
            y: 180,
            duration: 4000,
            ease: 'Power2'
          });

          this.tweens.add({
            targets: rivalPod,
            y: 220,
            duration: 4000,
            ease: 'Power1'
          });
        } else {
          // Transición al Podio
          this.scene.start('Podio');
        }
      }
    });
  }
}

export class Podio extends Phaser.Scene {
  constructor() {
    super({ key: 'Podio' });
  }

  create(): void {
    this.add.rectangle(180, 320, 360, 640, 0x1d1d2c);

    // Banner de resultado
    this.add.rectangle(180, 100, 300, 50, 0x00aa00);
    this.add.text(180, 100, '¡1° LUGAR - VICTORIA!', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);

    // Tarjeta "Qué repasar"
    const cardBg = this.add.rectangle(180, 300, 320, 220, 0x2e2e40).setStrokeStyle(2, 0x00ffff);
    this.add.text(180, 210, '📘 QUÉ REPASAR', { fontSize: '16px', color: '#00ffff' }).setOrigin(0.5);

    const repasoTexto = 
      '• Ley de Ohm: Resistencia mayor = menos corriente.\n\n' +
      '• Circuito Serie: Si abres un componente, todo se apaga.\n\n' +
      '• Circuito Paralelo: El voltaje se mantiene igual en cada rama.';

    this.add.text(180, 310, repasoTexto, {
      fontSize: '11px',
      color: '#ffffff',
      align: 'left',
      wordWrap: { width: 290 }
    }).setOrigin(0.5);

    // Botón Volver a Jugar
    const btnReplay = this.add.rectangle(180, 500, 260, 45, 0x28a745).setInteractive({ useHandCursor: true });
    this.add.text(180, 500, 'VOLVER A JUGAR', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);

    btnReplay.on('pointerdown', () => {
      this.scene.start('TallerScene');
    });
  }
}