# SPEC 03 — Power pellets y modo asustado con ojos que regresan

> **Estado:** Aprobado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-11-10
> **Objetivo:** Que Pac-Man coma power pellets (4 fijos en las esquinas y 1 movil que se reubica cada 3 s) y, al hacerlo, asuste 7 s a los fantasmas hasta poder comérselos, renaciendo estos en la pen tras volver sus ojos.

## Por que existe esta spec

Las specs 01 y 02 dejaron fuera, expresamente, los power pellets y el frightened: el laberinto no tenia celdas para ellos y faltaba la salida fiable de la pen. Hoy el motor greedy, la puerta unidireccional (`allowDoor`) y el flag `home` de SPEC 02 dan todo lo necesario para montarlo sin codigo de navegacion nuevo: una vez comido, el fantasma entra en un estado "ojos" que reutiliza el mismo greedy con objetivo distinto y la puerta en sentido de entrada.

## Alcance

**En:**

- 4 pellets fijos en las esquinas transitables del laberinto: celdas (1,3), (26,3), (1,23) y (26,23). Nueva letra `O` en `maze.js` que se parsea a valor `4`; valen 50 puntos cada uno y cuentan para la victoria junto a los dots.
- El pellet movil: aparece en una casilla al azar al arrancar la partida, es visible 3 s (180 frames), y al cumplirse desaparece y reaparece al instante en otra casilla al azar, ciclicamente. Cuando Pac-Man se lo come (+50 y modo asustado) desaparece para siempre, sin volver a aparecer.
- El modo asustado de 7 s (420 frames): los fantasmas dan media vuelta en el frame del pellet, bajan a la mitad de velocidad y en cada celda eligen direccion al azar (sin media vuelta salvo callejon). Se dibujan azules con parpadeo blanco en los ultimos 2 s. Acabado el tiempo, vuelven a su color, velocidad y objetivos de scatter/chase.
- Comer fantasmas asustados (+200 cada uno, valor fijo): el fantasma desaparece y solo quedan sus ojos, que vuelven a la pen a velocidad 1/8 por la puerta, y al llegar a su celda inicial renacen completos y salen al instante.
- Reset arcade al perder una vida: modo asustado cancelado, salida escalonada repetida, pellet movil reubicado; los pellets fijos comidos siguen comidos y el movil, si ya fue comido, no vuelve.
- Render correspondiente en `src/js/render.js`: pellets grandes, pellet movil, fantasmas azules/parpadeo y fantasma convertido en ojos.

**Fuera de esta spec:**

- Cadena de puntos 200/400/800/1600 y scores flotantes en pantalla.
- Sonido y efectos audio.
- Niveles multiples y ajustes de dificultad por nivel.
- Cambios de velocidad de Pac-Man o de los fantasmas en sus modos normales.
- Los fantasmas mas lentos dentro del tunel (escalado arcade extra).
- HUD adicional (temporizador del modo, leyenda de estado).

## Modelo de datos

No hay persistencia. Solo estados nuevos en el objeto de partida y flags por fantasma.

```js
// maze.js — 'O' es power pellet (4); solo cambia en las 4 esquinas
'#O####.#####.##.#####.####O#', // 3
'#O..##................##..O#', // 23

// game.js — constantes nuevas junto a EXIT_TARGET
const POWER_POINTS = 50;          // puntos por pellet (fijo o movil)
const GHOST_POINTS = 200;         // puntos por fantasma asustado comido
const FRIGHTENED_FRAMES = 420;    // 7 s de modo asustado
const EYES_SPEED = 1 / 8;         // velocidad de los ojos volviendo al pen
const ROAM_VISIBLE_FRAMES = 180;  // 3 s visible antes de reubicar el pellet movil

// game.js — estado nuevo dentro del objeto devuelto por createGame()
frightened: 0,  // frames restantes de modo asustado; 0 = desactivado
roam: { x, y, framesLeft: ROAM_VISIBLE_FRAMES }, // casilla y timer del movil; null al comerlo

// game.js — flags nuevos en cada elemento del array ghosts
{ ..., scared: false, eyes: false } // asustado / ojos regresando al pen
```

Conventions conservadas: coordenadas casilla/celda, velocidades en celdas/frame, temporizadores por frames. El greedy de asustados respeta el no-reversa de `decideGhost()` y las velocidades nuevas (1/20, 1/18, 1/8) siguen alineando centros de celda.

## Plan de implementacion

