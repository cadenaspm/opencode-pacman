# SPEC 02 — Salida fiable de la pen y puerta unidireccional

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-10
> **Objetivo:** Que los 4 fantasmas salgan de la pen en turnos escalonados de 1,5 s y que, una vez fuera, no puedan volver a entrar por la puerta.

## Por qué esta spec existe

El motor greedy de SPEC 01 no garantiza la salida del pen: con esquinas de scatter abajo (`flanker`, `shy`), el camino que minimiza la distancia Manhattan no es el de la puerta, y los fantasmas quedan oscilando en bucles dentro de ella indefinidamente. Además la puerta (valor 3) es transitable en ambas direcciones para fantasmas, así que un fantasma ya fuera puede re-entrar cuando su objetivo queda debajo, y la reversa forzada de `tickPhase()` puede empujar el rumbo hacia la pen.

## Alcance

**En:**

- Estado `home` por fantasma en `createGame()` y `resetPositions()` de `src/js/game.js`: `true` tras cada arranque y tras cada pérdida de vida.
- Espera escalonada: cada fantasma tiene `exitDelay = i * 90` frames (i = índice en `GHOST_STARTS`): hunter turno 0, ambusher 90, flanker 180, shy 270. Mientras `home && exitDelay > 0` el fantasma no se mueve; el contador decrementa en cada llamada de `update()` (solo corre en `playing`, como hoy).
- Salida dirigida: mientras `home` y con su turno liberado, `decideGhost()` usa como objetivo la constante `EXIT_TARGET = { x: 13, y: 11 }` (primer punto transitable fuera de la puerta), con el mismo greedy sin reversa de `chooseStep()`. El fantasma deja de ser `home` cuando cruza la boca de la puerta: `y <= 11` en movimiento continuo (comparación por crossing, no por `aligned()`, porque los pasos de 0.1 no caen exactos en celdas al subir).
- Puerta unidireccional: `isWall()` / `canMove()` reciben un parámetro extra `allowDoor`; la celda valor `3` es transitable para un fantasma solo cuando `allowDoor === true` (se le pasa `g.home`). Para Pac-Man sigue bloqueada como hoy.
- `tickPhase()`: la reversa forzada se salta para los fantasmas que siguen `home` (como en el arcade, no dan media vuelta dentro).

**Fuera de esta spec:**

- Fantasmas comidos, ojos volviendo a la pen y modo frightened (requieren su propia spec).
- Liberación por contador de puntos comidos (mecanismo del arcade original).
- Cambiar velocidades, el motor greedy fuera del pen, personalidades o el ciclo scatter/chase de SPEC 01.
- Cambios en `render.js` (sprites/colores) o en el laberinto.

## Modelo de datos

No hay persistencia. Solo cambia el elemento del array `ghosts` y se añaden dos constantes:

```js
// game.js — constantes nuevas (junto a SCATTER_TARGETS)
const EXIT_TARGET = { x: 13, y: 11 }; // punto transitado fuera de la puerta
const EXIT_STAGGER_FRAMES = 90;       // 1,5 s entre turnos

// game.js — createGame() y resetPositions() (orden: hunter, ambusher, flanker, shy)
ghosts: GHOST_STARTS.map( ( g, i ) => ( {
  x: g.x, y: g.y, dir: 'up',
  speed: GHOST_SPEEDS[ g.kind ] || GHOST_SPEED,
  kind: g.kind,
  home: true,                          // dentro / subiendo por la puerta
  exitDelay: i * EXIT_STAGGER_FRAMES,  // frames de espera antes de salir
} ) );
```

## Plan de implementación

1. Constantes y espera escalonada: `EXIT_TARGET`, `EXIT_STAGGER_FRAMES`, `home`/`exitDelay` en `createGame()`, y en `moveGhost()` moverse solo cuando `!g.home || g.exitDelay === 0` (decrementar `exitDelay` en `home`). Verificación manual: al pulsar Start solo el hunter se mueve al instante; los otros 3 arrancan ~1,5 s más tarde cada uno (todavía pueden quedarse dando vueltas: es el paso siguiente).
2. Salida dirigida: en `decideGhost()`, si `g.home`, fijar objetivo `EXIT_TARGET`; al cruzar `y <= 11`, poner `home = false`. Añadir `allowDoor` a `isWall()`/`canMove()` (pasando `g.home` desde `moveGhost()`/`decideGhost()`) para que la puerta sea transitable solo durante la salida. Verificación manual: cada fantasma, al llegar su turno, va al punto (13,11) en ≤ ~2 s por la casilla de puerta (13,12), sin bucles y sin atravesar paredes.
3. Cierre y reinicio: en `decideGhost()`/`moveGhost()` los fantasmas con `home === false` no pueden atravesar la puerta (queda en muro vía `allowDoor`); `resetPositions()` restaura `home = true`, `exitDelay = i * 90` y `dir = 'up'`; `tickPhase()` salta la reversa para `home`. Verificación manual: partida larga — nadie re-entra a la pen tras salir; morir repite el mismo patrón de salida escalonada.

