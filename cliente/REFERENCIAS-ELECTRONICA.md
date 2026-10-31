# Referencias de electrónica para el Nivel 3 «Experto» y las trivias

Fuentes: [AT] areatecnologia.com/TUTORIALES/ELECTRONICA%20BASICA.htm · [TE] tallerelectronica.com/curso-basico-de-electronica-desde-cero/ · [CO] coursera.org/learn/electrnica-bsica-y-circuitos-integrados-lineales (solo temario público, sin sesión) · [SIL] `C:\Users\holaq\OneDrive\Documents\Marktidown\markitdown\Syllabus_ISWZ2401_202610.pdf` (y `.md` al lado; fuera del repo) · [PRJ] `handoff.md`, `spike/src/engine/pods.ts`. Marcado «(conocimiento general)» = no sale de una página fetcheada; verificar antes de citar en la tesis.

## A) Sílabo → mecánicas

**Sílabo encontrado: ISWZ2401 Computación Ubicua (2026-10), [SIL].** No hay un sílabo de «Electrónica Básica» aparte en el repositorio. Estructura: Unidad 1 «Introducción a la computación ubicua» (sem. 1-15; **sem. 7 = «Electrónica Básica»**: lectura histórica, intro a electrónica básica, foro con glosario; sem. 8 Lego Mindstorms; sem. 10-12 Tinkercad, simulación de circuitos y comunicación serial); Unidad 2 «Adquisición y visualización de datos y sensores» (Arduino IDE, Arduino Nano 33 IoT, sensores); Unidad 3 «Las tecnologías de la computación ubicua». RDA2: «aplica fundamentos de electrónica digital, microcontroladores e IoT». El sílabo no nombra protoboard, resistencias, capacitores ni Ohm ([PRJ] handoff.md l.168).

Temario de apoyo (para suplir el detalle que falta del sílabo): [TE] 93 lecciones; relevantes: código de colores (3 y 71, 5 bandas), Ohm + serie + protoboard + multímetro (4-5), paralelo (6), mixto (7-8), condensadores y LED (12), planos en protoboard (13), relé/transistor (14). [AT]: resistencias y colores, potenciómetro, LDR, termistor, diodo/LED/Zener, condensador, relé, divisor de tensión, transistor. [CO] (Tec de Monterrey): semiconductores y diodo, fuentes (CA→CC), transistor, amplificador operacional.

| Tema | Estado en el juego ([PRJ] pods.ts) |
|---|---|
| Resistencia limitadora de LED | Cubierto (led, cabina; 100/220/470/1k) |
| Fusible (valor nominal) | Cubierto (0,5/1/3 A) |
| Placa/protoboard con cables y multímetro | Cubierto |
| Continuidad / cadena con pieza muerta | Cubierto (cadena) |
| Serie / paralelo / mixto | Cubierto (luces, interruptor, combinar) |
| Divisor de tensión | Cubierto (divisor 5 V a un pin) |
| Diodo de protección / LED invertido | Cubierto (protegido, invertido) |
| Circuito abierto | Cubierto (abierto) |
| **Faltan:** código de colores, tipos de fusible, selección de componentes en gaveta, capacitor, pulsador, potenciómetro, LDR/termistor (sensores), transistor, relé, Zener, ley de Ohm numérica (calcular R) | Propuestos abajo |

## B) Nivel 3 «Experto»

### (i) Resistencia por código de colores
Cifra / multiplicador / tolerancia (conocimiento general; [AT] confirma el principio: 1.ª y 2.ª banda = cifras, 3.ª = ceros a añadir; [TE] l.3 y 71):

| Color | Cifra | Multiplicador | Tolerancia |
|---|---|---|---|
| Negro | 0 | ×1 | n/a |
| Marrón | 1 | ×10 | ±1 % |
| Rojo | 2 | ×100 | ±2 % |
| Naranja | 3 | ×1 k | n/a |
| Amarillo | 4 | ×10 k | n/a |
| Verde | 5 | ×100 k | ±0,5 % |
| Azul | 6 | ×1 M | ±0,25 % |
| Violeta | 7 | ×10 M | ±0,1 % |
| Gris | 8 | n/a | ±0,05 % |
| Blanco | 9 | n/a | n/a |
| Oro | n/a | ×0,1 | ±5 % |
| Plata | n/a | ×0,01 | ±10 % |

4 bandas = cifra, cifra, multiplicador, tolerancia (sin 4.ª banda = ±20 %). 5 bandas = cifra, cifra, cifra, multiplicador, tolerancia (fuente de la estructura: búsqueda en libretexts/electronics-tutorials, resultados citados; tabla completa de conocimiento general).
Valores comerciales: E12 (±10 %) = 10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82 × década; E24 (±5 %) añade 11, 13, 16, 20, 24, 30, 36, 43, 51, 62, 75, 91 (el listado E12 viene de la búsqueda; el añadido E24 es conocimiento general). Útiles 100 Ω-10 kΩ: 100, 120, 150, 220, 330, 470, 560, 680, 1 k, 2,2 k, 3,3 k, 4,7 k, 5,6 k, 10 k. Los valores del juego (100/220/470/1k) son todos E12.