1. Pellets fijos: en `maze.js` las 4 esquinas pasan de `.` a `O` y `parseTile()` devuelve `4` (actualizar el encabezado de comentario); en `game.js`, `createGame()` cuenta `v === 2 || v === 4` para `dotsRemaining` y `movePacman()` come `4` (+50, celda a 0); en `render.js`, `drawDots()` dibuja `4` con radio grande (~6,5 px). Verificacion manual: se ven 4 pellets grandes en las esquinas, cada uno suma 50 y GANASTE exige comerlos todos.
2. Pellet movil: en `game.js`, constante `ROAM_VISIBLE_FRAMES`, helper `pickRoamCell()` (casillas transitables fuera de muros, puerta, pen y de la casilla de Pac-Man), estado `roam` en `createGame()`, `tickRoam()` en `update()` con reubicacion cada 180 frames excluyendo la casilla actual y comida por colision (+50, `roam = null` para siempre); en `render.js`, dibujar `game.roam`. Verificacion manual: cada 3 s salta a otra casilla (nunca en la pen) y una vez comido no reaparece.
3. Modo asustado: estado `frightened`; comer cualquier pellet pone `frightened = 420`, invierte la direccion de los fantasmas fuera de la pen y pone `scared = true` en los no-eyes; el contador decrece en `update()` y al llegar a 0 limpia los `scared`; mientras `scared`, `moveGhost()` usa la mitad de velocidad y `decideGhost()` elige al azar (callejon = reversa); re-eat recarga `frightened = 420`; en `render.js`, azul `#2121de` con parpadeo blanco en los ultimos 120 frames. Los asustados no quitan vida en este paso. Verificacion manual: comer un pellet da media vuelta, enlentece y pone azules a los 4; a los 7 s vuelven a lo normal; un segundo pellet recarga el modo.
4. Ojos y renacer: tocar un asustado suma 200 y lo pasa a `eyes` (`scared = false`): velocidad `EYES_SPEED`, objetivo greedy = su casilla de `GHOST_STARTS` y puerta transitable en bajada via `allowDoor = g.home || g.eyes`; al llegar alineado a esa casilla renace (`eyes = false`, `home = true`, `exitDelay = 0`, `dir = 'up'`) y sale al instante; en `render.js`, dibujar solo el par de ojos; las colisiones ignoran a los ojos. Verificacion manual: comer un asustado deja ojos que vuelan al pen por la puerta, renacen en su celda y salen al instante sin miedo.
5. Reset arcade: en `resetPositions()`, limpiar `frightened = 0` y los flags `scared`/`eyes` de los 4, y reubicar `roam` (si existe) con un ciclo nuevo de 3 s; el grid no se toca, asi que los pellets fijos comidos siguen comidos y el movil comido nunca vuelve. Verificacion manual: morir durante el modo asustado lo cancela y repite la salida escalonada; morir tras comer el movil no lo devuelve a pantalla.

## Criterios de aceptacion

- [ ] Se ven los 4 pellets grandes en (1,3), (26,3), (1,23) y (26,23), y comer cada uno suma 50 al score.
- [ ] Victoria exige dots + 4 pellets: con cualquier pellet sin comer, comer todos los dots no muestra GANASTE.
- [ ] El pellet movil es visible desde el arranque en una casilla al azar y cada 3 s reaparece en otra distinta; nunca en la pen (cols 11-16, filas 12-15), puerta o muros, ni sobre la casilla de Pac-Man en el momento de aparecer.
- [ ] Comer el pellet movil suma 50, dispara el modo asustado y desaparece para siempre durante esa partida, incluso tras perder vidas (tras GANASTE/PERDISTE se arranca una partida nueva, con movil nuevo).
- [ ] Al comer cualquier pellet: los fantasmas fuera de la pen dan media vuelta en ese frame, se dibujan azul #2121de, bajan a la mitad de velocidad y en cada celda eligen direccion al azar sin media vuelta (salvo callejon).
- [ ] El modo dura 7 s; comer otro pellet dentro del modo recarga el contador a 7 s completos.
- [ ] En los ultimos 2 s del modo los fantasmas asustados parpadean alternando azul y blanco.
- [ ] Al cumplirse los 7 s sin pellet nuevo, color, velocidad y objetivos scatter/chase vuelven a la normalidad; un fantasma en ojos sigue siendo ojos hasta renacer.
- [ ] Al tocar un fantasma asustado: +200 al score, el fantasma desaparece y solo quedan los ojos.
- [ ] Los ojos viajan a 1/8 celdas/frame, entran al pen cruzando la puerta hacia abajo por (13,12)/(14,12) y renacen completos al llegar a la celda de su kind en GHOST_STARTS.
- [ ] El renacido sale al instante por la puerta (sin el turno escalonado de SPEC 02) y nace sin miedo, con color y velocidad normales.
- [ ] Los ojos no matan a Pac-Man ni pueden ser comidos de nuevo; la colision con ellos no hace nada.
- [ ] Un fantasma no asustado sigue matando a Pac-Man como hoy, y al morir el modo se cancela, los 4 repiten la salida escalonada y el pellet movil se reubica con su ciclo nuevo.
- [ ] Los pellets fijos comidos permanecen comidos tras perder una vida y tras GANASTE/PERDISTE con reinicio de partida (grid nuevo, vuelve a haberlos).
- [ ] El resto funciona igual que SPEC 01/02: dots a 10, ciclo scatter/chase, salida escalonada inicial, 3 vidas, overlays GANASTE/PERDISTE.
- [ ] Sin errores en la consola del navegador al cargar y en partidas largas.

