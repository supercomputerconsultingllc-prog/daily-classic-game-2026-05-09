const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");

const scoreValue = document.getElementById("scoreValue");
const livesValue = document.getElementById("livesValue");
const levelValue = document.getElementById("levelValue");
const comboValue = document.getElementById("comboValue");
const bestValue = document.getElementById("bestValue");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const images = {
  background: new Image(),
  paddle: new Image(),
  ball: new Image(),
  brickCyan: new Image(),
  brickMagenta: new Image(),
  brickGold: new Image(),
  powerExpand: new Image(),
  powerSlow: new Image(),
  powerMulti: new Image(),
  life: new Image()
};

images.background.src = "assets/bg-neon.svg";
images.paddle.src = "assets/paddle-neon.svg";
images.ball.src = "assets/ball-plasma.svg";
images.brickCyan.src = "assets/brick-cyan.svg";
images.brickMagenta.src = "assets/brick-magenta.svg";
images.brickGold.src = "assets/brick-gold.svg";
images.powerExpand.src = "assets/powerup-expand.svg";
images.powerSlow.src = "assets/powerup-slow.svg";
images.powerMulti.src = "assets/powerup-multi.svg";
images.life.src = "assets/life-heart.svg";

const levels = [
  [
    "0011111100",
    "0112222210",
    "1123333211",
    "1123333211",
    "0112222210",
    "0011111100"
  ],
  [
    "1233213321",
    "2331121132",
    "3311111133",
    "2223333222",
    "1332222331",
    "3111111113"
  ],
  [
    "3333333333",
    "3222222223",
    "3211111123",
    "3213333123",
    "3222222223",
    "3333333333"
  ]
];

const brickTypes = {
  1: { hp: 1, points: 120, sprite: "brickCyan", dropChance: 0.2 },
  2: { hp: 2, points: 180, sprite: "brickMagenta", dropChance: 0.24 },
  3: { hp: 3, points: 260, sprite: "brickGold", dropChance: 0.28 }
};

const powerPool = ["expand", "slow", "multi"];

const input = {
  keys: new Set(),
  pointerActive: false,
  pointerX: WIDTH / 2
};

function safeReadBestScore() {
  try {
    return Number(window.localStorage.getItem("neonBreakerBest") || 0);
  } catch {
    return 0;
  }
}

function safeWriteBestScore(value) {
  try {
    window.localStorage.setItem("neonBreakerBest", String(value));
  } catch {
    // Ignore storage failures for file:// or restricted webview contexts.
  }
}

const state = {
  mode: "loading",
  score: 0,
  lives: 3,
  level: 0,
  combo: 1,
  best: safeReadBestScore(),
  runningAction: null,
  slowUntil: 0,
  expandUntil: 0,
  paddleVelocity: 0
};

const paddle = {
  baseWidth: 164,
  width: 164,
  height: 28,
  x: WIDTH / 2 - 82,
  y: HEIGHT - 52,
  speed: 11
};

let balls = [];
let bricks = [];
let particles = [];
let powerUps = [];

let audioContext = null;
let lastTick = performance.now();

function loadAll(imageMap) {
  return Promise.all(
    Object.values(imageMap).map(
      (img) =>
        new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        })
    )
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function showOverlay(title, message, actionLabel, action) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startButton.textContent = actionLabel;
  state.runningAction = action;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function syncHud() {
  scoreValue.textContent = String(state.score);
  livesValue.innerHTML = "";
  for (let i = 0; i < state.lives; i += 1) {
    const img = document.createElement("img");
    img.src = images.life.src;
    img.alt = "life";
    img.width = 14;
    img.height = 14;
    img.style.marginRight = "3px";
    img.style.verticalAlign = "middle";
    livesValue.appendChild(img);
  }
  levelValue.textContent = String(state.level + 1);
  comboValue.textContent = `x${state.combo.toFixed(2).replace(/\.00$/, "")}`;
  bestValue.textContent = String(state.best);
}

function setBestScore() {
  if (state.score > state.best) {
    state.best = state.score;
    safeWriteBestScore(state.best);
  }
}

function ensureAudio() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioContext = new Ctx();
    }
  }
}

