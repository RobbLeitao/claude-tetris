'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#f06292', // + - rosa
  '#a1887f', // U - marrón
  '#aed581', // Y - lima
  '#ffffff', // 1x1 - blanco
  '#78909c', // 3x3 hueca - gris acero
];

const SINGLE = 11;
const HOLLOW = 12;
const PENTOMINOES = [8, 9, 10];
const PENTOMINO_CHANCE = 0.10;
const HOLLOW_CHANCE = 0.03;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentominó)
  [[9,0,9],[9,9,9],[0,0,0]],                  // U (pentominó)
  [[0,10,0,0],[10,10,10,10],[0,0,0,0],[0,0,0,0]], // Y (pentominó)
  [[11]],                                      // 1x1 (recompensa)
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hueca (reto)
];

const LIGHT_COLORS = [
  null,
  '#00acc1', // I
  '#f9a825', // O
  '#8e24aa', // T
  '#43a047', // S
  '#e53935', // Z
  '#1e72d6', // J
  '#ef6c00', // L
  '#d81b60', // +
  '#6d4c41', // U
  '#7cb342', // Y
  '#455a64', // 1x1
  '#37474f', // 3x3 hueca
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending;

// El tema vive fuera de init() para que Reiniciar lo conserve
let theme = 'dark';
let gridColor, shineColor;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const roll = Math.random();
  let type;
  if (roll < HOLLOW_CHANCE) type = HOLLOW;
  else if (roll < HOLLOW_CHANCE + PENTOMINO_CHANCE)
    type = PENTOMINOES[Math.floor(Math.random() * PENTOMINOES.length)];
  else type = Math.floor(Math.random() * 7) + 1;
  return makePiece(type);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    if (cleared === 4) rewardPending = true;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = rewardPending ? makePiece(SINGLE) : randomPiece();
  rewardPending = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----
// Cada skin define su paleta (por tema claro/oscuro) y su función de dibujo.
// El estado de la skin vive fuera de init() para que Reiniciar lo conserve.
const PASTEL_DARK = [
  null, '#a8e6ef', '#fff1b8', '#e1bee7', '#c8e6c9', '#ffb3b3', '#bbdefb',
  '#ffe0b2', '#f8bbd0', '#d7ccc8', '#dcedc8', '#ffffff', '#b0bec5',
];
const PASTEL_LIGHT = [
  null, '#7fd3df', '#f7dc7a', '#cf9bd8', '#9fd3a2', '#f19a9a', '#8fbdea',
  '#f5c27d', '#ee8fb0', '#bfa89f', '#b5d98a', '#90a4ae', '#8fa3ad',
];

function drawBlockNeon(context, x, y, colorIndex, size, a) {
  const color = COLORS[colorIndex]; // colores vivos en ambos temas: el fondo siempre es negro
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  context.save();
  context.globalAlpha = a;
  context.shadowColor = color;
  context.shadowBlur = 14 * a;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px, py, s, s);
  context.fillStyle = color;
  context.globalAlpha = a * 0.28;
  context.fillRect(px, py, s, s);
  context.restore(); // restaura shadowBlur/shadowColor/globalAlpha
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlockPastel(context, x, y, colorIndex, size, a) {
  const color = (theme === 'light' ? PASTEL_LIGHT : PASTEL_DARK)[colorIndex];
  const px = x * size + 2, py = y * size + 2, s = size - 4;
  context.save();
  context.globalAlpha = a;
  roundedRectPath(context, px, py, s, s, size * 0.28);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  context.stroke();
  // brillo suave
  roundedRectPath(context, px + s * 0.18, py + s * 0.14, s * 0.64, s * 0.2, s * 0.1);
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.fill();
  context.restore();
}

function drawBlockPixel(context, x, y, colorIndex, size, a) {
  const color = (theme === 'light' ? LIGHT_COLORS : COLORS)[colorIndex];
  const u = size / 6; // 6x6 "píxeles" por bloque
  const px = x * size, py = y * size;
  context.save();
  context.globalAlpha = a;
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  // borde oscuro de 1 píxel
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(px, py, size, u);
  context.fillRect(px, py + size - u, size, u);
  context.fillRect(px, py, u, size);
  context.fillRect(px + size - u, py, u, size);
  // luz arriba/izquierda y sombra abajo/derecha
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.fillRect(px + u, py + u, size - 3 * u, u);
  context.fillRect(px + u, py + u, u, size - 3 * u);
  context.fillStyle = 'rgba(0, 0, 0, 0.3)';
  context.fillRect(px + u, py + size - 2 * u, size - 2 * u, u);
  context.fillRect(px + size - 2 * u, py + u, u, size - 2 * u);
  // dither en tablero de ajedrez en el interior
  context.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let i = 2; i < 4; i++)
    for (let j = 2; j < 4; j++)
      if ((i + j) % 2 === 0) context.fillRect(px + i * u, py + j * u, u, u);
  context.restore();
}

const SKINS = {
  retro:  { label: 'Retro',      background: null },
  neon:   { label: 'Neón',       draw: drawBlockNeon },
  pastel: { label: 'Pastel',     draw: drawBlockPastel },
  pixel:  { label: 'Pixel art',  draw: drawBlockPixel },
};
let skin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  if (SKINS[skin].draw) {
    SKINS[skin].draw(context, x, y, colorIndex, size, alpha ?? 1);
    return;
  }
  const color = (theme === 'light' ? LIGHT_COLORS : COLORS)[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = shineColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() se llamó desde dentro de este frame: no hay frame pendiente que cancelar
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function setTheme(value) {
  theme = value === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  shineColor = style.getPropertyValue('--shine').trim();
  themeBtn.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  themeBtn.setAttribute('aria-pressed', String(theme === 'light'));
  try { localStorage.setItem('tetris-theme', theme); } catch (e) {}
  // En pausa o game over el rAF está cancelado: forzar redibujado
  if (current && next) { draw(); drawNext(); }
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  rewardPending = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return; // las flechas manejan el selector, no la pieza
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', () => {
  setTheme(theme === 'light' ? 'dark' : 'light');
  themeBtn.blur(); // evita que Space reactive el botón
});

const skinSelect = document.getElementById('skin-select');

function setSkin(value) {
  skin = SKINS[value] ? value : 'retro';
  document.documentElement.dataset.skin = skin;
  // la skin puede redefinir --grid / --shine en CSS
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  shineColor = style.getPropertyValue('--shine').trim();
  skinSelect.value = skin;
  try { localStorage.setItem('tetris-skin', skin); } catch (e) {}
  if (current && next) { draw(); drawNext(); }
}

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que Space cambie la selección
});

let savedSkin = 'retro';
try { savedSkin = localStorage.getItem('tetris-skin') || 'retro'; } catch (e) {}
setSkin(savedSkin);

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('tetris-theme') || 'dark'; } catch (e) {}
setTheme(savedTheme);
init();
