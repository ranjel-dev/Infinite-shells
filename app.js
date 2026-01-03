/* =========================
   Infinite Shells — app.js (FULL)
   Updates:
   - Smooth fades between Loading <-> Title (no abrupt cut)
   - Longer loading hold
   - 3s "safety lock" after dismissing title (prevents accidental start)
   - Fix "Press anywhere" double: you can disable overlay CTA if the image includes it
========================= */

/* === SETTINGS YOU CAN ADJUST === */
const SHOW_TITLE_CTA_OVERLAY = true; // set FALSE if your title image already has "press anywhere" baked in
const LOADING_HOLD_MS = 1600;         // longer logo screen
const FADE_MS = 450;                  // must match CSS transition time
const POST_TITLE_LOCK_MS = 3000;      // 3 seconds: taps won't start the round

/* ---------- ASSETS (game) ---------- */
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
const board        = document.getElementById("board");
const shellLayer   = document.getElementById("shellLayer");
const pearl        = document.getElementById("pearl");
const msg          = document.getElementById("msg");
const scoreLine    = document.getElementById("scoreLine");
const overlay      = document.getElementById("overlay");
const recordText   = document.getElementById("recordText");
const btnReset     = document.getElementById("btnReset");

const loadingScreen = document.getElementById("loadingScreen");
const titleScreen   = document.getElementById("titleScreen");
const titleCta      = document.querySelector(".pressStart");

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rndInt = (n) => Math.floor(Math.random() * n);

/* ---------- Screen helpers ---------- */
function showScreen(el){
  el.classList.add("show");
}
function hideScreen(el){
  el.classList.remove("show");
}

/* ---------- State ---------- */
let phase = "loading"; // loading -> title -> lockout -> ready -> shuffling/guessing

let score = 0;
let bestScore = Number(localStorage.getItem("infiniteShells_bestScore") || "0");
let recordShownThisRun = false;

let themeIndex = 0;
let totalWinsThisRun = 0;

let stageShells = 3; // 3..7
let stageWins = 0;
let difficultyTier = 0;

let shellCount = 3;
const MIN_SHELLS = 3;

let shells = [];
let slots = [];
let slotPerc = [];

let pearlUnderShellId = 0;
let canGuess = false;
let busy = false;

/* ---------- Layout ---------- */
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

/* ---------- UI ---------- */
function setMessage(t){ msg.textContent = t; }
function refreshHUD(){ scoreLine.textContent = `Score: ${score}`; }
function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

/* ---------- Build ---------- */
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

/* ---------- Shuffle ---------- */
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
    shells.forEach((_, shellId) => {
      shells[shellId].style.left = `${slotPerc[slots[shellId]]}%`;
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

/* ---------- Tap-anywhere ---------- */
function handleGlobalTap(){
  if (phase === "loading") return;

  if (phase === "title"){
    // fade title out
    hideScreen(titleScreen);
    phase = "lockout";
    setMessage("Get ready…");

    // safety lock so players don't accidentally start instantly
    setTimeout(() => {
      if (phase !== "lockout") return;
      setMessage("Tap anywhere to Start.");
      phase = "ready";
    }, POST_TITLE_LOCK_MS);

    return;
  }

  if (phase === "lockout"){
    // ignore taps
    return;
  }

  if (phase === "ready"){
    if (busy) return;
    if (canGuess) return;
    startRound();
  }
}

document.addEventListener("pointerdown", handleGlobalTap, { passive:true });

/* ---------- Guess ---------- */
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
    phase = "ready";
  } else {
    setMessage("Wrong — Game Over");
    overlay.classList.add("flash");
    await sleep(450);
    overlay.classList.remove("flash");
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

  boot();
}

/* ---------- Boot sequence ---------- */
async function boot(){
  // CTA overlay toggle (fixes “press anywhere twice”)
  if (titleCta) titleCta.style.display = SHOW_TITLE_CTA_OVERLAY ? "block" : "none";

  // Prepare game under screens
  buildShells(MIN_SHELLS);
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
  hidePearl();

  setMessage("");
  phase = "loading";

  // Show loading with fade-in
  showScreen(loadingScreen);
  hideScreen(titleScreen);

  await sleep(LOADING_HOLD_MS);

  // Crossfade: loading -> title
  hideScreen(loadingScreen);
  showScreen(titleScreen);

  // wait for fade to finish so taps aren't weird mid-fade
  await sleep(FADE_MS);

  phase = "title";
}

btnReset?.addEventListener("click", (e) => {
  e.stopPropagation();
  boot();
});

boot();