const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const levelText = document.getElementById("levelText");
const scoreText = document.getElementById("scoreText");
const progressText = document.getElementById("progressText");
const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const finalScoreText = document.getElementById("finalScoreText");
const finalLevelText = document.getElementById("finalLevelText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const muteButton = document.getElementById("muteButton");
const highScoreList = document.getElementById("highScoreList");
const bossStatus = document.getElementById("bossStatus");
const pauseScreen = document.getElementById("pauseScreen");

const bossImage = typeof Image !== "undefined" ? new Image() : null;
let bossImageReady = false;
if (bossImage) {
  bossImage.onload = () => {
    bossImageReady = true;
  };
  bossImage.onerror = () => {
    bossImageReady = false;
  };
  bossImage.src = "./assets/boss-game.png";
}

const WORLD = { width: canvas.width, height: canvas.height };
const PLAYER_SIZE = 34;
const CUBE_SIZE = 32;
const BASE_TARGET = 5;
const HIGH_SCORE_KEY = "snakeDashHighScores";
const BOSS_START_LEVEL = 10;
const BOSS_DEFEAT_LEVEL = 25;
const BOSS_SIGN_SIZE = 30;

const keys = new Set();
let audioContext;
let musicGain;
let musicTimer;
let musicStep = 0;
let muted = false;
let player;
let cubes;
let boss;
let bossSigns;
let particles;
let score;
let eatenThisLevel;
let nextLevelTarget;
let elapsed;
let spawnTimer;
let bossShootTimer;
let bossMessageTimer;
let lastFrame;
let running = false;
let gameOver = false;
let paused = false;
let bossActive = false;
let bossDefeated = false;

function resetGame() {
  player = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    level: 1,
    speed: 250,
    pulse: 0
  };
  cubes = [];
  boss = null;
  bossSigns = [];
  particles = [];
  score = 0;
  eatenThisLevel = 0;
  nextLevelTarget = BASE_TARGET;
  elapsed = 0;
  spawnTimer = 0;
  bossShootTimer = 0;
  bossMessageTimer = 0;
  lastFrame = performance.now();
  gameOver = false;
  paused = false;
  bossActive = false;
  bossDefeated = false;
  bossStatus.classList.remove("show");
  pauseScreen.classList.remove("show");
  updateHud();

  for (let i = 0; i < 14; i += 1) {
    spawnCube();
  }
}

function startGame() {
  ensureAudio();
  startBackgroundMusic();
  resetGame();
  running = true;
  paused = false;
  startScreen.classList.remove("show");
  pauseScreen.classList.remove("show");
  gameOverScreen.classList.remove("show");
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  gameOver = true;
  paused = false;
  bossStatus.classList.remove("show");
  pauseScreen.classList.remove("show");
  stopBackgroundMusic();
  saveHighScores(score);
  renderHighScores();
  playTone(90, 0.35, "sawtooth", 0.08);
  finalScoreText.textContent = `Score ${score}`;
  finalLevelText.textContent = `You reached Level ${player.level}.`;
  gameOverScreen.classList.add("show");
}