function tone(freq, duration = 0.08, type = "sine", volume = 0.02) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function createBall(fromX = paddle.x + paddle.width / 2, fromY = paddle.y - 16) {
  const speed = randomBetween(5.3, 6.4);
  const angle = randomBetween(-0.8, 0.8);
  return {
    x: fromX,
    y: fromY,
    radius: 12,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    trail: []
  };
}

function spawnParticles(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: randomBetween(-3.4, 3.4),
      vy: randomBetween(-3.5, 2.8),
      life: randomBetween(0.35, 0.9),
      age: 0,
      size: randomBetween(2, 5),
      color
    });
  }
}

function generateBricks(levelIndex) {
  bricks = [];
  const pattern = levels[levelIndex];
  const cols = pattern[0].length;
  const brickWidth = 82;
  const brickHeight = 32;
  const gap = 10;
  const totalWidth = cols * brickWidth + (cols - 1) * gap;
  const originX = Math.floor((WIDTH - totalWidth) / 2);
  const originY = 82;

  pattern.forEach((row, rowIndex) => {
    [...row].forEach((cell, colIndex) => {
      const type = Number(cell);
      if (!type) return;
      const info = brickTypes[type];
      bricks.push({
        x: originX + colIndex * (brickWidth + gap),
        y: originY + rowIndex * (brickHeight + gap),
        width: brickWidth,
        height: brickHeight,
        type,
        hp: info.hp,
        maxHp: info.hp
      });
    });
  });
}

function resetPaddle() {
  paddle.width = paddle.baseWidth;
  paddle.x = WIDTH / 2 - paddle.width / 2;
  input.pointerX = paddle.x + paddle.width / 2;
}

function startLevel(levelIndex) {
  state.mode = "running";
  state.level = levelIndex;
  state.combo = 1;
  state.slowUntil = 0;
  state.expandUntil = 0;
  particles = [];
  powerUps = [];
  resetPaddle();
  generateBricks(levelIndex);
  balls = [createBall()];
  syncHud();
  hideOverlay();
}

function startNewGame() {
  state.score = 0;
  state.lives = 3;
  startLevel(0);
  tone(340, 0.11, "square", 0.03);
}

function setPauseMode(isPaused) {
  if (isPaused) {
    state.mode = "paused";
    showOverlay("Paused", "Take a breath. Resume when ready.", "Resume", () => {
      state.mode = "running";
      hideOverlay();
      tone(520, 0.07, "triangle", 0.03);
    });
  } else {
    state.mode = "running";
    hideOverlay();
  }
}

function circleRectHit(ball, rect) {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.width);
  const closestY = clamp(ball.y, rect.y, rect.y + rect.height);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= ball.radius * ball.radius;
}

function applyPowerUp(type, nowMs) {
  if (type === "expand") {
    state.expandUntil = nowMs + 12000;
    paddle.width = Math.round(paddle.baseWidth * 1.5);
    tone(670, 0.08, "triangle", 0.03);
  }

  if (type === "slow") {
    state.slowUntil = nowMs + 9000;
    tone(300, 0.12, "sine", 0.03);
  }

  if (type === "multi") {
    if (balls.length < 4) {
      const source = balls[0] || createBall();
      const clone = {
        ...source,
        vx: -source.vx,
        vy: source.vy * randomBetween(0.86, 1.14),
        trail: []
      };
      balls.push(clone);
    }
    tone(860, 0.08, "square", 0.028);
  }
}

function loseLife() {
  state.lives -= 1;
  state.combo = 1;
  syncHud();

  if (state.lives <= 0) {
    setBestScore();
    syncHud();
    state.mode = "gameOver";
    showOverlay(
      "Run Over",
      `Final Score: ${state.score}. Best: ${state.best}.`,
      "Play Again",
      () => startNewGame()
    );
    tone(140, 0.35, "sawtooth", 0.03);
    return;
  }

  resetPaddle();
  balls = [createBall()];
  showOverlay("Life Lost", `${state.lives} lives left. Keep going.`, "Continue", () => {
    state.mode = "running";
    hideOverlay();
  });
  state.mode = "paused";
  tone(230, 0.18, "triangle", 0.03);
}