## Decisiones

- **Si:** contador global `game.frightened` en frames + flags `scared`/`eyes` por fantasma. Un solo temporizador gobierna a los 4 y el estado eyes necesita vida propia por fantasma.
- **Si:** 7 s = 420 frames, cifra elegida por el usuario; coincide con la fase scatter de SPEC 01 y mantiene la coherencia del motor frame-based.
- **Si:** asustado = media vuelta inmediata + mitad de velocidad (1/20 y 1/18 celdas/frame, ambos alinean igual que 1/10 y 1/9) + deriva aleatoria en cada celda; es el comportamiento del arcade.
- **Si:** ojos como estado dedicado con velocidad 1/8 (la de Pac-Man) y objetivo la casilla de renacimiento del propio kind, reutilizando el greedy y el `allowDoor` de SPEC 02. El teletransporte directo descendio el usuario: los ojos deben cruzar el escenario hasta el pen.
- **Si:** renacer con `home = true` y `exitDelay = 0` (sale al instante), elegido por el usuario; no se reutiliza el escalonado i*90 al renacer.
- **Si:** come otro pellet dentro del modo = recarga del contador a 420; comportamiento arcade, confirmado por el usuario.
- **Si:** 50 puntos por pellet (fijo o movil) y 200 por fantasma, valores elegidos por el usuario frente a la cadena 200/400/800/1600 del arcade (descartada).
- **Si:** el pellet movil NO cuenta para `dotsRemaining`: es bonus y la victoria solo exige dots + 4 pellets fijos, que si cuentan (valor 4 en el recuento inicial).
- **Si:** al perder vida, reset arcade (elegido por el usuario): asustado fuera, salida escalonada repetida, movil reubicado; los fijos comidos persisten porque `game.grid` no se recrea al reposicionar.
- **Si:** casillas de pellet fijas (1,3), (26,3), (1,23), (26,23): las mismas del nivel 1 del arcade, y `maze.js` se declara fiel a esa geometria; el valor nuevo `4` (`O`) mantiene `MAZE` intacto como datos de solo lectura.
- **Si:** el ciclo scatter/chase sigue su cuenta normal durante el asustado (simplificacion frente al arcade, que congela su temporizador): el asustado define el objetivo de todos modos y la reversa forzada de `tickPhase()` solo toca fantasmas `!home && !scared && !eyes`.
- **No:** parpadeo de los pellets fijos (el arcade lo hace; aqui nada parpadea salvo el flash del fin de modo) ni del movil, que el usuario prefirio siempre visible.
- **No:** scores flotantes, sonido, HUD extra ni ajustes de velocidad extra.

## Riesgos

| Riesgo | Mitigacion |
| --- | --- |
| Los ojos podrian oscilar sin llegar a la pen | El objetivo es una celda real del interior con `allowDoor` activo; el patron greedy sin reversa ya converge a la puerta en SPEC 02. El paso 4 se verifica trazando las 4 rutas a mano. |
| Cambios de velocidad a mitad de casilla (asustado <-> normal) romperian el alineado | Todas las velocidades (1/20, 1/18, 1/10, 1/9, 1/8) alcanzan centros de casilla en pasos exactos y `aligned()` con su umbral 1e-3 no se modifica. |
| El pellet movil reubica justo donde Pac-Man esta a punto de pasar | Se excluye la casilla de Pac-Man al elegir; si llega despues, comerselo es rapidez premiada y no hay doble conteo (`roam = null` al primer contacto). |
| Alta tasa de refresco acorta los 3 s y los 7 s reales | Limitacion conocida del motor frame-based, ya documentada en specs 01 y 02. |
| Pellet movil sobre una casilla con dot, o incluso sobre un pellet fijo | Pactado: el movil puede caer sobre ellos sin molestarlos; al pasar por esa casilla se comen los dos (+50 cada uno) y el modo asustado se recarga, sin conteos de estado duplicados (solo hay un `frightened`). |

## Que no esta en esta spec

- Cadena de puntos por varios asustados y scores flotantes.
- Sonido, HUD extra o ajustes de dificultad.
- Niveles multiples y lentitud en tunel.

Cada uno de estos, si aterriza, va en su propia spec.