Ejemplos (tolerancia oro ±5 % salvo indicación):
1. marrón-negro-marrón-oro = 10 × 10 = **100 Ω**
2. marrón-rojo-marrón-oro = **120 Ω**
3. rojo-rojo-marrón-oro = **220 Ω**
4. naranja-naranja-marrón-oro = **330 Ω**
5. amarillo-violeta-marrón-oro = **470 Ω**
6. marrón-negro-rojo-oro = **1 kΩ**
7. rojo-rojo-rojo-oro = **2,2 kΩ** ([AT] da este ejemplo)
8. naranja-naranja-rojo-oro = **3,3 kΩ**
9. verde-azul-rojo-oro = **5,6 kΩ**
10. marrón-negro-naranja-oro = **10 kΩ**
11. (5 bandas) rojo-rojo-negro-negro-marrón = 220 × 1 = **220 Ω ±1 %**
12. (5 bandas) amarillo-violeta-negro-marrón-marrón = 470 × 10 = **4,7 kΩ ±1 %**

Truco de diseño: la trampa típica es leer la 3.ª banda como cifra (en 5 bandas sí lo es) y confundir oro/plata con marrón/rojo.

### (ii) Fusible por tamaño / tipo / marcado
Fuente: búsqueda web (RS Components, uelectronics, sensorautomotriz.com/preguntas-frecuentes/como-leer-fusibles).
- **Cartucho de vidrio 5×20 mm** (electrónica, paneles) y **6,3×32 mm** (el «6×30/6,3×32», más grande, corrientes mayores; tamaño exacto: conocimiento general). Kits típicos 5×20: 0,2/0,5/1/2/3/5/8/10/15/20 A, 250 V.
- **Letra de velocidad:** **F** = rápido (se funde casi enseguida), **T** = lento/temporizado (aguanta picos de arranque, p. ej. motores); TT = muy lento. El marcado impreso lleva corriente, letra y tensión: «T 2A 250V».
- **Automóvil (cuchilla):** color = amperios. Morado 3 A, beige 5 A, marrón 7,5 A, rojo 10 A, azul 15 A, amarillo 20 A, blanco/transparente 25 A, verde 30 A, naranja 40 A. Los colores pueden variar por fabricante.
- **Por qué importa:** el nominal debe quedar *por encima* de la corriente normal del circuito y *por debajo* de lo que dañaría cables/componentes. Muy grande = no protege; muy pequeño = se funde en uso normal. Si no hay el valor exacto, mejor uno un poco menor que uno mayor (fuente búsqueda).
- **Pixel art propuesto:** cartucho de vidrio horizontal 32×12 px, tapas grises, hilo visible; **F** = hilo recto fino, **T** = hilo con resorte/espiral; el número impreso en 3 px de alto. Cuchilla: silueta trapezoidal 14×16 px del color de la tabla + número blanco. Pregunta de juego: «¿Qué fusible pones?» con 3 fusibles de distinto tamaño/color/marcado y un circuito de ≈ X A.

### (iii) Placa con gavetas
**Reglas realistas** (búsqueda: uelectronics.com/protoboard-que-es-como-funciona-y-como-utilizarlo, docs.sunfounder.com breadboard):
- Cada fila numerada tiene **5 orificios conectados** a cada lado del **canal central**; el canal **aísla** ambos lados (se usa para CI).
- Rieles laterales largos: **+ (rojo)** y **− (azul)**; en algunos modelos están **partidos a la mitad** (se verifica con continuidad: buen texto de ayuda).
- Un componente con las dos patas en la misma tira de 5 está en **cortocircuito** (error típico a explotar). LED y diodo tienen polaridad; resistencia, no.

**Circuitos-problema** (fuente de tensión; gaveta con piezas sobrantes). «Solver» = lo resuelve el motor DC resistivo con diodo/LED actual; LED ≈ 2 V, ~20 mA máx. (conocimiento general; [AT] dice que el LED trabaja por debajo de ~2 V y necesita resistencia).
1. **LED con batería 9 V.** Gaveta: R 100/220/470/1k, capacitor, pulsador. Correcta: 470 Ω (≈15 mA); 100 y 220 queman (≈70 y ≈32 mA); 1 k tenue. Solver: sí.
2. **LED con pulsador.** Gaveta: pulsador, interruptor, diodo, R. Montar R + pulsador en serie; el interruptor también sirve (solo cambia si queda encendido). Solver: sí (pulsador = interruptor momentáneo).
3. **Dos LED, un fusible.** 9 V, LED en paralelo cada uno con 470 Ω (≈30 mA). Gaveta: fusibles 0,05/0,1/1/5 A (F y T). Correcta: 0,1 A (pasa lo normal, protege); 1 y 5 A no protegen; 0,05 A se funde. Solver: sí (umbral de fusible ya existe).
4. **Divisor a 5 V para un pin.** Batería 9 V, R1 = 470, elegir R2: 560 Ω da ≈ 4,9 V; 100/220 dan poco; 10 k da ≈ 8,8 V (quema). Solver: sí (DIVISOR_V).
5. **LED protegido contra batería invertida.** Batería 9 V (con opción de ponerla al revés), diodo + R + LED en serie. Debe incluir diodo; sin él, en inversa el LED se daña. Gaveta: diodo, R 470, capacitor, interruptor. Solver: sí.
6. **Mixto: 2 resistencias para ≈10 mA.** Dos 470 Ω y un LED: serie = 940 Ω (≈7 mA), paralelo = 235 Ω (≈30 mA). Con 9 V elegir cuál. Solver: sí.
7. **No soportado:** LED con retardo RC (capacitor se carga: transitorio), transistor como interruptor, relé, potenciómetro/LDR/termistor (valor variable: solo con valores fijos), Zener. **Excepción verificable:** capacitor *en serie* en CC estacionaria = circuito abierto (el solver puede tratarlo como abierto) → «pieza trampa» válida.