function completeLevel() {
  const nextLevel = state.level + 1;
  if (nextLevel >= levels.length) {
    setBestScore();
    syncHud();
    state.mode = "victory";
    showOverlay(
      "Victory",
      `You cleared every level with ${state.score} points.`,
      "Start New Run",
      () => startNewGame()
    );
    tone(920, 0.09, "triangle", 0.035);
    setTimeout(() => tone(1120, 0.09, "triangle", 0.03), 100);
    setTimeout(() => tone(1320, 0.11, "triangle", 0.03), 180);
    return;
  }

  state.mode = "levelClear";
  showOverlay(
    `Level ${state.level + 1} Clear`,
    `Combo carries forward. Next up: level ${nextLevel + 1}.`,
    "Next Level",
    () => startLevel(nextLevel)
  );
  tone(760, 0.09, "square", 0.03);
}

function updatePaddle(dt) {
  const before = paddle.x;
  const speed = paddle.speed * dt * 60;
  if (input.keys.has("ArrowLeft") || input.keys.has("a")) {
    paddle.x -= speed;
    input.pointerActive = false;
  }
  if (input.keys.has("ArrowRight") || input.keys.has("d")) {
    paddle.x += speed;
    input.pointerActive = false;
  }

  if (input.pointerActive) {
    const target = input.pointerX - paddle.width / 2;
    paddle.x += clamp(target - paddle.x, -speed * 1.45, speed * 1.45);
  }

  paddle.x = clamp(paddle.x, 18, WIDTH - paddle.width - 18);
  state.paddleVelocity = paddle.x - before;
}

function updateParticles(dt) {
  particles = particles.filter((p) => {
    p.age += dt;
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += 0.08 * dt * 60;
    return p.age < p.life;
  });
}

function updatePowerUps(dt, nowMs) {
  powerUps = powerUps.filter((item) => {
    item.y += item.vy * dt * 60;

    const hit =
      item.x < paddle.x + paddle.width &&
      item.x + item.width > paddle.x &&
      item.y < paddle.y + paddle.height &&
      item.y + item.height > paddle.y;

    if (hit) {
      applyPowerUp(item.type, nowMs);
      spawnParticles(item.x + item.width / 2, item.y + item.height / 2, 14, "#9bf3ff");
      return false;
    }

    return item.y < HEIGHT + 40;
  });
}

function maybeDropPowerUp(brick) {
  const info = brickTypes[brick.type];
  if (Math.random() > info.dropChance) return;
  const type = powerPool[Math.floor(Math.random() * powerPool.length)];
  powerUps.push({
    x: brick.x + brick.width / 2 - 15,
    y: brick.y + brick.height / 2 - 15,
    width: 30,
    height: 30,
    vy: 2.4,
    type
  });
}

function collideBricks(ball) {
  for (const brick of bricks) {
    if (brick.hp <= 0) continue;
    if (!circleRectHit(ball, brick)) continue;

    const leftOverlap = Math.abs(ball.x + ball.radius - brick.x);
    const rightOverlap = Math.abs(brick.x + brick.width - (ball.x - ball.radius));
    const topOverlap = Math.abs(ball.y + ball.radius - brick.y);
    const bottomOverlap = Math.abs(brick.y + brick.height - (ball.y - ball.radius));
    const minOverlap = Math.min(leftOverlap, rightOverlap, topOverlap, bottomOverlap);

    if (minOverlap === leftOverlap || minOverlap === rightOverlap) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }

    brick.hp -= 1;

    if (brick.hp <= 0) {
      const points = Math.round(brickTypes[brick.type].points * state.combo);
      state.score += points;
      state.combo = Math.min(8, state.combo + 0.2);
      maybeDropPowerUp(brick);
      spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, 22, "#f8d9ff");
      tone(420 + brick.type * 140, 0.06, "square", 0.02);
    } else {
      state.score += 35;
      tone(280, 0.045, "triangle", 0.015);
    }

    setBestScore();
    syncHud();
    return;
  }
}

