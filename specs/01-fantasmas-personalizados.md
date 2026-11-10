# SPEC 01 — Cuatro fantasmas con personalidades propias

> **Estado:** Aprobado
> **Depende de:** Ninguna (primera spec del repo)
> **Fecha:** 2026-11-09
> **Objetivo:** Que la partida tenga 4 fantasmas con comportamientos de caza distintos entre sí y uno de ellos agresivo, siguiendo el patrón clásico del arcade.

## Alcance

**En:**

- Ampliar `GHOST_STARTS` en `src/js/maze.js` a 4 fantasmas, cada uno con su `kind` y celda de inicio dentro de la pen: `hunter` (13,14), `ambusher` (16,14), `flanker` (11,14), `shy` (13,15).
- Un motor común de decisión en `src/js/game.js`: en cada celda alineada, el fantasma elige la dirección que minimiza la distancia Manhattan a su casilla objetivo, sin reversa (salvo callejón sin salida o cambio de fase). Cada `kind` aporta solo la casilla objetivo:
  - `hunter` (agresivo, rojo): objetivo = casilla de Pac-Man. Velocidad 1/9 (≈0.111 celdas/frame); el resto a 1/10.
  - `ambusher` (emboscador, rosa): objetivo = casilla de Pac-Man desplazada 4 en su dirección actual.
  - `flanker` (flanqueador, cyan): objetivo = espejo de Pac-Man respecto a `hunter`: `2 * (pacman + 2 * dirPacman) - hunter`.
  - `shy` (tímido, naranja): durante chase, si su distancia Manhattan a Pac-Man es > 8 persigue a Pac-Man; si es ≤ 8 se repliega a su casilla de scatter.
- Ciclo scatter/chase global compartido por los 4: fase inicial `scatter` de 420 frames (7 s) alternando con `chase` de 1200 frames (20 s), indefinidamente. En `scatter` el objetivo de cada fantasma es su esquina: `hunter` (26,0), `ambusher` (1,0), `flanker` (26,30), `shy` (1,30). Al cambiar de fase los 4 invierten su dirección de forma forzada.
- Color por `kind` en `src/js/render.js`: `hunter` #ff0000, `ambusher` #ffb8ff, `flanker` #00ffff, `shy` #ffb852.

**Fuera de esta spec:**

- Power pellets y modo asustado (frightened): el laberinto no los define; requieren su propia spec.
- Salida escalonada de la pen (elegido: salida libre, la IA los saca).
- Velocidades distintas en scatter, estados de ojo-reintentando o reencarnación de fantasmas comidos.
- El bug clásico de Pinky (4 arriba + 4 izquierda al ir hacia arriba).
- Pathfinding (A*/BFS): la decisión sigue siendo greedy casilla a casilla.

## Modelo de datos

No hay persistencia: nada se guarda entre sesiones.

```js
// maze.js — reemplaza el GHOST_STARTS actual (de 2 fantasmas)
const GHOST_STARTS = [
  { x: 13, y: 14, kind: 'hunter' },   // centro de la pen
  { x: 16, y: 14, kind: 'ambusher' },
  { x: 11, y: 14, kind: 'flanker' },
  { x: 13, y: 15, kind: 'shy' },
];

// game.js — constantes nuevas junto a GHOST_SPEED
const GHOST_SPEEDS = { hunter: 1 / 9 }; // fallback: GHOST_SPEED (0.1)

// game.js — esquinas de scatter por kind (casillas del borde, no transitables)
const SCATTER_TARGETS = {
  hunter:   { x: 26, y: 0 },
  ambusher: { x: 1,  y: 0 },
  flanker:  { x: 26, y: 30 },
  shy:      { x: 1,  y: 30 },
};

// game.js — estado nuevo dentro del objeto devuelto por createGame()
phase: { name: 'scatter', framesLeft: 420 }, // alterna 420 <-> 1200

// render.js — reemplaza el array GHOST_COLORS por color por kind
const GHOST_COLOR = {
  hunter: '#ff0000',
  ambusher: '#ffb8ff',
  flanker: '#00ffff',
  shy: '#ffb852',
};
```

Dentro de `ghosts` no cambia la forma del elemento (`{ x, y, dir, speed, kind }`), solo que `speed` ahora depende del `kind`.

## Plan de implementación

