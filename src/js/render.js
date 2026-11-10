// render.js
// Dibujo arcade sobre canvas. Usa game.grid (no MAZE) para reflejar dots comidos.

const TILE = 20;
const WALL_COLOR = '#2121ff';
const DOOR_COLOR = '#ffb8ff';
const DOT_COLOR = '#ffb897';
const PELLET_RADIUS = 6.5; // radio de los pellets grandes (fijos y movil)
const FRIGHTENED_COLOR = '#2121de'; // cuerpo azul del fantasma asustado
const FLASH_COLOR = '#f8f8f8';      // flash blanco del aviso final
const FLASH_START_FRAMES = 120;     // ultimos 2 s del modo, donde parpadea

function cellCenter( x, y ) {
  return { cx: x * TILE + TILE / 2, cy: y * TILE + TILE / 2 };
}

// Paredes estilo arcade: lineas finas redondeadas que conectan los centros
// de celdas-pared adyacentes. Produce el trazado continuo del original.
function drawWalls( ctx, grid ) {
  const H = grid.length;
  const W = grid[ 0 ].length;
  ctx.strokeStyle = WALL_COLOR;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for ( let y = 0; y < H; y++ ) {
    for ( let x = 0; x < W; x++ ) {
      if ( grid[ y ][ x ] !== 1 ) continue;
      const { cx, cy } = cellCenter( x, y );
      // Conectar solo hacia derecha y abajo evita trazos duplicados.
      if ( x + 1 < W && grid[ y ][ x + 1 ] === 1 ) {
        ctx.moveTo( cx, cy );
        ctx.lineTo( cx + TILE, cy );
      }
      if ( y + 1 < H && grid[ y + 1 ][ x ] === 1 ) {
        ctx.moveTo( cx, cy );
        ctx.lineTo( cx, cy + TILE );
      }
      // Celda-pared aislada (sin vecino): punto corto para que se vea.
      const lone =
        ( x + 1 >= W || grid[ y ][ x + 1 ] !== 1 ) &&
        ( x - 1 < 0 || grid[ y ][ x - 1 ] !== 1 ) &&
        ( y + 1 >= H || grid[ y + 1 ][ x ] !== 1 ) &&
        ( y - 1 < 0 || grid[ y - 1 ][ x ] !== 1 );
      if ( lone ) {
        ctx.moveTo( cx - 3, cy );
        ctx.lineTo( cx + 3, cy );
      }
    }
  }
  ctx.stroke();
}

function drawDoor( ctx, grid ) {
  const H = grid.length;
  const W = grid[ 0 ].length;
  ctx.strokeStyle = DOOR_COLOR;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for ( let y = 0; y < H; y++ ) {
    for ( let x = 0; x < W; x++ ) {
      if ( grid[ y ][ x ] !== 3 ) continue;
      const px = x * TILE;
      const py = y * TILE + TILE / 2;
      ctx.moveTo( px, py );
      ctx.lineTo( px + TILE, py );
    }
  }
  ctx.stroke();
}

// Dots pequenos (2) y pellets grandes (4), nuevo valor del maze en SPEC 03.
function drawDots( ctx, grid ) {
  ctx.fillStyle = DOT_COLOR;
  for ( let y = 0; y < grid.length; y++ ) {
    for ( let x = 0; x < grid[ 0 ].length; x++ ) {
      const v = grid[ y ][ x ];
      if ( v !== 2 && v !== 4 ) continue;
      const { cx, cy } = cellCenter( x, y );
      ctx.beginPath();
      // El pellet grande destaca: radio 6.5 frente al 2.5 del dot.
      ctx.arc( cx, cy, v === 4 ? PELLET_RADIUS : 2.5, 0, Math.PI * 2 );
      ctx.fill();
    }
  }
}

// Pellet movil: misma pieza y radio que los fijos; solo existe si roam no
// es null (una vez comido desaparece para siempre en esta partida).
function drawRoam( ctx, game ) {
  if ( !game.roam ) return;
  const { cx, cy } = cellCenter( game.roam.x, game.roam.y );
  ctx.fillStyle = DOT_COLOR;
  ctx.beginPath();
  ctx.arc( cx, cy, PELLET_RADIUS, 0, Math.PI * 2 );
  ctx.fill();
}