function updateBalls(dt, nowMs) {
  const speedMultiplier = nowMs < state.slowUntil ? 0.75 : 1;

  balls.forEach((ball) => {
    ball.x += ball.vx * dt * 60 * speedMultiplier;
    ball.y += ball.vy * dt * 60 * speedMultiplier;

    ball.trail.push({ x: ball.x, y: ball.y, life: 1 });
    if (ball.trail.length > 10) ball.trail.shift();

    if (ball.x - ball.radius <= 0) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx);
      tone(200, 0.03, "sine", 0.01);
    }
    if (ball.x + ball.radius >= WIDTH) {
      ball.x = WIDTH - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      tone(200, 0.03, "sine", 0.01);
    }
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy);
      tone(220, 0.03, "sine", 0.01);
    }

    if (
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius <= paddle.y + paddle.height &&
      ball.x >= paddle.x &&
      ball.x <= paddle.x + paddle.width &&
      ball.vy > 0
    ) {
      const normalizedHit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const speed = Math.hypot(ball.vx, ball.vy) + 0.18;
      ball.vx = Math.sin(normalizedHit * 1.15) * speed + state.paddleVelocity * 0.06;
      ball.vy = -Math.abs(Math.cos(normalizedHit * 1.15) * speed);
      ball.y = paddle.y - ball.radius - 0.5;
      spawnParticles(ball.x, ball.y, 8, "#7ef7ff");
      tone(500, 0.035, "triangle", 0.018);
    }

    collideBricks(ball);
  });

  balls = balls.filter((ball) => ball.y - ball.radius <= HEIGHT + 45);

  if (balls.length === 0) {
    loseLife();
  }

  if (bricks.every((brick) => brick.hp <= 0)) {
    completeLevel();
  }
}

function updateEffects(nowMs) {
  if (nowMs > state.expandUntil && paddle.width !== paddle.baseWidth) {
    paddle.width = paddle.baseWidth;
    paddle.x = clamp(paddle.x, 18, WIDTH - paddle.width - 18);
  }

  if (state.mode === "running" && nowMs > state.slowUntil && state.slowUntil !== 0) {
    state.slowUntil = 0;
  }
}

function update(dt, nowMs) {
  if (state.mode !== "running") {
    updateParticles(dt);
    return;
  }

  updatePaddle(dt);
  updateEffects(nowMs);
  updatePowerUps(dt, nowMs);
  updateBalls(dt, nowMs);
  updateParticles(dt);
}

function drawBackground(nowMs) {
  ctx.drawImage(images.background, 0, 0, WIDTH, HEIGHT);

  // Subtle scanline pulse to add motion while preserving readability.
  ctx.globalAlpha = 0.13 + Math.sin(nowMs * 0.0018) * 0.04;
  for (let y = 0; y < HEIGHT; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "#8cd4ff" : "#ff8bf7";
    ctx.fillRect(0, y, WIDTH, 1);
  }
  ctx.globalAlpha = 1;
}

function drawBricks() {
  for (const brick of bricks) {
    if (brick.hp <= 0) continue;

    const info = brickTypes[brick.type];
    ctx.drawImage(images[info.sprite], brick.x, brick.y, brick.width, brick.height);

    if (brick.hp < brick.maxHp) {
      ctx.fillStyle = "rgba(8, 12, 31, 0.55)";
      ctx.fillRect(brick.x + 4, brick.y + brick.height - 8, brick.width - 8, 4);
      ctx.fillStyle = "#dcf3ff";
      const ratio = brick.hp / brick.maxHp;
      ctx.fillRect(brick.x + 4, brick.y + brick.height - 8, (brick.width - 8) * ratio, 4);
    }
  }
}

function drawPaddle() {
  ctx.save();
  ctx.shadowColor = "rgba(116, 211, 255, 0.72)";
  ctx.shadowBlur = 20;
  ctx.drawImage(images.paddle, paddle.x, paddle.y, paddle.width, paddle.height);
  ctx.restore();
}