### (iv) Multímetro (texto de ayuda)
Fuente: búsqueda web (elaborate.uca.es manual, autosolar.es, libretexts), [TE] l.4-5.
- **Tensión:** puntas **en paralelo** con el componente; circuito **con energía**. Rojo al +, negro a COM; si las inviertes en CC marca negativo, sin dañar.
- **Continuidad / resistencia:** circuito **sin energía** (desconecta la batería); si pita o marca ~0 Ω hay camino; «OL/1» = abierto.
- **Corriente:** en **serie** (abrir el circuito y meter el medidor); en paralelo es corto y puede dañarlo.
- Revisar el rango y la función del selector antes de medir.

## C) Trivia (≤ 90 caracteres, 3 opciones; la correcta primero, mezclar en el juego)
1. ¿Qué banda indica la tolerancia de una resistencia de 4 bandas? — **La cuarta** / La primera / La tercera. *La 3.ª es el multiplicador; la 4.ª, la tolerancia.*
2. Marrón-negro-rojo-oro, ¿cuánto vale? — **1 kΩ** / 100 Ω / 10 kΩ. *10 × 100 = 1000 Ω ±5 %.*
3. ¿Qué banda dorada indica? — **Tolerancia ±5 %** / Una cifra 5 / Multiplicador ×5. *Oro: ±5 % (o ×0,1 si es la 3.ª banda).*
4. En una de 5 bandas, ¿cuántas son cifras? — **Tres** / Dos / Cuatro. *Tres cifras, multiplicador y tolerancia.*
5. Un fusible «T 2A» es… — **De acción lenta** / De acción rápida / De 2 V. *T = temporizado; soporta picos de arranque.*
6. ¿Qué fusible protege mejor un circuito de 80 mA? — **0,1 A** / 5 A / 0,01 A. *Algo por encima de lo normal; 0,01 A se fundiría siempre.*
7. En autos, ¿qué indica el color del fusible de cuchilla? — **Los amperios** / Los voltios / El fabricante. *Rojo 10 A, azul 15 A, amarillo 20 A.*
8. ¿Cómo se conecta el multímetro para medir tensión? — **En paralelo** / En serie / Da igual. *El voltímetro se pone en paralelo con el elemento.*
9. ¿Cuándo mides continuidad? — **Sin energía** / Con el circuito encendido / Solo con LED. *Con energía falsea la medida y puede dañar.*
10. En una protoboard, los 5 orificios de una fila están… — **Conectados entre sí** / Aislados / Unidos con la fila de enfrente. *El canal central aísla los dos lados.*
11. Los rieles rojo y azul sirven para… — **Alimentación (+ y −)** / Conectar el canal central / Medir. *Distribuyen + y − por toda la placa.*
12. Un capacitor en serie con una batería de CC, con el tiempo… — **No deja pasar corriente** / Pasa más corriente / Se vuelve resistencia de 0 Ω. *Cargado, se comporta como circuito abierto en CC.*
13. En un divisor con R1 = R2, la salida es… — **La mitad de la entrada** / Igual que la entrada / Cero. *Vout = Vin·R2/(R1+R2).*
14. Dos resistencias iguales en paralelo equivalen a… — **La mitad de una** / El doble / La misma. *R/2 (p. ej. 470 ∥ 470 = 235 Ω).*
15. Un diodo conectado al revés con la batería… — **Bloquea la corriente** / Se funde seguro / Funciona igual. *Solo conduce en polarización directa; protege de polaridad invertida.*

## D) Fuentes que no cargaron o fueron limitadas
- [AT]: cargó; no trata fusible, multímetro ni serie/paralelo. [TE]: cargó (solo índice, sin texto de lecciones; videos en YouTube). [CO]: cargó el temario público, sin sesión. Los datos de tablas de colores, E24, 6,3×32 mm y valores de LED son conocimiento general. El «sílabo de Electrónica Básica» como documento propio no existe en el repo: el único es el de Computación Ubicua [SIL].