// The animation loop uses delta time so movement remains smooth on different screens.
function loop(now) {
  if (!running) return;

  if (paused) {
    lastFrame = now;
    requestAnimationFrame(loop);
    return;
  }

  const dt = Math.min((now - lastFrame) / 1000, 0.033);
  lastFrame = now;
  elapsed += dt;
  spawnTimer += dt;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function togglePause() {
  if (!running || gameOver) return;

  paused = !paused;
  pauseScreen.classList.toggle("show", paused);

  if (paused) {
    stopBackgroundMusic();
  } else {
    startBackgroundMusic();
    lastFrame = performance.now();
  }
}

function update(dt) {
  const difficultySpeed = 1 + elapsed * 0.012;
  player.speed = 250 + player.level * 16 + elapsed * 3;
  player.pulse += dt * 8;

  const direction = getMoveDirection();
  player.x += direction.x * player.speed * dt;
  player.y += direction.y * player.speed * dt;
  player.x = clamp(player.x, PLAYER_SIZE / 2, WORLD.width - PLAYER_SIZE / 2);
  player.y = clamp(player.y, PLAYER_SIZE / 2, WORLD.height - PLAYER_SIZE / 2);

  cubes.forEach((cube) => {
    cube.x += cube.vx * dt * difficultySpeed;
    cube.y += cube.vy * dt * difficultySpeed;

    if (cube.x < CUBE_SIZE / 2 || cube.x > WORLD.width - CUBE_SIZE / 2) cube.vx *= -1;
    if (cube.y < CUBE_SIZE / 2 || cube.y > WORLD.height - CUBE_SIZE / 2) cube.vy *= -1;

    cube.x = clamp(cube.x, CUBE_SIZE / 2, WORLD.width - CUBE_SIZE / 2);
    cube.y = clamp(cube.y, CUBE_SIZE / 2, WORLD.height - CUBE_SIZE / 2);
  });

  if (!bossActive && !bossDefeated && player.level >= BOSS_START_LEVEL) {
    startBossBattle();
  }

  if (bossActive) {
    updateBossBehaviour(dt);
  }

  if (bossMessageTimer > 0) {
    bossMessageTimer = Math.max(0, bossMessageTimer - dt);
  }

  const spawnInterval = bossActive
    ? Math.max(1.15, 1.85 - elapsed * 0.002)
    : Math.max(0.38, 1.1 - player.level * 0.05 - elapsed * 0.006);
  const maxCubes = bossActive ? 12 : 24 + player.level * 2;

  if (spawnTimer > spawnInterval) {
    spawnTimer = 0;
    if (cubes.length < maxCubes) spawnCube();
  }

  checkCollisions();
  updateParticles(dt);
}

function getMoveDirection() {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) y += 1;

  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function checkCollisions() {
  for (let i = cubes.length - 1; i >= 0; i -= 1) {
    const cube = cubes[i];
    const distance = Math.hypot(player.x - cube.x, player.y - cube.y);

    if (distance < (PLAYER_SIZE + CUBE_SIZE) / 2 - 3) {
      if (cube.level > player.level) {
        endGame();
        return;
      }

      eatCube(cube);
      cubes.splice(i, 1);
      if (!bossActive || Math.random() < 0.45) {
        spawnCube();
      }
    }
  }

  checkBossSignCollisions();
}

// Level progression ramps the target slightly so each level takes a little more focus.
function eatCube(cube) {
  const points = cube.level === player.level ? 20 : 10 + cube.level * 3;
  score += points;
  eatenThisLevel += 1;
  player.pulse = 0;
  playTone(cube.level === player.level ? 520 : 430, 0.08, "triangle", 0.045);
  burst(cube.x, cube.y, cube.level > player.level ? "#fb5a5f" : cube.level === player.level ? "#f8cf4b" : "#36d982");

  if (eatenThisLevel >= nextLevelTarget) {
    changePlayerLevel(1);
    eatenThisLevel = 0;
    playTone(780, 0.16, "square", 0.04);
    burst(player.x, player.y, "#6bb8ff", 26);
  }

  updateHud();
}

function changePlayerLevel(amount) {
  player.level = Math.max(1, player.level + amount);
  nextLevelTarget = BASE_TARGET + Math.floor(player.level * 1.6);
}

function spawnCube() {
  const margin = 52;
  let x = random(margin, WORLD.width - margin);
  let y = random(margin, WORLD.height - margin);

  for (let attempts = 0; attempts < 20 && Math.hypot(player.x - x, player.y - y) < 150; attempts += 1) {
    x = random(margin, WORLD.width - margin);
    y = random(margin, WORLD.height - margin);
  }

  cubes.push({
    x,
    y,
    level: chooseCubeLevel(),
    vx: random(-38, 38),
    vy: random(-38, 38)
  });
}

function chooseCubeLevel() {
  const roll = Math.random();
  const maxLevel = player.level + 3;

  if (roll < Math.max(0.2, 0.48 - player.level * 0.025)) {
    return Math.max(1, player.level - Math.ceil(Math.random() * 2));
  }

  if (roll < 0.72) {
    return player.level;
  }

  const dangerRange = Math.min(maxLevel, player.level + 1 + Math.floor(Math.random() * 3));
  return dangerRange;
}

function updateParticles(dt) {
  particles = particles.filter((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.size *= 0.985;
    return particle.life > 0;
  });
}

function startBackgroundMusic() {
  if (!audioContext || musicTimer) return;

  musicGain = audioContext.createGain();
  musicGain.gain.setValueAtTime(muted ? 0 : 0.065, audioContext.currentTime);
  musicGain.connect(audioContext.destination);

  const bassNotes = [130.81, 130.81, 196, 164.81, 130.81, 220, 196, 164.81];
  musicTimer = window.setInterval(() => {
    const note = bassNotes[musicStep % bassNotes.length];
    playMusicNote(note, 0.11, "square", musicStep % 4 === 0 ? 0.85 : 0.55);
    if (musicStep % 2 === 1) playMusicNote(note * 2, 0.07, "triangle", 0.28);
    musicStep += 1;
  }, 140);
}

function stopBackgroundMusic() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }

  if (musicGain) {
    musicGain.disconnect();
    musicGain = null;
  }
}

