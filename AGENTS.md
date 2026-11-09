# AGENTS.md

Clon de Pac-Man en Vanilla JS. Sin framework, sin bundler, sin gestor de paquetes, sin tests, sin CI. El repo existe para practicar Spec-Driven Development (ver flujo abajo).

## Ejecución / verificación

- App estática: abre `src/index.html` en un navegador (o sirve `src/` por HTTP). No hay paso de build ni nada que instalar.
- No hay verificación automatizada. Verifica manualmente en el navegador: las flechas mueven a Pac-Man, comer todos los puntos muestra el overlay de victoria, la colisión con un fantasma cuesta vidas (3 → overlay de derrota).

## Restricciones de arquitectura

- Sin módulos ES. Cada archivo define globales; `src/index.html` los carga en orden de dependencia: `maze.js` → `game.js` → `render.js` → `main.js`. Un archivo nuevo necesita su etiqueta `<script>` insertada en ese orden.
- `MAZE` son datos: 31 strings de 28 caracteres parseados a números — `#`=pared(1), `.`=punto(2), ` `=transitable(0), `-`=puerta de la pen(3). Nunca mutar `MAZE`: `createGame()` lo copia en `game.grid`, y `render.js` dibuja desde `game.grid` (no desde `MAZE`) para que los puntos comidos y los reinicios funcionen.
- Acoplamiento del viewport: `TILE = 20` (render.js) × tamaño del laberinto (28×31) debe coincidir con el `width/height` del canvas en `index.html`.
- Las velocidades son celdas/frame fraccionarias (1/8 Pac-Man, 1/10 fantasmas) elegidas para que los actores se realineen a los centros de celda cada pocos frames (`aligned()` en game.js). Cambiarlas a lo bruto rompe las comprobaciones de colisión/paredes que asumen alineación con la celda.

## Flujo de trabajo con specs

- Las features pasan por las skills `/spec` → `/spec-impl` (instaladas en `.agents/skills/`, bloqueadas en `skills-lock.json`). Solo las invoca el usuario (`disable-model-invocation`); no improvises una versión ad-hoc y no implementes features nuevas sin una spec aprobada.
- Las specs viven en `specs/NN-slug.md` (número secuencial siguiente, slug en kebab-case). Una spec en `Draft`/`Borrador` nunca se implementa — solo el usuario la cambia a `Approved`/`Aprobado`. `/spec-impl` trabaja en la rama `spec-NN-slug`, pausa tras cada paso del plan y nunca hace commit por su cuenta.

## Convenciones

- Todo en español: textos de UI, README y comentarios del código (los comentarios son ASCII, sin tildes).
- Respeta el formato existente: espacios dentro de los paréntesis (`function foo( x )`, `if ( v === 1 )`) y comentarios explicativos encima de las funciones.
