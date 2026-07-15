const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const canvas = document.querySelector("#game-canvas");
const scoreValue = document.querySelector("#score-value");
const bestValue = document.querySelector("#best-value");
const statusValue = document.querySelector("#status-value");
const gameStatus = document.querySelector("#game-status");
const startButton = document.querySelector("#start-btn");
const pauseButton = document.querySelector("#pause-btn");
const restartButton = document.querySelector("#restart-btn");
const touchButtons = document.querySelectorAll("[data-dir]");

const ctx = canvas ? canvas.getContext("2d") : null;
const GRID = 20;
const BASE_STEP = 140;
const BOOST_STEP = 95;
const BOOST_DURATION = 8000;
const POWER_UP_INTERVAL = 10000;
const STORAGE_KEY = "gamzabox-snake-best";

const colors = {
  snakeHead: "#0f5fff",
  snakeBody: "#7ea8ff",
  snakeTail: "#bfd0ff",
  food: "#178a4b",
  powerGrowth: "#ff8f1f",
  powerBoost: "#9b5cff",
  grid: "rgba(19, 19, 19, 0.04)",
  text: "#131313",
};

const state = {
  running: false,
  paused: false,
  gameOver: false,
  score: 0,
  bestScore: Number(localStorage.getItem(STORAGE_KEY) || 0),
  stepMs: BASE_STEP,
  tickId: null,
  powerUpId: null,
  boostResetId: null,
  queuedDirection: { x: 1, y: 0 },
  direction: { x: 1, y: 0 },
  snake: [],
  food: null,
  powerUp: null,
  growthPending: 0,
  boostActive: false,
  message: "Start 버튼을 누르거나 방향키로 시작하세요.",
};

function initSnake() {
  return [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 },
  ];
}

function toKey(dir) {
  return `${dir.x},${dir.y}`;
}

function isOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function randomCell(exclusions = []) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const cell = { x: randomInt(GRID), y: randomInt(GRID) };
    const occupied = exclusions.some((entry) => entry.x === cell.x && entry.y === cell.y);
    if (!occupied) {
      return cell;
    }
  }
  return { x: 0, y: 0 };
}

function cellsOccupied() {
  const occupied = [...state.snake];
  if (state.food) {
    occupied.push(state.food);
  }
  if (state.powerUp) {
    occupied.push(state.powerUp.position);
  }
  return occupied;
}

function setMessage(message) {
  state.message = message;
  if (gameStatus) {
    gameStatus.textContent = message;
  }
}

function updateHud() {
  if (scoreValue) {
    scoreValue.textContent = String(state.score);
  }
  if (bestValue) {
    bestValue.textContent = String(state.bestScore);
  }
  if (statusValue) {
    const label = state.gameOver
      ? "Game over"
      : state.paused
        ? "Paused"
        : state.running
          ? state.boostActive
            ? "Boost active"
            : "Running"
          : "Ready to start";
    statusValue.textContent = label;
  }
}

function spawnFood() {
  state.food = randomCell(cellsOccupied());
}

function spawnPowerUp() {
  if (!state.running || state.paused || state.gameOver || state.powerUp) {
    schedulePowerUp();
    return;
  }

  const types = ["growth", "boost", "growth", "mega"];
  const type = types[randomInt(types.length)];
  state.powerUp = {
    type,
    position: randomCell(cellsOccupied()),
  };
  setMessage(type === "boost" ? "Boost capsule appeared." : "Random item appeared.");
  draw();
  schedulePowerUp();
}

function schedulePowerUp() {
  window.clearTimeout(state.powerUpId);
  if (!state.running || state.gameOver) {
    state.powerUpId = null;
    return;
  }
  const delay = POWER_UP_INTERVAL + randomInt(3000);
  state.powerUpId = window.setTimeout(spawnPowerUp, delay);
}

function clearTimers() {
  window.clearInterval(state.tickId);
  window.clearTimeout(state.powerUpId);
  window.clearTimeout(state.boostResetId);
  state.tickId = null;
  state.powerUpId = null;
  state.boostResetId = null;
}

