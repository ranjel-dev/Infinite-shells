/* =========================
   Infinite Shells — app.js (FULL)
   - Starts immediately on play screen (3 shells visible)
   - Tap anywhere ONLY when BETWEEN rounds:
       - not busy
       - not canGuess
   - During “Pick a shell.”, tap-anywhere does NOTHING (shell taps only)
   - Ladder progression:
       3 shells: 2 wins -> 4
       4 shells: 2 wins -> 5
       5 shells: 2 wins -> 6
       6 shells: 1 win  -> 7
       7 shells: 1 win  -> reset to 3 + theme advances
   - Each time you clear 7 shells, next cycle is slightly harder (difficultyTier++)
========================= */

/* ---------- ASSETS ---------- */
const ASSETS = {
  ball: "https://i.imgur.com/kLGt0DN.png",
  shells: {
    ivory:  "https://i.imgur.com/plbX02y.png",
    coral:  "https://i.imgur.com/eo5doV1.png",
    green:  "https://i.imgur.com/OHGwmzW.png",
    gray:   "https://i.imgur.com/bNUWfLU.png",
    purple: "https://i.imgur.com/xypjVlk.png",
    blue:   "https://i.imgur.com/cJeZGFc.png",
    red:    "https://i.imgur.com/eJI6atV.png"
  }
};

/* ---------- THEMES (flat solids) ---------- */
const THEMES = [
  { key:"ivory",  bg:"#0F2F1F" },
  { key:"coral",  bg:"#0E3A44" },
  { key:"green",  bg:"#2B1240" },
  { key:"gray",   bg:"#1C2736" },
  { key:"purple", bg:"#3A0E1A" },
  { key:"blue",   bg:"#3A260F" },
  { key:"red",    bg:"#0A1224" }
];

/* ---------- DOM ---------- */
const board      = document.getElementById("board");
const shellLayer = document.getElementById("shellLayer");
const pearl      = document.getElementById("pearl");
const msg        = document.getElementById("msg");
const scoreLine  = document.getElementById("scoreLine");
const overlay    = document.getElementById("overlay");
const recordText = document.getElementById("recordText");
const btnReset   = document.getElementById("btnReset");

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rndInt = (n) => Math.floor(Math.random() * n);

/* ---------- State ---------- */
let score = 0;
let bestScore = Number(localStorage.getItem("infiniteShells_bestScore") || "0");
let recordShownThisRun = false;

let themeIndex = 0;
let totalWinsThisRun = 0;

// Ladder tracking
let stageShells = 3; // 3..7
let stageWins = 0;
let difficultyTier = 0;

let shellCount = 3;
const MIN_SHELLS = 3;
const MAX_SHELLS = 7;

let shells = [];
let slots = [];
let slotPerc = [];

let pearlUnderShellId = 0;
let canGuess = false;
let busy = false;

/* ---------- Slots / Layout ---------- */
function computeSlotPercents(n){
  const leftMargin =
    (n >= 7) ? 8 :
    (n === 6) ? 12 :
    (n === 5) ? 15 :
    (n === 4) ? 20 : 25;

  const span = 100 - leftMargin * 2;
  const step = span / (n - 1);
  return Array.from({ length:n }, (_, i) => leftMargin + i * step);
}
function recomputeSlots(){ slotPerc = computeSlotPercents(shellCount); }

/* ---------- Ladder rules ---------- */
function winsNeededForStage(s){
  if (s === 3) return 2;
  if (s === 4) return 2;
  if (s === 5) return 2;
  if (s === 6) return 1;
  if (s === 7) return 1;
  return 2;
}
function advanceStageIfReady(){
  const need = winsNeededForStage(stageShells);
  if (stageWins < need) return;

  stageWins = 0;

  if (stageShells === 7){
    themeIndex = (themeIndex + 1) % THEMES.length;
    difficultyTier++;
    stageShells = 3;
  } else {
    stageShells++;
  }
}

/* ---------- Difficulty ---------- */
function difficultyFromProgress(totalWins, shellsNow, tier){
  const t = Math.min(1, totalWins / 40);
  const ease = t * t * (3 - 2 * t);
  const late = Math.max(0, (totalWins - 18) / 22);

  const baseSwaps = 5 + (shellsNow - 3) * 2;
  const tierBump = Math.min(10, tier * 1.2);

  const swaps = Math.round(baseSwaps + ease * 8 + late * 10 + tierBump);

  let duration = Math.round(
    320 - ease * 150 - late * 90 - (shellsNow - 3) * 10 - tier * 6
  );
  duration = Math.max(80, duration);

  const pauseChance = Math.min(0.35, 0.06 + ease * 0.14 + late * 0.18);
  const pauseExtraMax = Math.round(60 + ease * 140 + late * 240);

  return { swaps, duration, pauseChance, pauseExtraMax };
}

/* ---------- Theme ---------- */
function applyTheme(){
  const th = THEMES[themeIndex % THEMES.length];
  board.style.background = th.bg;

  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);

  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
}

/* ---------- UI helpers ---------- */
function setMessage(t){ msg.textContent = t; }
function refreshHUD(){ scoreLine.textContent = `Score: ${score}`; }
function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