## Criterios de aceptación

- [ ] Al pulsar Start, hunter (rojo) se mueve de inmediato; ambusher, flanker y shy permanecen quietos en su celda inicial hasta su turno (~1,5 s / ~3 s / ~4,5 s respectivamente).
- [ ] El orden de salida es el de `GHOST_STARTS`: rojo → rosa → cyan → naranja.
- [ ] Cada fantasma, al llegar su turno, está completamente fuera de la pen en ≤ 2 s, subiendo por la casilla de puerta (13,12), sin bucles ni oscilaciones dentro del pen.
- [ ] Los 4 están fuera de la pen ≤ 7 s después de pulsar Start.
- [ ] En una partida de varios minutos, ningún fantasma vuelve a entrar al pen: las celdas del interior quedan vacías tras la salida (la puerta nunca se cruza de arriba hacia abajo).
- [ ] Después de perder una vida, los 4 reaparecen en el pen y repiten la misma salida escalonada (mismo orden, mismos turnos).
- [ ] Al cambiar de fase scatter↔chase, los fantasmas dentro de la pen no invierten su rumbo; los de fuera sí, como hoy.
- [ ] El resto funciona igual que SPEC 01: velocidades por kind, objetivos de chase/scatter, colores, puntos, vidas y overlays de GANASTE/PERDISTE.
- [ ] Sin errores en la consola del navegador al cargar y al jugar.

## Decisiones

- **Sí:** puerta unidireccional vía parámetro `allowDoor` en `isWall()`/`canMove()` (invariante simple: `home` puede cruzar la puerta, un fantasma fuera jamás). Bloquea re-entrada por scatter, por chase y por reversa forzada de una vez.
- **Sí:** salida dirigida reutilizando `chooseStep()`/`decideGhost()` con objetivo único `EXIT_TARGET (13,11)`. Trazado a mano: converge desde las 4 celdas iniciales sin oscilación (el desempate left>right>up>down actual basta). Sin código nuevo de navegación.
- **Sí:** escalonado de 90 frames (1,5 s), elección del usuario dentro del rango ~1-2 s que pidió; primer turno inmediato (delay 0). Turnos: 0/90/180/270 frames.
- **Sí:** `home = false` al cruzar `y <= 11` con comparación continua: los pasos fraccionales no caen exactos en celdas y `aligned()` no bastaría.
- **Sí:** saltar la reversa de fase para fantasmas `home`: el arcade no da media vuelta dentro del pen, y la reversa no aporta nada durante la salida dirigida.
- **No:** re-entrada nunca permitida (ni siquiera en un futuro modo "ojos regresando": irá en su spec con su propio mecanismo de entrada).
- **No:** liberación por puntitos comidos. Un temporizador por frames es más simple y es lo que se pidió.
- **No:** velocidad especial mientras salen: usan su velocidad de SPEC 01.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Se solapan fantasmas en la columna 13 durante los turnos | Visual y temporal; ya no hay colisión entre fantasmas (SPEC 01), y al salir cada uno tira hacia su objetivo distinto. |
| En pantallas de refresco alto el escalonado dura menos en tiempo real | Coherente con el motor actual (todo escala con frames); misma limitación conocida de SPEC 01. |
| Cambio de fase cae justo cuando un `home` cruza la puerta | Se salta su reversa y `decideGhost()` re-decide en la siguiente celda alineada; la salida no se rompe. |

## Qué no está en esta spec

- Fantasmas comidos y ojos que regresan a la pen.
- Power pellets / modo asustado.
- Liberación por contador de puntos del arcade.
- Niveles múltiples, pathfinding avanzado o cambios de velocidad.

Cada uno de estos, si aterriza, va en su propia spec.
