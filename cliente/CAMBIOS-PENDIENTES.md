# CircuitSync: cambios pendientes de publicar

Resumen para el dueño del proyecto. Todo lo de abajo está hecho y probado en el equipo de desarrollo, pero **todavía no está publicado**. La versión publicada sigue como estaba. Este documento sirve para decidir si se autoriza el despliegue.

Vista previa local (solo en este equipo): http://localhost:4173 (versión nueva, sin conexión a la sala de producción).

## (a) Qué cambia: antes y ahora

| Cambio | Antes (versión publicada) | Ahora (versión nueva) |
|---|---|---|
| Hueco rojo con «?» | Solo la Resistencia mostraba dónde va la pieza. En las demás mecánicas había que adivinar. | Todas las mecánicas muestran un hueco rojo con «?» donde va la pieza que falta. |
| Arrastrar, luz y CHECK | Solo la Resistencia funcionaba así. En el resto había que elegir la pieza y pulsar un botón aparte (Probar o Despachar). | En todos los modos: arrastras la pieza al hueco, se enciende una luz (ámbar, verde o roja) y confirmas con CHECK. Desaparece el botón Probar/Despachar separado. |
| Multímetro | Daba un valor poco claro. | Muestra la cifra, dice si es «más» o «menos que antes» (o igual) y marca ✓ (correcto), ! (cerca) o ✗ (mal). |
| Jugar solo | Siempre contra el bot en nivel 1, con pocas familias de fallas. | Eliges nivel (1, 2 o mixto) y dificultad (fácil, normal, difícil). Aparecen las 10 familias de fallas. El nivel 2 y el mixto se abren al completar el nivel 1. |
| Chispa (la mascota) | Casi no intervenía. | Señala el hueco o la pieza en el tutorial y en la práctica. En las partidas reacciona: anima tras un fallo y celebra los aciertos. |
| Fusible | Se ponía directamente. | Cuelga del cable y cae en su sitio al soltarlo; después queda el hueco para el repuesto. |
| Racha de 3 zonas con bono | No existía. | Tres zonas limpias seguidas dan un bono: el siguiente fallo espera la mitad del tiempo. Se gasta con el fallo; una quemada lo pierde. |
| Sabotajes | No existían. | Al despachar bien un pod puedes enviar un sabotaje al rival: humo (hay que limpiarlo con 3 toques), enfriamiento largo (castigo de espera más larga) o sin pista (las pestañas pierden su indicación). |
| Placa experta (nivel 3, N3b) | No existía. | Problema con enunciado (7 plantillas: LED, interruptor, dos resistencias, dos LED en serie, en paralelo, protección de polaridad, «apagar solo el rojo»), protoboard con tiras de 5 agujeros y rieles, 6 pestañas de gaveta (Resist., LED/Diodo, Interr., Otros, Cables, Medir) con piezas sobrantes y trampas. El árbitro valida el OBJETIVO eléctrico (vale cualquier montaje correcto); respuesta «mal conectado» sin decir qué falla. Multímetro entre dos agujeros, bot y tutorial «Placa exp.». |
| Mecánica 4, «Pieza muerta» | No existía. | Mecánica nueva (nivel 2, circuito en cadena): el multímetro en continuidad localiza qué pieza de la cadena está muerta y se cambia por un repuesto. Tiene tutorial propio. |

## (b) Árbitro y protocolo: por qué se despliegan juntos

El árbitro (carpeta `spike/`) es el programa que decide quién acierta; el cliente (carpeta `cliente/`) solo dibuja y envía. Los cambios nuevos cruzan los dos:

- Nuevo circuito «cadena» y nuevas opciones de repuesto (formato «hueco:repuesto», puntos de medida t1..tn).
- Nuevos mensajes y campos: sabotaje (tipo y duración), racha (0 a 3) y bono (listo, usado o perdido) en cada resultado, pods limpios seguidos, y el estado completo al reconectar.
- El multímetro envía y recibe lecturas de continuidad y de tensión.

Los campos nuevos son aditivos (los clientes viejos no se rompen al leerlos), pero un cliente nuevo contra un árbitro viejo no vería sabotajes, racha ni cadena, y un árbitro nuevo con cliente viejo repartiría pods de cadena que el cliente viejo no sabe dibujar. Por eso se publican **juntos**: primero el árbitro (VM) y de inmediato el cliente (Static Web Apps).

Nota: Jugar solo, el tutorial y Aprender corren dentro del navegador (árbitro local), así que no dependen del árbitro publicado. Solo el duelo 1v1 y la lista de salas lo usan.

## (c) Lo que todavía NO es nuevo

- Placa difícil (más zonas y fallas combinadas).
- Oleadas en 1v1 (hoy solo existen en práctica y sin entrada de menú).
- Alternativa táctil para soltar repuestos (hoy se arrastra; el toque corto funciona como respaldo, pero no hay un gesto táctil pensado aparte).

## (d) Guía de prueba (unos 10 minutos)