function resizeCanvas() {
  if (!canvas || !ctx) {
    return;
  }

  const wrapper = canvas.parentElement;
  const size = Math.max(280, Math.min(wrapper.clientWidth, 640));
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function drawGrid(cellSize) {
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID; i += 1) {
    const pos = i * cellSize;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, GRID * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(GRID * cellSize, pos);
    ctx.stroke();
  }
}

function drawCell(cell, cellSize, color, radius = 8) {
  const pad = cellSize * 0.12;
  const x = cell.x * cellSize + pad;
  const y = cell.y * cellSize + pad;
  const size = cellSize - pad * 2;
  const r = Math.min(radius, size / 2);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + size - r, y);
  ctx.quadraticCurveTo(x + size, y, x + size, y + r);
  ctx.lineTo(x + size, y + size - r);
  ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
  ctx.lineTo(x + r, y + size);
  ctx.quadraticCurveTo(x, y + size, x, y + size - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function draw() {
  if (!canvas || !ctx) {
    return;
  }

  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  const cellSize = Math.min(width, height) / GRID;

  ctx.clearRect(0, 0, width, height);
  drawGrid(cellSize);

  if (state.food) {
    drawCell(state.food, cellSize, colors.food, 10);
  }

  if (state.powerUp) {
    const powerColor = state.powerUp.type === "boost" ? colors.powerBoost : colors.powerGrowth;
    drawCell(state.powerUp.position, cellSize, powerColor, 10);
  }

  state.snake.forEach((segment, index) => {
    const tone = index === 0 ? colors.snakeHead : index === state.snake.length - 1 ? colors.snakeTail : colors.snakeBody;
    drawCell(segment, cellSize, tone, 12);
  });
}

function applyQueuedDirection() {
  if (!isOpposite(state.queuedDirection, state.direction)) {
    state.direction = { ...state.queuedDirection };
  }
}

function endGame(message) {
  state.running = false;
  state.paused = false;
  state.gameOver = true;
  clearTimers();
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_KEY, String(state.bestScore));
  }
  setMessage(message || "Game over. Restart to try again.");
  updateHud();
  draw();
}

function applyFood() {
  state.score += 10;
  state.growthPending += 1;
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_KEY, String(state.bestScore));
  }
  spawnFood();
  setMessage("Food collected. Keep moving.");
}

function applyPowerUp() {
  if (!state.powerUp) {
    return;
  }

  if (state.powerUp.type === "boost") {
    state.boostActive = true;
    state.stepMs = BOOST_STEP;
    restartLoop();
    state.boostResetId = window.setTimeout(() => {
      state.boostActive = false;
      state.stepMs = BASE_STEP;
      restartLoop();
      setMessage("Boost faded. Back to normal speed.");
    }, BOOST_DURATION);
    state.score += 20;
    state.growthPending += 1;
    setMessage("Boost capsule collected. Faster movement unlocked.");
  } else if (state.powerUp.type === "mega") {
    state.score += 40;
    state.growthPending += 3;
    setMessage("Mega orb collected. Snake grows larger.");
  } else {
    state.score += 25;
    state.growthPending += 2;
    setMessage("Growth orb collected. Snake grows larger.");
  }

  state.powerUp = null;
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem(STORAGE_KEY, String(state.bestScore));
  }
}

function stepGame() {
  applyQueuedDirection();

  const head = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y,
  };

  const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
  const willEatFood = Boolean(state.food && head.x === state.food.x && head.y === state.food.y);
  const willEatPower = Boolean(
    state.powerUp && head.x === state.powerUp.position.x && head.y === state.powerUp.position.y,
  );
  const shouldKeepTail = state.growthPending > 0 || willEatFood || willEatPower;
  const bodyToCheck = shouldKeepTail ? state.snake : state.snake.slice(0, -1);
  const hitBody = bodyToCheck.some((segment) => segment.x === head.x && segment.y === head.y);

  if (hitWall || hitBody) {
    endGame(hitWall ? "Wall collision. Restart to continue." : "Self collision. Restart to continue.");
    return;
  }

  state.snake.unshift(head);

  let consumedFood = false;
  if (willEatFood) {
    applyFood();
    consumedFood = true;
  }

  if (willEatPower) {
    applyPowerUp();
  }

  if (state.growthPending > 0) {
    state.growthPending -= 1;
  } else if (!consumedFood) {
    state.snake.pop();
  }

  updateHud();
  draw();
}

