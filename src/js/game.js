// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame
const GHOST_SPEEDS = { hunter: 1 / 9 }; // velocidad por kind; fallback: GHOST_SPEED

// Esquinas de scatter por kind. Son casillas del borde (no transitables):
// solo fijan el rumbo greedy, no hay que alcanzarlas.
const SCATTER_TARGETS = {
  hunter:   { x: 26, y: 0 },
  ambusher: { x: 1,  y: 0 },
  flanker:  { x: 26, y: 30 },
  shy:      { x: 1,  y: 30 },
};

// Turnos de salida de la pen: punto de referencia fuera de la puerta y
// frames de espera por fantasma (turnos 0 / 90 / 180 / 270, ~1,5 s entre ellos).
const EXIT_TARGET = { x: 13, y: 11 };
const EXIT_STAGGER_FRAMES = 90;
const POWER_POINTS = 50; // puntos por pellet grande (los dots valen 10)
const ROAM_VISIBLE_FRAMES = 180; // 3 s de vida del pellet movil antes de saltar
const FRIGHTENED_FRAMES = 420; // 7 s de modo asustado por cada pellet comido

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  // Dots y pellets grandes cuentan ambos para la victoria (SPEC 03).
  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    phase: { name: 'scatter', framesLeft: 420 }, // ciclo scatter/chase
    // Pellet movil: casilla al azar (nunca sobre Pac-Man) y timer de 3 s.
    roam: { ...pickRoamCell( grid, [ { x: PACMAN_START.x, y: PACMAN_START.y } ] ), framesLeft: ROAM_VISIBLE_FRAMES },
    frightened: 0, // frames restantes de modo asustado; 0 = apagado
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g, i ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEEDS[ g.kind ] || GHOST_SPEED,
      kind: g.kind,
      home: true,                          // dentro de la pen / subiendo por la puerta
      exitDelay: i * EXIT_STAGGER_FRAMES,  // frames de espera antes de su turno
      scared: false,                       // asustado por un power pellet
      eyes: false,                         // ojos regresando al pen (paso 4)
    } ) ),
  };
}