1. Ampliar a 4 fantasmas y diferenciar render/velocidad: `GHOST_STARTS` con los 4 kinds en `maze.js`, velocidad por kind en `createGame()` (`GHOST_SPEEDS`) y `GHOST_COLOR` por kind en `render.js`. Verificación manual: hay 4 fantasmas con colores correctos; `ambusher`/`flanker`/`shy` aún van a lo aleatorio (fallback actual) y `hunter` sigue su chase de hoy.
2. Extraer el motor greedy y las casillas objetivo: función común "elige dirección que minimiza Manhattan al objetivo" y una función de objetivo por kind (`hunter`, `ambusher`, `flanker`, `shy`) en `game.js`, usadas por `decideGhost()`. Verificación manual: en juego, la rosa corta por delante, la cyan ataca por el flanco opuesto al rojo y la naranja se repliega cuando te acercas.
3. Ciclo scatter/chase: estado `phase` en `createGame()`, contador `framesLeft` en `update()`, cambio de fase con reversa forzada de los 4 y objetivos de esquina (`SCATTER_TARGETS`) durante `scatter`. Verificación manual: cada 7 s se ve a los 4 expandirse hacia sus esquinas y a los 20 s regresar a cazar, invirtiendo el rumbo en el cambio.

## Criterios de aceptación

- [ ] Al pulsar Start se ven 4 fantasmas: rojo, rosa, cyan y naranja, y el color corresponde al `kind` aunque el orden del array cambie.
- [ ] El rojo persigue la casilla de Pac-Man (agresivo) y es perceptiblemente más rápido que los otros 3 sin atascarse ni quedar parado en una celda válida.
- [ ] La rosa suele interponerse por delante de Pac-Man (objetivo 4 casillas en su dirección).
- [ ] La cyan ataca típicamente desde el flanco opuesto a la roja (espejo respecto a ella, distinta de la rosa).
- [ ] La naranja persigue cuando queda a > 8 casillas y se repliega hacia su esquina (1,30) cuando queda a ≤ 8.
- [ ] En fase scatter los 4 tienden hacia sus esquinas respectivas; en chase vuelven a cazar según su kind.
- [ ] El ciclo alterna indefinidamente sin bloqueo (7 s scatter / 20 s chase, fase inicial scatter).
- [ ] En el cambio de fase los 4 invierten su dirección en ese mismo frame; fuera de eso no hay reversas salvo callejón.
- [ ] Los 4 salen solos de la pen atravesando únicamente las celdas de puerta (13,12) y (14,12); ningún fantasma atraviesa paredes.
- [ ] Ganar y perder funcionan igual que hoy (comer todos los dots → GANASTE; contacto → vida menos, reposición; 0 vidas → PERDISTE).
- [ ] No hay errores en la consola del navegador al cargar ni al jugar.

## Decisiones

- **Sí:** motor greedy común (minimizar Manhattan) con objetivo por kind. Es la filosofía del arcade original, reutiliza `decideGhost()` y cabe en ~30 líneas.
- **Sí:** color ligado al `kind` (mapa en `render.js`). Evita que el color dependa del orden de `GHOST_STARTS`.
- **Sí:** temporizador de fases en frames (420/1200). Consistente con el resto del motor (velocidades en celdas/frame); todo el juego ya escala con el frame rate.
- **Sí:** ciclo simplificado 7 s/20 s permanente y fase inicial scatter. El arcade varía 5–7 s y termina en chase infinito; esta simplificación basta para el nivel único actual.
- **Sí:** mantener el desempate actual de `decideGhost` (prioridad left > right > up > down por orden de `DIRS`). No se introduce el desempate clásico up > left > down > right.
- **Sí:** hunter a 1/9 y resto a 1/10 (decisión del usuario frente a la recomendación uniforme). Alinea igual: 9 frames por celda, así que la nota del AGENTS.md sobre alineación se respeta.
- **No:** frightened/power pellets. El laberinto no tiene celdas para ellos; iría en su propia spec.
- **No:** salida escalonada de la pen. El usuario prefirió salida libre con los 4 dentro.
- **No:** velocidad distinta en scatter. Los fantasmas corren igual en ambas fases.
- **No:** bug de Pinky. Se usa el desplazamiento limpio de 4 casillas.
- **No:** plan precalculado (A*/BFS). El greedy por casilla produce conducta arcade suficiente sin coste extra.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Salida conjunta de la pen: los 4 parten cerca y se solapan en la puerta (no hay colisión entre fantasmas) | Es visual y temporal; sus objetivos distintos los separan en la primera intersección. El reordenamiento queda cubierto porque el color va por kind. |
| La naranja oscila en el borde exacto de distancia 8 entre perseguir y replegar | La decisión se reevalúa solo en celdas alineadas y ambas ramas valen un objetivo válido; el movimiento no se rompe. |
| En pantallas de refresco alto el ciclo scatter/chase dura la mitad en tiempo real | Es coherente con el motor actual (todo escala con los frames); se documenta como limitación conocida. |
| La reversa forzada puede devolver un fantasma recién salido hacia la pen | La puerta es transitable para fantasmas y su objetivo greedy los vuelve a sacar en pocas celdas; no hay bloqueo posible. |

## Qué no está en esta spec

- Power pellets y fantasmas asustados.
- Salida escalonada de la pen.
- Niveles múltiples o velocidad por nivel.
- Comer fantasmas y sus puntos.
- Pathfinding avanzado o IA diferente del greedy por casilla.

Cada uno de estos, si aterriza, va en su propia spec.