function toggleMute() {
  muted = !muted;
  muteButton.textContent = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-pressed", String(muted));

  if (musicGain && audioContext) {
    musicGain.gain.setTargetAtTime(muted ? 0 : 0.065, audioContext.currentTime, 0.03);
  }
}

function playMusicNote(frequency, duration, type, volumeScale) {
  if (!audioContext || !musicGain) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.98, now + duration);
  gain.gain.setValueAtTime(0.09 * volumeScale, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gain);
  gain.connect(musicGain);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function getHighScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(HIGH_SCORE_KEY)) || [];
    return saved.filter(Number.isFinite).slice(0, 3);
  } catch (error) {
    return [];
  }
}

function saveHighScores(newScore) {
  const highScores = [...getHighScores(), newScore]
    .sort((a, b) => b - a)
    .slice(0, 3);

  try {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(highScores));
  } catch (error) {
    // Private browsing or locked-down storage should not break a run.
  }
}

function renderHighScores() {
  const highScores = getHighScores();
  highScoreList.innerHTML = "";

  for (let i = 0; i < 3; i += 1) {
    const item = document.createElement("li");
    item.textContent = highScores[i] || 0;
    highScoreList.appendChild(item);
  }
}

function startBossBattle() {
  bossActive = true;
  boss = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    size: 96,
    pulse: 0
  };
  bossSigns = [];
  bossShootTimer = 0.55;
  bossStatus.classList.add("show");
  playTone(150, 0.22, "sawtooth", 0.07);
  burst(boss.x, boss.y, "#b576ff", 34);
}

// The boss is a pressure phase: signs drift out from center, plus signs help more often
// than minus signs hurt, and normal cube spawning slows down so dodging stays readable.
function updateBossBehaviour(dt) {
  boss.pulse += dt * 5;
  bossShootTimer -= dt;

  if (bossShootTimer <= 0) {
    spawnBossSign();
    bossShootTimer = random(0.62, 1.05);
  }

  bossSigns = bossSigns.filter((sign) => {
    sign.x += sign.vx * dt;
    sign.y += sign.vy * dt;
    sign.life -= dt;
    return sign.life > 0 && sign.x > -50 && sign.x < WORLD.width + 50 && sign.y > -50 && sign.y < WORLD.height + 50;
  });

  if (player.level >= BOSS_DEFEAT_LEVEL) {
    endBossBattle();
  }
}

function spawnBossSign() {
  const isPositive = Math.random() < 0.64;
  const angle = random(0, Math.PI * 2);
  const distance = random(110, 250);
  let x = boss.x + Math.cos(angle) * distance;
  let y = boss.y + Math.sin(angle) * distance;

  x = clamp(x, 48, WORLD.width - 48);
  y = clamp(y, 48, WORLD.height - 48);

  for (let attempts = 0; attempts < 16 && Math.hypot(player.x - x, player.y - y) < 120; attempts += 1) {
    const retryAngle = random(0, Math.PI * 2);
    x = clamp(boss.x + Math.cos(retryAngle) * random(140, 280), 48, WORLD.width - 48);
    y = clamp(boss.y + Math.sin(retryAngle) * random(140, 280), 48, WORLD.height - 48);
  }

  const driftAngle = Math.atan2(y - boss.y, x - boss.x) + random(-0.55, 0.55);
  const speed = random(34, 82);
  bossSigns.push({
    x,
    y,
    vx: Math.cos(driftAngle) * speed,
    vy: Math.sin(driftAngle) * speed,
    type: isPositive ? "plus" : "minus",
    life: random(4.8, 6.8),
    spin: random(-2, 2)
  });
}

function checkBossSignCollisions() {
  if (!bossActive) return;

  for (let i = bossSigns.length - 1; i >= 0; i -= 1) {
    const sign = bossSigns[i];
    const distance = Math.hypot(player.x - sign.x, player.y - sign.y);

    if (distance < (PLAYER_SIZE + BOSS_SIGN_SIZE) / 2) {
      if (sign.type === "plus") {
        changePlayerLevel(1);
        score += 90;
        playTone(660, 0.1, "triangle", 0.05);
        burst(sign.x, sign.y, "#36d982", 18);
      } else {
        changePlayerLevel(-1);
        playTone(180, 0.12, "sawtooth", 0.04);
        burst(sign.x, sign.y, "#fb5a5f", 12);
      }

      eatenThisLevel = 0;
      bossSigns.splice(i, 1);
      updateHud();
    }
  }
}

function endBossBattle() {
  bossActive = false;
  bossDefeated = true;
  boss = null;
  bossSigns = [];
  bossMessageTimer = 2.2;
  bossStatus.classList.remove("show");
  score += 500;
  playTone(920, 0.22, "square", 0.05);
  burst(WORLD.width / 2, WORLD.height / 2, "#b576ff", 48);
  updateHud();
}