function drawPacman( ctx, p, frame ) {
  const { cx, cy } = cellCenter( p.x, p.y );
  let rot = 0;
  if ( p.dir === 'right' ) rot = 0;
  else if ( p.dir === 'down' ) rot = Math.PI / 2;
  else if ( p.dir === 'left' ) rot = Math.PI;
  else if ( p.dir === 'up' ) rot = -Math.PI / 2;

  // Boca animada: abre/cierra con el frame.
  const open = ( Math.sin( frame * 0.3 ) * 0.5 + 0.5 ) * 0.28 + 0.02;

  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.moveTo( cx, cy );
  ctx.arc( cx, cy, TILE / 2 - 1, rot + open * Math.PI, rot - open * Math.PI );
  ctx.closePath();
  ctx.fill();
}

// Color del cuerpo segun estado: color propio por kind si esta normal; azul
// mientras asustado, alternando con blanco en los ultimos 2 s del modo.
function ghostBodyColor( g, game, frame ) {
  if ( !g.scared ) return GHOST_COLOR[ g.kind ] || '#ff0000';
  const flashing =
    game.frightened <= FLASH_START_FRAMES && Math.floor( frame / 5 ) % 2 === 0;
  return flashing ? FLASH_COLOR : FRIGHTENED_COLOR;
}

// Par de ojos del fantasma mirando segun su direccion. Lo comparten el
// fantasma completo y el reducido a ojos tras ser comido (SPEC 03).
function drawGhostEyes( ctx, g, cx, cy ) {
  const dir = DIRS[ g.dir ] || { x: 0, y: 0 };
  const ex = dir.x * 1.6;
  const ey = dir.y * 1.6;
  for ( const off of [ -3.5, 3.5 ] ) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc( cx + off, cy - 1, 3, 0, Math.PI * 2 );
    ctx.fill();
    ctx.fillStyle = '#0000bb';
    ctx.beginPath();
    ctx.arc( cx + off + ex, cy - 1 + ey, 1.5, 0, Math.PI * 2 );
    ctx.fill();
  }
}

function drawGhost( ctx, g, game, frame ) {
  const { cx, cy } = cellCenter( g.x, g.y );
  const r = TILE / 2 - 1;

  // Fantasma comido: solo quedan los ojos regresando al pen.
  if ( g.eyes ) {
    drawGhostEyes( ctx, g, cx, cy );
    return;
  }

  const bottom = cy + r;
  const left = cx - r;
  const right = cx + r;

  ctx.fillStyle = ghostBodyColor( g, game, frame );
  ctx.beginPath();
  ctx.arc( cx, cy - 1, r, Math.PI, 0, false ); // cabeza
  ctx.lineTo( right, bottom );
  // falda ondulada (3 picos)
  ctx.lineTo( right - r * 0.66, bottom - 4 );
  ctx.lineTo( cx, bottom );
  ctx.lineTo( left + r * 0.66, bottom - 4 );
  ctx.lineTo( left, bottom );
  ctx.closePath();
  ctx.fill();

  // ojos mirando segun direccion
  drawGhostEyes( ctx, g, cx, cy );
}

function drawHUD( ctx, game, W ) {
  ctx.fillStyle = '#fff';
  ctx.font = '14px "Courier New", monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText( 'SCORE ' + game.score, 8, 4 );
  ctx.textAlign = 'right';
  ctx.fillText( 'VIDAS ' + game.lives, W * TILE - 8, 4 );
}

const GHOST_COLOR = {
  hunter: '#ff0000',
  ambusher: '#ffb8ff',
  flanker: '#00ffff',
  shy: '#ffb852',
};

function draw( ctx, game, frame ) {
  const grid = game.grid;
  const W = grid[ 0 ].length;
  const H = grid.length;

  ctx.fillStyle = '#000';
  ctx.fillRect( 0, 0, W * TILE, H * TILE );

  drawWalls( ctx, grid );
  drawDoor( ctx, grid );
  drawDots( ctx, grid );
  drawRoam( ctx, game );
  drawPacman( ctx, game.pacman, frame );
  game.ghosts.forEach( ( g ) => drawGhost( ctx, g, game, frame ) );
  drawHUD( ctx, game, W );
}

window.draw = draw;
