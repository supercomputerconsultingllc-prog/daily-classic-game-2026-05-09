const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const keys = new Set();
let playerScore = 0;
let cpuScore = 0;

const player = { x: 20, y: 164, w: 12, h: 72, speed: 5 };
const cpu = { x: WIDTH - 32, y: 164, w: 12, h: 72, speed: 3.5 };
const ball = { x: WIDTH / 2, y: HEIGHT / 2, r: 8, vx: 4, vy: 2.5 };

const images = {
  court: new Image(),
  player: new Image(),
  cpu: new Image(),
  ball: new Image()
};

images.court.src = "assets/court.svg";
images.player.src = "assets/paddle-player.svg";
images.cpu.src = "assets/paddle-cpu.svg";
images.ball.src = "assets/ball.svg";

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

function resetBall(direction) {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.vx = 4 * direction;
  ball.vy = (Math.random() * 2 - 1) * 3;
}

function intersects(paddle) {
  return (
    ball.x - ball.r < paddle.x + paddle.w &&
    ball.x + ball.r > paddle.x &&
    ball.y - ball.r < paddle.y + paddle.h &&
    ball.y + ball.r > paddle.y
  );
}

function update() {
  if (keys.has("ArrowUp")) {
    player.y -= player.speed;
  }
  if (keys.has("ArrowDown")) {
    player.y += player.speed;
  }
  player.y = clamp(player.y, 0, HEIGHT - player.h);

  const cpuTarget = ball.y - cpu.h / 2;
  if (cpu.y < cpuTarget) cpu.y += cpu.speed;
  if (cpu.y > cpuTarget) cpu.y -= cpu.speed;
  cpu.y = clamp(cpu.y, 0, HEIGHT - cpu.h);

  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.y - ball.r <= 0 || ball.y + ball.r >= HEIGHT) {
    ball.vy *= -1;
    ball.y = clamp(ball.y, ball.r, HEIGHT - ball.r);
  }

  if (intersects(player) && ball.vx < 0) {
    ball.vx *= -1;
    ball.vy += ((ball.y - (player.y + player.h / 2)) / (player.h / 2)) * 1.2;
  }

  if (intersects(cpu) && ball.vx > 0) {
    ball.vx *= -1;
    ball.vy += ((ball.y - (cpu.y + cpu.h / 2)) / (cpu.h / 2)) * 1.2;
  }

  if (ball.x + ball.r < 0) {
    cpuScore += 1;
    resetBall(1);
  }

  if (ball.x - ball.r > WIDTH) {
    playerScore += 1;
    resetBall(-1);
  }
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(images.court, 0, 0, WIDTH, HEIGHT);
  ctx.drawImage(images.player, player.x, player.y, player.w, player.h);
  ctx.drawImage(images.cpu, cpu.x, cpu.y, cpu.w, cpu.h);
  ctx.drawImage(images.ball, ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);

  ctx.fillStyle = "#efefef";
  ctx.font = "24px monospace";
  ctx.fillText(String(playerScore), WIDTH * 0.25, 34);
  ctx.fillText(String(cpuScore), WIDTH * 0.75, 34);
}

function frame() {
  update();
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    keys.add(event.key);
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    keys.delete(event.key);
    event.preventDefault();
  }
});

loadAll(images).then(() => {
  resetBall(Math.random() > 0.5 ? 1 : -1);
  frame();
});