/* ---------- Build / Place ---------- */
function buildShells(n){
  shellLayer.innerHTML = "";
  shells = [];
  slots = [];

  shellCount = n;
  recomputeSlots();

  for (let shellId = 0; shellId < shellCount; shellId++){
    const d = document.createElement("div");
    d.className = "shell";

    slots[shellId] = shellId;
    d.style.left = `${slotPerc[slots[shellId]]}%`;

    // Stop shell clicks from triggering “tap anywhere”
    d.addEventListener("click", (e) => {
      e.stopPropagation();
      handleGuess(shellId);
    });

    shells.push(d);
    shellLayer.appendChild(d);
  }

  applyTheme();

  if (pearlUnderShellId >= shellCount) pearlUnderShellId = 0;
  placePearlUnderShell(pearlUnderShellId);
}

function placePearlUnderShell(shellId){
  const slotIndex = slots[shellId];
  pearl.style.left = `${slotPerc[slotIndex]}%`;
}

/* ---------- Pearl selection ---------- */
function pickPearlForRound(){
  let next = rndInt(shellCount);
  if (shellCount > 1 && next === pearlUnderShellId){
    next = (next + 1 + rndInt(shellCount - 1)) % shellCount;
  }
  pearlUnderShellId = next;
  placePearlUnderShell(pearlUnderShellId);
}

/* ---------- Shuffle animation ---------- */
async function animateSwap(a, b, duration){
  shells[a].classList.add("lift");
  shells[b].classList.add("lift");

  const tmp = slots[a];
  slots[a] = slots[b];
  slots[b] = tmp;

  shells[a].style.transitionDuration = `${duration}ms`;
  shells[b].style.transitionDuration = `${duration}ms`;

  shells[a].style.left = `${slotPerc[slots[a]]}%`;
  shells[b].style.left = `${slotPerc[slots[b]]}%`;

  await sleep(Math.max(60, duration * 0.55));

  shells[a].classList.remove("lift");
  shells[b].classList.remove("lift");

  await sleep(Math.max(60, duration * 0.55));
}

async function shuffle(){
  const d = difficultyFromProgress(totalWinsThisRun, shellCount, difficultyTier);

  busy = true;
  canGuess = false;
  setMessage("Shuffling…");

  for (let k = 0; k < d.swaps; k++){
    let a = rndInt(shellCount);
    let b = rndInt(shellCount);
    while (b === a) b = rndInt(shellCount);

    await animateSwap(a, b, d.duration);

    if (Math.random() < d.pauseChance) await sleep(rndInt(d.pauseExtraMax));
    else await sleep(rndInt(45));
  }

  busy = false;
  canGuess = true;
  setMessage("Pick a shell.");
}

/* ---------- Round flow ---------- */
async function startRound(){
  if (busy) return;

  const desiredShells = stageShells;

  if (desiredShells !== shellCount) {
    buildShells(desiredShells);
  } else {
    applyTheme();
    recomputeSlots();
    shells.forEach((s, shellId) => {
      s.style.left = `${slotPerc[slots[shellId]]}%`;
    });
  }

  pickPearlForRound();

  setMessage("Watch the ball…");
  showPearl();
  await sleep(650);
  hidePearl();
  await sleep(120);

  await shuffle();
}

/* ---------- Tap-anywhere gating ---------- */
function requestStartFromTap(){
  // Only start when BETWEEN rounds
  if (busy) return;
  if (canGuess) return;
  startRound();
}

// Tap anywhere on the screen to start / next round
document.addEventListener("pointerdown", requestStartFromTap, { passive:true });

/* ---------- Guess handling ---------- */
async function handleGuess(shellId){
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;

  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();

    if (score > bestScore && !recordShownThisRun){
      bestScore = score;
      localStorage.setItem("infiniteShells_bestScore", String(bestScore));
      recordShownThisRun = true;
      recordText.classList.add("show");
      setTimeout(() => recordText.classList.remove("show"), 1500);
    }

    totalWinsThisRun++;
    stageWins++;

    const wasSeven = (stageShells === 7);
    advanceStageIfReady();
    const didReset = (wasSeven && stageShells === 3);

    setMessage(didReset ? "Stage cleared! Theme advanced." : "Correct!");

    await sleep(750);
    hidePearl();

    busy = false;
    setMessage("Tap anywhere for Next Round");
  } else {
    setMessage("Wrong — Game Over");
    overlay.classList.add("flash");
    board.classList.add("shake");

    await sleep(450);

    overlay.classList.remove("flash");
    board.classList.remove("shake");

    await sleep(350);

    resetGame();
  }
}

/* ---------- Reset ---------- */
function resetGame(){
  busy = false;
  canGuess = false;

  score = 0;
  totalWinsThisRun = 0;

  stageShells = 3;
  stageWins = 0;
  difficultyTier = 0;

  themeIndex = 0;
  recordShownThisRun = false;

  refreshHUD();
  hidePearl();

  // Straight to play screen with 3 shells visible
  setMessage("Tap anywhere to Start.");
  buildShells(MIN_SHELLS);

  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
}

/* ---------- Reset button ---------- */
btnReset?.addEventListener("click", (e) => {
  e.stopPropagation(); // don’t also start a round
  resetGame();
});

/* ---------- Init ---------- */
resetGame();