function drawBalls() {
  for (const ball of balls) {
    ball.trail.forEach((step, index) => {
      const alpha = (index + 1) / ball.trail.length;
      ctx.fillStyle = `rgba(139, 255, 255, ${alpha * 0.18})`;
      ctx.beginPath();
      ctx.arc(step.x, step.y, ball.radius * alpha * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.shadowColor = "rgba(255, 233, 173, 0.8)";
    ctx.shadowBlur = 22;
    ctx.drawImage(images.ball, ball.x - ball.radius, ball.y - ball.radius, ball.radius * 2, ball.radius * 2);
    ctx.restore();
  }
}

function drawPowerUps() {
  for (const item of powerUps) {
    let sprite = images.powerExpand;
    if (item.type === "slow") sprite = images.powerSlow;
    if (item.type === "multi") sprite = images.powerMulti;

    ctx.save();
    ctx.shadowColor = "rgba(185, 229, 255, 0.7)";
    ctx.shadowBlur = 18;
    ctx.drawImage(sprite, item.x, item.y, item.width, item.height);
    ctx.restore();
  }
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const lifeLeft = 1 - p.age / p.life;
    ctx.fillStyle = `${p.color}${Math.round(clamp(lifeLeft, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0")}`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * lifeLeft, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEffectHints(nowMs) {
  const active = [];
  if (nowMs < state.expandUntil) active.push("EXPAND");
  if (nowMs < state.slowUntil) active.push("SLOW");
  if (balls.length > 1) active.push("MULTI");
  if (active.length === 0) return;

  ctx.fillStyle = "rgba(3, 9, 26, 0.6)";
  ctx.fillRect(18, HEIGHT - 35, 220, 20);
  ctx.fillStyle = "#d5eeff";
  ctx.font = "13px Trebuchet MS, sans-serif";
  ctx.fillText(`Effects: ${active.join(" | ")}`, 24, HEIGHT - 20);
}

function render(nowMs) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground(nowMs);
  drawBricks();
  drawPowerUps();
  drawPaddle();
  drawBalls();
  drawParticles();
  drawEffectHints(nowMs);
}

function frame(nowMs) {
  const dt = Math.min((nowMs - lastTick) / 1000, 0.033);
  lastTick = nowMs;
  update(dt, nowMs);
  render(nowMs);
  requestAnimationFrame(frame);
}

function onPointerMove(clientX) {
  const rect = canvas.getBoundingClientRect();
  input.pointerX = ((clientX - rect.left) / rect.width) * WIDTH;
  input.pointerActive = true;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowleft", "arrowright", "a", "d"].includes(key)) {
    input.keys.add(key === "arrowleft" ? "ArrowLeft" : key === "arrowright" ? "ArrowRight" : key);
    event.preventDefault();
  }

  if (key === "p") {
    if (state.mode === "running") {
      setPauseMode(true);
    } else if (state.mode === "paused" && state.runningAction) {
      state.runningAction();
    }
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "a", "d"].includes(key)) {
    input.keys.delete(key === "arrowleft" ? "ArrowLeft" : key === "arrowright" ? "ArrowRight" : key);
    event.preventDefault();
  }
});

canvas.addEventListener("mousemove", (event) => {
  onPointerMove(event.clientX);
});

canvas.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    onPointerMove(touch.clientX);
    event.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener("pointerdown", (event) => {
  ensureAudio();
  onPointerMove(event.clientX);
});

startButton.addEventListener("click", () => {
  ensureAudio();
  if (state.runningAction) {
    state.runningAction();
  } else {
    startNewGame();
  }
});

pauseButton.addEventListener("click", () => {
  ensureAudio();
  if (state.mode === "running") {
    setPauseMode(true);
  } else if (state.mode === "paused" && state.runningAction) {
    state.runningAction();
  }
});

function boot() {
  syncHud();
  showOverlay(
    "Neon Brick Breaker",
    "Smash every layer, stack combos, and survive all three arenas.",
    "Start Run",
    () => startNewGame()
  );

  state.mode = "menu";
  lastTick = performance.now();
  requestAnimationFrame(frame);
}

loadAll(images)
  .then(() => {
    boot();
  })
  .catch(() => {
    showOverlay("Asset Error", "One or more game assets failed to load.", "Retry", () => {
      window.location.reload();
    });
  });