// El pellet movil puede caer en cualquier celda transitable fuera de muros,
// puerta y pen; nunca en las celdas de la lista avoid (Pac-Man, la actual).
function pickRoamCell( grid, avoid ) {
  const candidates = [];
  for ( let y = 0; y < grid.length; y++ ) {
    for ( let x = 0; x < grid[ 0 ].length; x++ ) {
      const v = grid[ y ][ x ];
      if ( v === 1 || v === 3 ) continue;         // muro o puerta de la pen
      if ( x >= 11 && x <= 16 && y >= 12 && y <= 15 ) continue; // pen
      if ( avoid.some( ( c ) => c.x === x && c.y === y ) ) continue;
      candidates.push( { x, y } );
    }
  }
  return candidates[ Math.floor( Math.random() * candidates.length ) ];
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3), siempre.
//   ghost:  bloqueado por pared (1); la puerta (3) solo es transitable si
//           le pasamos allowDoor, unicamente durante su salida de la pen.
//           Asi la puerta queda de un solo sentido: entrar, jamas.
function isWall( grid, x, y, actor, allowDoor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'ghost' && allowDoor === true ) return false;
  if ( v === 3 ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir? El flag allowDoor
// solo se usa con fantasma en salida de la pen: omitirlo bloquea la puerta.
function canMove( grid, x, y, dir, actor, allowDoor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor, allowDoor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

// Cambio de velocidad a mitad de casilla: la posicion puede quedar en una
// fraccion incompatible con la velocidad nueva (p. ej. k/20 al volver a 1/10)
// y entonces aligned() no vuelve a dar cierto jamas: el actor dejaria de
// comprobar muros y se iria de pantalla. En el frame del cambio se lleva al
// centro de casilla mas cercano; el salto es de media casilla como maximo y
// coincide con el cambio de color del modo, asi que no se aprecia.
function snapToCell( game, g ) {
  g.x = Math.round( g.x );
  g.y = Math.round( g.y );
  wrapTunnel( g, game.grid[ 0 ].length );
}

// Arranca (o recarga) el modo asustado al comer cualquier power pellet:
// temporizador al maximo, media vuelta de los fantasmas fuera de la pen y
// flag scared en todos. Comer dentro del modo no reinicia a los muertos.
function startFrightened( game ) {
  game.frightened = FRIGHTENED_FRAMES;
  game.ghosts.forEach( ( g ) => {
    g.scared = true;
    if ( !g.home ) g.dir = OPPOSITE[ g.dir ];
  } );
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot (10) o pellet grande (50); ambos cuentan para ganar.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    } else if ( grid[ p.y ][ p.x ] === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += POWER_POINTS;
      game.dotsRemaining--;
      startFrightened( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Casilla objetivo en chase segun el kind del fantasma:
//   hunter:   la casilla de Pac-Man (persecucion agresiva).
//   ambusher: 4 casillas delante de Pac-Man en su direccion actual.
//   flanker:  el espejo de Pac-Man respecto al hunter (lo flanquea).
//   shy:      persigue a Pac-Man si esta lejos (> 8 casillas); si esta cerca
//             se repliega a su esquina de scatter.
function chaseTarget( game, g ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );

  if ( g.kind === 'hunter' ) return { x: px, y: py };

  if ( g.kind === 'shy' ) {
    const dist = Math.abs( Math.round( g.x ) - px ) + Math.abs( Math.round( g.y ) - py );
    if ( dist <= 8 ) return SCATTER_TARGETS.shy;
    return { x: px, y: py };
  }

  const d = DIRS[ p.dir ];
  if ( g.kind === 'ambusher' ) return { x: px + d.x * 4, y: py + d.y * 4 };

  // flanker: espejo = 2 * (pacman + 2 * dirPacman) - hunter.
  const mid = { x: px + d.x * 2, y: py + d.y * 2 };
  const h = game.ghosts.find( ( other ) => other.kind === 'hunter' ) || g;
  return {
    x: mid.x + ( mid.x - Math.round( h.x ) ),
    y: mid.y + ( mid.y - Math.round( h.y ) ),
  };
}

// Elige la opcion que mas acerca a g hacia su objetivo (distancia Manhattan).
// Desempate conservado del motor original: gana el primer minimo, en el
// orden de DIRS (left, right, up, down).
function chooseStep( choices, g, target ) {
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - target.x ) + Math.abs( ny - target.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

// Decision de direccion en cada celda alineada. Opciones = salidas validas
// sin media vuelta. Sin salida (callejon): permitir el giro de 180.
// Asustado y fuera del pen: elegir al azar entre las mismas opciones.
function decideGhost( game, g ) {
  const grid = game.grid;
  // Mientras el fantasma este en casa (con su turno ya liberado) su unica
  // meta es la casilla libre sobre la puerta; fuera reina scatter/chase.
  const target = g.home
    ? EXIT_TARGET
    : game.phase.name === 'scatter'
      ? SCATTER_TARGETS[ g.kind ]
      : chaseTarget( game, g );

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost', g.home )
  );
  const choices = options.length ? options : [ OPPOSITE[ g.dir ] ];

  g.dir = g.scared && !g.home
    ? choices[ Math.floor( Math.random() * choices.length ) ]  // deriva de asustado
    : chooseStep( choices, g, target );
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // Turno de salida pendiente: se queda quieto hasta que le toque moverse.
  if ( g.home && g.exitDelay > 0 ) {
    g.exitDelay--;
    return;
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    // Salida completada: alineado en el plano y <= 11 ya esta fuera de la
    // puerta y deja de estar en casa (los pasos de 0.1 no caen exactos).
    if ( g.home && g.y <= 11 ) g.home = false;
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost', g.home ) ) return;
  }

  // Los asustados van a la mitad de velocidad (1/20 y 1/18 celdas/frame;
  // ambos alinean centros de casilla como las velocidades normales).
  const speed = g.scared ? g.speed / 2 : g.speed;
  const d = DIRS[ g.dir ];
  g.x += d.x * speed;
  g.y += d.y * speed;
  wrapTunnel( g, width );
}

// Tras perder una vida: Pac-Man y los 4 fantasmas reaparecen en sus celdas de
// inicio y los fantasmas repiten la salida escalonada desde cero.
function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.home = true;
    g.exitDelay = i * EXIT_STAGGER_FRAMES;
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

// Avanza el ciclo scatter/chase: 420 frames de scatter alternados con 1200
// de chase, indefinidamente. En cada cambio de fase los 4 fantasmas invierten
// su direccion en ese frame (reversa forzada, como en el arcade).
function tickPhase( game ) {
  game.phase.framesLeft--;
  if ( game.phase.framesLeft > 0 ) return;

  if ( game.phase.name === 'scatter' ) game.phase = { name: 'chase', framesLeft: 1200 };
  else game.phase = { name: 'scatter', framesLeft: 420 };
  // La reversa forzada solo toca a los fantasmas fuera de la pen y en estado
  // normal: los asustados no responden a los cambios de fase (arcade) y los
  // ojos van de vuelta a la pen con su propio rumbo.
  game.ghosts.forEach( ( g ) => {
    if ( !g.home && !g.scared && !g.eyes ) g.dir = OPPOSITE[ g.dir ];
  } );
}

// Ciclo del pellet movil: visible ROAM_VISIBLE_FRAMES frames (3 s) y al
// cumplirse reaparece al instante en otra casilla distinta. Comerlo suma
// POWER_POINTS y lo elimina de la partida (roam = null, no reaparece).
function tickRoam( game ) {
  const r = game.roam;
  if ( !r ) return;
  if ( collides( game.pacman, r ) ) {
    game.score += POWER_POINTS;
    // El movil asusta igual que el pellet fijo de las esquinas.
    startFrightened( game );
    game.roam = null;
    return;
  }
  r.framesLeft--;
  if ( r.framesLeft > 0 ) return;
  // Reubicacion: se evita la casilla de donde salta y la de Pac-Man.
  const old = { x: r.x, y: r.y };
  const pac = { x: Math.round( game.pacman.x ), y: Math.round( game.pacman.y ) };
  const cell = pickRoamCell( game.grid, [ old, pac ] );
  r.x = cell.x;
  r.y = cell.y;
  r.framesLeft = ROAM_VISIBLE_FRAMES;
}

// Cuenta atras del modo asustado. Al llegar a cero limpia los flags scared
// y todos vuelven a color, velocidad y objetivos normales (los ojos siguen
// siendo ojos hasta renacer; en este paso aun no existen ojos en transito).
function tickFrightened( game ) {
  if ( game.frightened <= 0 ) return;
  game.frightened--;
  if ( game.frightened === 0 ) {
    // Al recuperar la velocidad normal cada fantasma se realinea al centro
    // de casilla mas cercano (snapToCell): sin ello, un asustado a mitad de
    // casilla queda en una fraccion incompatible con 1/10 o 1/9 y se sale
    // por los muros fuera de pantalla.
    game.ghosts.forEach( ( g ) => {
      g.scared = false;
      snapToCell( game, g );
    } );
  }
}

function update( game ) {
  tickPhase( game );
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );
  tickRoam( game );
  tickFrightened( game );

  for ( const g of game.ghosts ) {
    // Mientras asustado, rozar a Pac-Man no cuesta vida (comerlos llega en 4).
    if ( g.scared ) continue;
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