function burst(x, y, color, count = 16) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = random(80, 220);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(0.25, 0.55),
      size: random(3, 7),
      color
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  drawGrid();
  particles.forEach(drawParticle);
  if (bossActive && boss) drawBoss();
  bossSigns.forEach(drawBossSign);
  cubes.forEach(drawCube);
  drawPlayer();
  drawBossMessage();
}

function drawGrid() {
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 1;

  for (let x = 0; x < WORLD.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.height);
    ctx.stroke();
  }

  for (let y = 0; y < WORLD.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.width, y);
    ctx.stroke();
  }
}

function drawCube(cube) {
  const color = cube.level < player.level ? "#36d982" : cube.level === player.level ? "#f8cf4b" : "#fb5a5f";
  const x = cube.x - CUBE_SIZE / 2;
  const y = cube.y - CUBE_SIZE / 2;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = cube.level > player.level ? 16 : 8;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, CUBE_SIZE, CUBE_SIZE);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
  ctx.strokeRect(x + 1, y + 1, CUBE_SIZE - 2, CUBE_SIZE - 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = cube.level > player.level ? "#fff7f7" : "#07111d";
  ctx.font = "800 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cube.level, cube.x, cube.y + 1);
  ctx.restore();
}

function drawPlayer() {
  const pulse = 1 + Math.sin(player.pulse) * 0.04;
  const size = PLAYER_SIZE * pulse;
  const x = player.x - size / 2;
  const y = player.y - size / 2;

  ctx.save();
  ctx.shadowColor = "#6bb8ff";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#6bb8ff";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "#d9efff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#06111d";
  ctx.font = "800 19px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(player.level, player.x, player.y + 1);
  ctx.restore();
}

function drawBoss() {
  const pulse = 1 + Math.sin(boss.pulse) * 0.06;
  const size = boss.size * pulse;
  const x = boss.x - size / 2;
  const y = boss.y - size / 2;

  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.rotate(Math.sin(boss.pulse * 0.55) * 0.12);
  ctx.shadowColor = "#b576ff";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#11141d";
  ctx.fillRect(-size / 2, -size / 2, size, size);

  if (bossImageReady && bossImage && bossImage.naturalWidth > 0) {
    try {
      ctx.drawImage(bossImage, -size / 2, -size / 2, size, size);
    } catch (error) {
      drawFallbackBoss(size);
    }
  } else {
    drawFallbackBoss(size);
  }

  ctx.strokeStyle = "#f3ddff";
  ctx.lineWidth = 5;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(181, 118, 255, 0.28)";
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 10, y - 10, size + 20, size + 20);
  ctx.restore();
}

function drawFallbackBoss(size) {
  ctx.fillStyle = "#7e3ff2";
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.fillStyle = "#f7ecff";
  ctx.font = "900 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BOSS", 0, -3);
  ctx.font = "800 15px system-ui, sans-serif";
  ctx.fillText("LV 25", 0, 23);
}

function drawBossSign(sign) {
  const color = sign.type === "plus" ? "#36d982" : "#fb5a5f";
  const symbol = sign.type === "plus" ? "+" : "-";

  ctx.save();
  ctx.translate(sign.x, sign.y);
  ctx.rotate(sign.spin * (elapsed % 10));
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillRect(-BOSS_SIGN_SIZE / 2, -BOSS_SIGN_SIZE / 2, BOSS_SIGN_SIZE, BOSS_SIGN_SIZE);
  ctx.shadowBlur = 0;
  ctx.fillStyle = sign.type === "plus" ? "#06140d" : "#fff7f7";
  ctx.font = "900 27px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, 0, sign.type === "plus" ? 0 : -2);
  ctx.restore();
}

function drawBossMessage() {
  if (bossMessageTimer <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, bossMessageTimer);
  ctx.fillStyle = "#f7ecff";
  ctx.font = "900 44px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#b576ff";
  ctx.shadowBlur = 22;
  ctx.fillText("Boss Defeated!", WORLD.width / 2, WORLD.height * 0.22);
  ctx.restore();
}

function drawParticle(particle) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, particle.life * 2);
  ctx.fillStyle = particle.color;
  ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
  ctx.restore();
}

function updateHud() {
  levelText.textContent = player.level;
  scoreText.textContent = score;
  progressText.textContent = `${eatenThisLevel} / ${nextLevelTarget}`;
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playTone(frequency, duration, type, volume) {
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.65), now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }

  if (event.code === "Space") {
    event.preventDefault();
    if (running && !gameOver) {
      togglePause();
    } else {
      startGame();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
muteButton.addEventListener("click", toggleMute);

renderHighScores();
resetGame();
draw();