La vista previa se construyó en modo local: **no usa la sala de producción** ni gasta partidas. Jugar solo, tutoriales, práctica y Aprender funcionan sin nada más. Para probar un **duelo 1v1** habría que levantar además el árbitro local (`npm --prefix spike run serve`, puerto 8787); no hace falta para esta guía.

1. Abre http://localhost:4173. Si sale la intro, tócala para saltarla (o añade `?intro=0` a la dirección). Escribe un alias de prueba, por ejemplo `prueba`.
2. Menú, **Aprender**, **Mecánicas**, **Fusible**. Observa el hueco rojo con «?», el fusible que cuelga y cae, y a Chispa señalando.
3. Arrastra la pieza al hueco: la luz se pone ámbar, verde o roja. Confirma con CHECK. Prueba también el multímetro: cifra, «más/menos que antes» y ✓ / ! / ✗.
4. Aprender, Mecánicas, **Resistencia**: mismo gesto (hueco, luz, CHECK). Comprueba que no hay botón Probar/Despachar aparte.
5. Aprender, Mecánicas, **Pieza muerta** (la mecánica 4, puede estar bloqueada hasta tener el nivel 2; ver paso 7): usa el multímetro en continuidad, localiza la pieza muerta y cámbiala.
6. Menú, **Jugar solo**, nivel 1, dificultad **fácil**: arrastra, mira la luz y pulsa CHECK en un par de pods.
7. Para abrir el nivel 2 en el perfil de prueba: no existe un parámetro de URL para esto. El nivel se guarda en el navegador, en la clave `circuitsync.perfil.<alias en minúsculas>`. En la consola del navegador (F12), con el alias `prueba`:
   `localStorage.setItem("circuitsync.perfil.prueba", JSON.stringify({nivelDesbloqueado: 2}))` y recarga. Solo afecta a ese alias de prueba y a este navegador; el perfil real no se toca. (La vía normal es completar el nivel 1 en Jugar solo.)
8. Menú, **Jugar solo**, **MIXTO**, dificultad **normal**: juega varios pods seguidos.
9. Observa a Chispa reaccionando tras un fallo, la racha (1 de 3, 2 de 3, 3 de 3) y el aviso de bono listo. Falla a propósito después de tener el bono: la espera debe ser la mitad, y el bono queda «usado».
10. Si el bot te manda un sabotaje (humo, enfriamiento largo o sin pista), mira el aviso; con humo, límpialo con 3 toques. Es poco frecuente (ver riesgos).

Pasos que dependen del azar (los pods salen sorteados): ver sabotajes y la mecánica de cadena en partida puede requerir varias partidas; para la cadena es más directo el tutorial (paso 5).

## (e) Riesgos conocidos y qué se revisará tras desplegar

- **Equilibrio**: con 5 pods por partida, los sabotajes casi no llegan a activarse; el bono de racha y la mecánica de cadena aún no tienen datos de partidas reales. Se observarán en las primeras pruebas con alumnos.
- **Accesibilidad**: la luz depende del color (ámbar, verde, rojo) además del símbolo ✓ / ! / ✗; falta revisar contraste, daltonismo y el gesto de arrastrar en pantallas táctiles.
- **CI en cola**: la integración continua con las pruebas automáticas está agregada, pero su primera ejecución puede estar pendiente; conviene esperar a que salga en verde antes de publicar.
- Tras desplegar: comprobar que la lista de salas y un duelo 1v1 funcionan (cliente y árbitro nuevos juntos), que Jugar solo y los tutoriales cargan en el sitio público, y que los perfiles existentes siguen intactos.

## (f) Capturas representativas

Todas existen en esta carpeta (`cliente/`).

- [Hueco rojo con «?» en el tutorial de Resistencia](capturas-bloque1/01-tutorial-resistencia-hueco.jpg)
- [Multímetro con cifra y comparación con la lectura anterior](capturas-bloque1/03-fusible-multimetro-cifra.jpg)
- [Resistencia en luz verde, lista para CHECK](capturas-bloque1b/02-resistencia-verde-check.jpg)
- [Fusible con luz roja tras soltarlo mal](capturas-bloque1b/04-fusible-luz-roja.jpg)
- [Jugar solo bloqueado: nivel 2 y mixto cerrados al inicio](capturas-bloque2/01-menu-jugar-solo-bloqueado.jpg)
- [Nivel 2 contra el bot, fusible en luz verde con CHECK](capturas-bloque2/06-bot-nivel2-fusible-verde-check.jpg)
- [Fusible colgando con Chispa señalando](capturas-bloque3/01-tutorial-fusible-colgando-chispa-senala.jpg)
- [Racha de 3 de 3: bono listo](capturas-bloque3/05-bot-bono-listo-3de3.jpg)
- [Humo del rival tapando el tablero (sabotaje)](capturas-bloque4/01-humo-aviso-rival-humo.jpg)
- [Cadena: el multímetro en continuidad localiza la pieza muerta](capturas-bloque5/02-continuidad-localiza-pieza-muerta.jpg)