function startLoop() {
  if (state.tickId || !state.running || state.paused || state.gameOver) {
    return;
  }

  state.tickId = window.setInterval(stepGame, state.stepMs);
  schedulePowerUp();
}

function restartLoop() {
  if (!state.running || state.paused || state.gameOver) {
    return;
  }

  window.clearInterval(state.tickId);
  state.tickId = window.setInterval(stepGame, state.stepMs);
}

function startGame(message) {
  if (state.running && !state.gameOver) {
    return;
  }

  clearTimers();
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.score = 0;
  state.stepMs = state.boostActive ? BOOST_STEP : BASE_STEP;
  state.direction = { x: 1, y: 0 };
  state.queuedDirection = { x: 1, y: 0 };
  state.snake = initSnake();
  state.food = null;
  state.powerUp = null;
  state.growthPending = 0;
  spawnFood();
  updateHud();
  setMessage(message || "Game started. Chase the food and the random items.");
  draw();
  startLoop();
}

function pauseGame() {
  if (!state.running || state.gameOver) {
    return;
  }

  state.paused = !state.paused;
  window.clearInterval(state.tickId);
  state.tickId = null;
  setMessage(state.paused ? "Game paused." : "Game resumed.");
  updateHud();
  if (!state.paused) {
    startLoop();
  }
}

function resetGame() {
  clearTimers();
  state.running = false;
  state.paused = false;
  state.gameOver = false;
  state.score = 0;
  state.stepMs = BASE_STEP;
  state.direction = { x: 1, y: 0 };
  state.queuedDirection = { x: 1, y: 0 };
  state.snake = initSnake();
  state.food = null;
  state.powerUp = null;
  state.growthPending = 0;
  state.boostActive = false;
  spawnFood();
  updateHud();
  setMessage("Reset complete. Press Start to begin.");
  draw();
}

function queueDirection(nextDirection) {
  if (state.gameOver) {
    startGame("Restarted after game over.");
    state.queuedDirection = nextDirection;
    return;
  }

  if (!state.running) {
    startGame("Game started with a movement input.");
  }

  if (isOpposite(nextDirection, state.direction)) {
    return;
  }

  state.queuedDirection = nextDirection;
}

function keyToDirection(key) {
  const map = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    W: { x: 0, y: -1 },
    a: { x: -1, y: 0 },
    A: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    S: { x: 0, y: 1 },
    d: { x: 1, y: 0 },
    D: { x: 1, y: 0 },
  };
  return map[key] || null;
}

function wireControls() {
  if (menuToggle && siteNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = siteNav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    siteNav.addEventListener("click", (event) => {
      if (event.target.matches("a")) {
        siteNav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  window.addEventListener("keydown", (event) => {
    const direction = keyToDirection(event.key);
    if (direction) {
      event.preventDefault();
      queueDirection(direction);
      return;
    }

    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      pauseGame();
    }
  });

  touchButtons.forEach((button) => {
    const direction = button.dataset.dir;
    const handle = (event) => {
      event.preventDefault();
      const map = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      queueDirection(map[direction]);
    };

    button.addEventListener("click", handle);
    button.addEventListener("touchstart", handle, { passive: false });
  });

  if (startButton) {
    startButton.addEventListener("click", () => startGame("Game started."));
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", pauseGame);
  }

  if (restartButton) {
    restartButton.addEventListener("click", () => {
      resetGame();
      startGame("Game restarted.");
    });
  }
}

function boot() {
  if (!canvas || !ctx) {
    return;
  }

  updateHud();
  resetGame();
  wireControls();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

boot();
