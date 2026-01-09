/* =========================
   LOCKED / APPROVED BASE
========================= */
const SHOW_TITLE_CTA_OVERLAY = true;
const LOADING_HOLD_MS = 5200;
const FADE_MS = 550;
const POST_TITLE_LOCK_MS = 3000;

/* =========================
   ASSETS
========================= */
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

const THEME_ACCENTS = {
  ivory:  "#EDE8DA",
  coral:  "#FF8B7A",
  green:  "#6DFFB3",
  gray:   "#BFC7D3",
  purple: "#C9A6FF",
  blue:   "#8BC7FF",
  red:    "#FF6B6B"
};

const THEMES = [
  { key:"ivory"  },
  { key:"coral"  },
  { key:"green"  },
  { key:"gray"   },
  { key:"purple" },
  { key:"blue"   },
  { key:"red"    }
];

/* =========================
   DOM
========================= */
const board         = document.getElementById("board");
const shellLayer    = document.getElementById("shellLayer");
const pearl         = document.getElementById("pearl");
const msg           = document.getElementById("msg");
const scoreLine     = document.getElementById("scoreLine");
const overlay       = document.getElementById("overlay");
const btnReset      = document.getElementById("btnReset");

const loadingScreen = document.getElementById("loadingScreen");
const titleScreen   = document.getElementById("titleScreen");
const titleCta      = document.querySelector(".pressStart");

const lifeSlow   = document.getElementById("lifeSlow");
const lifeShield = document.getElementById("lifeShield");
const lifeFifty  = document.getElementById("lifeFifty");
const lifeReveal = document.getElementById("lifeReveal");

const dotsSlow   = document.getElementById("dotsSlow");
const dotsShield = document.getElementById("dotsShield");
const dotsFifty  = document.getElementById("dotsFifty");
const dotsReveal = document.getElementById("dotsReveal");

/* =========================
   HELPERS
========================= */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rndInt = (n) => Math.floor(Math.random() * n);

function showScreen(el){
  el.classList.remove("fadeOut");
  el.classList.add("show");
}
async function hideScreen(el){
  el.classList.add("fadeOut");
  await sleep(FADE_MS);
  el.classList.remove("show");
  el.classList.remove("fadeOut");
}

function hideGameUnderScreens(shouldHide){
  shellLayer.style.visibility = shouldHide ? "hidden" : "visible";
  pearl.style.visibility = shouldHide ? "hidden" : "visible";
}

function setMessage(t){ msg.textContent = t; }
function refreshHUD(){ scoreLine.textContent = `Score: ${score}`; }

function showPearl(pulse=false){
  pearl.style.opacity = "1";
  if (pulse){
    pearl.classList.remove("revealPulse");
    void pearl.offsetWidth;
    pearl.classList.add("revealPulse");
  }
}
function hidePearl(){
  pearl.style.opacity = "0";
  pearl.classList.remove("revealPulse");
}

/* =========================
   STATE MACHINE
========================= */
let phase = "loading";
let lockTimer = null;
let resolveBusy = false;

let score = 0;

let stageShells = 3;
let stageClears = 0;
let totalClearsThisRun = 0;
let difficultyTier = 0;

let themeIndex = 0;

let shellCount = 3;
let shells = [];
let slots = [];
let slotPerc = [];
let pearlUnderShellId = 0;

/* lifelines */
const LIFE_MAX = 3;
let life = { slow:1, shield:1, fifty:0, reveal:0 };

let slowArmed = false;
let slowActive = false;

let fiftyActive = false;
let fiftyChoices = null;

/* =========================
   LAYOUT
========================= */
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

/* =========================
   LADDER: 2-2-2-1-1 (CLEARS)
========================= */
function clearsNeededForStage(s){
  if (s === 3) return 2;
  if (s === 4) return 2;
  if (s === 5) return 2;
  if (s === 6) return 1;
  if (s === 7) return 1;
  return 2;
}

function advanceStageIfReady(){
  const need = clearsNeededForStage(stageShells);
  if (stageClears < need) return { changed:false, didReset:false };

  stageClears = 0;

  if (stageShells === 7){
    stageShells = 3;
    themeIndex = (themeIndex + 1) % THEMES.length;
    difficultyTier++; // IMPORTANT: tier increments on reset
    return { changed:true, didReset:true };
  } else {
    stageShells++;
    return { changed:true, didReset:false };
  }
}

/* =========================
   DIFFICULTY
========================= */
function difficultyFromProgress(totalClears, shellsNow, tier){
  const t = Math.min(1, totalClears / 40);
  const ease = t * t * (3 - 2 * t);

  const baseSwaps = 6 + (shellsNow - 3) * 2;
  const tierBumpSwaps = Math.min(8, tier * 1.0);
  const swaps = Math.round(baseSwaps + ease * 8 + tierBumpSwaps);

  let duration = Math.round(
    270 - ease * 120 - (shellsNow - 3) * 12 - tier * 8
  );
  duration = Math.max(95, duration);

  const pauseChance = Math.min(0.30, 0.10 + ease * 0.10);
  const pauseExtraMax = Math.round(70 + ease * 140);

  return { swaps, duration, pauseChance, pauseExtraMax };
}

function applySlowToDifficulty(d){
  return {
    swaps: d.swaps,
    duration: Math.round(d.duration * 2.6),
    pauseChance: Math.min(0.45, d.pauseChance + 0.12),
    pauseExtraMax: Math.round(d.pauseExtraMax * 2.2)
  };
}

/* =========================
   THEME APPLY
========================= */
function applyTheme(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;

  const accent = THEME_ACCENTS[th.key] || "#e8e8ef";
  board.style.setProperty("--accent", accent);
}

/* =========================
   LIFELINES UI
========================= */
function renderDots(container, count){
  container.innerHTML = "";
  for (let i=0; i<LIFE_MAX; i++){
    const d = document.createElement("span");
    d.className = "dot" + (i < count ? " on" : "");
    container.appendChild(d);
  }
}

function syncLifelinesUI(){
  renderDots(dotsSlow, life.slow);
  renderDots(dotsShield, life.shield);
  renderDots(dotsFifty, life.fifty);
  renderDots(dotsReveal, life.reveal);

  lifeSlow.disabled   = (life.slow <= 0);
  lifeShield.disabled = (life.shield <= 0);
  lifeFifty.disabled  = (life.fifty <= 0);
  lifeReveal.disabled = (life.reveal <= 0);

  lifeSlow.classList.toggle("armed", slowArmed);
}

/* ✅ UPDATED RULE:
   - Only award on 7->3 reset
   - Reveal is delayed: NOT awarded on the first reset.
   - (Meaning: Reveal begins awarding from the 2nd reset onward) */
function awardExtrasOnResetOnly(currentTier){
  life.slow   = Math.min(LIFE_MAX, life.slow + 1);
  life.shield = Math.min(LIFE_MAX, life.shield + 1);
  life.fifty  = Math.min(LIFE_MAX, life.fifty + 1);

  // Delay Reveal: currentTier is 1 on the first reset, 2 on second, etc.
  if (currentTier >= 2){
    life.reveal = Math.min(LIFE_MAX, life.reveal + 1);
  }

  syncLifelinesUI();
}

/* =========================
   BUILD SHELLS
========================= */
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

    d.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleGuess(shellId);
    }, { passive:false });

    shells.push(d);
    shellLayer.appendChild(d);
  }

  applyTheme();

  if (pearlUnderShellId >= shellCount) pearlUnderShellId = 0;
  placePearlUnderShell(pearlUnderShellId);

  clearFiftyState();
}

function placePearlUnderShell(shellId){
  const slotIndex = slots[shellId];
  pearl.style.left = `${slotPerc[slotIndex]}%`;
}

function pickPearlForRound(){
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
}

/* =========================
   50/50 VISUALS
========================= */
function clearFiftyState(){
  fiftyActive = false;
  fiftyChoices = null;
  shells.forEach(s => {
    s.classList.remove("dim");
    s.classList.remove("choice");
  });
}

function applyFiftyVisuals(){
  if (!fiftyActive || !fiftyChoices) return;
  shells.forEach((s, id) => {
    if (fiftyChoices.has(id)){
      s.classList.add("choice");
      s.classList.remove("dim");
    } else {
      s.classList.add("dim");
      s.classList.remove("choice");
    }
  });
}

/* =========================
   ANIMATION
========================= */
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

  await sleep(Math.max(90, duration * 0.55));
  shells[a].classList.remove("lift");
  shells[b].classList.remove("lift");
  await sleep(Math.max(90, duration * 0.55));
}

/* =========================
   ROUND FLOW
========================= */
async function runShuffle(){
  phase = "shuffle";

  let d = difficultyFromProgress(totalClearsThisRun, shellCount, difficultyTier);
  if (slowActive) d = applySlowToDifficulty(d);

  setMessage(slowActive ? "Shuffling (SLOW)..." : "Shuffling…");

  for (let k = 0; k < d.swaps; k++){
    let a = rndInt(shellCount);
    let b = rndInt(shellCount);
    while (b === a) b = rndInt(shellCount);

    await animateSwap(a, b, d.duration);

    if (Math.random() < d.pauseChance) await sleep(rndInt(d.pauseExtraMax));
    else await sleep(rndInt(55));
  }

  slowActive = false;
}

async function runRound(){
  if (resolveBusy) return;

  phase = "reveal";
  clearFiftyState();

  slowActive = slowArmed;
  slowArmed = false;
  syncLifelinesUI();

  pickPearlForRound();

  setMessage(`Watch the pearl… (Level: ${stageShells} shells)`);
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await runShuffle();

  phase = "guess";
  setMessage("Pick a shell.");
}

/* =========================
   RESOLVE GATE
========================= */
async function resolveSequence({ wasCorrect, usedShieldSave, stageEventText }){
  resolveBusy = true;
  phase = "resolve";

  placePearlUnderShell(pearlUnderShellId);
  showPearl(true);

  if (usedShieldSave){
    setMessage("Shield saved you. Keep going.");
  } else if (wasCorrect){
    setMessage(stageEventText || "Correct.");
  } else {
    setMessage("Wrong — Game Over");
  }

  await sleep(950);

  hidePearl();
  await sleep(140);

  if (wasCorrect || usedShieldSave){
    prepareNextLayoutIfNeeded();
    phase = "ready";
    setMessage("Tap anywhere for next round");
  } else {
    overlay.classList.add("flash");
    await sleep(420);
    overlay.classList.remove("flash");
    await sleep(180);
    resetGame();
  }

  resolveBusy = false;
}

/* =========================
   PREP NEXT LAYOUT
========================= */
function prepareNextLayoutIfNeeded(){
  if (shellCount !== stageShells){
    buildShells(stageShells);
  } else {
    applyTheme();
    recomputeSlots();
    shells.forEach((_, id) => {
      shells[id].style.left = `${slotPerc[slots[id]]}%`;
    });
  }
}

/* =========================
   GUESS
========================= */
async function handleGuess(shellId){
  if (resolveBusy) return;
  if (phase !== "guess") return;

  if (fiftyActive && fiftyChoices && !fiftyChoices.has(shellId)) return;

  phase = "resolve";

  const correct = (shellId === pearlUnderShellId);

  clearFiftyState();

  // Shield auto-save on wrong
  if (!correct && life.shield > 0){
    life.shield--;
    syncLifelinesUI();
    await resolveSequence({ wasCorrect:false, usedShieldSave:true, stageEventText:"" });
    return;
  }

  if (!correct){
    await resolveSequence({ wasCorrect:false, usedShieldSave:false, stageEventText:"" });
    return;
  }

  // Correct
  score += 10;
  refreshHUD();

  totalClearsThisRun++;
  stageClears++;

  const result = advanceStageIfReady();

  let stageText = "Correct.";

  if (result.didReset){
    // ✅ award only on reset, and reveal is delayed now
    awardExtrasOnResetOnly(difficultyTier);

    stageText = "Stage cleared. Theme advanced.";
  } else if (result.changed){
    stageText = `Level up. Now ${stageShells} shells.`;
  }

  if (result.didReset){
    applyTheme();
  }

  prepareNextLayoutIfNeeded();

  await resolveSequence({ wasCorrect:true, usedShieldSave:false, stageEventText:stageText });
}

/* =========================
   LIFELINES
========================= */
lifeSlow.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  if (life.slow <= 0) return;
  if (resolveBusy) return;

  if (phase === "ready"){
    life.slow--;
    slowArmed = true;
    syncLifelinesUI();
    setMessage("Slow armed for next round.");
    return;
  }

  if (phase === "shuffle"){
    life.slow--;
    slowActive = true;
    syncLifelinesUI();
    setMessage("Slow activated.");
    return;
  }
});

lifeShield.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  if (life.shield <= 0) return;
  if (resolveBusy) return;
  setMessage("Shield is automatic on a wrong pick.");
});

lifeFifty.addEventListener("pointerdown", (e) => {
  e.preventDefault(); e.stopPropagation();
  if (life.fifty <= 0) return;
  if (resolveBusy) return;
  if (phase !== "guess") return;

  life.fifty--;

  let other = rndInt(shellCount);
  while (other === pearlUnderShellId) other = rndInt(shellCount);

  fiftyActive = true;
  fiftyChoices = new Set([pearlUnderShellId, other]);
  applyFiftyVisuals();

  syncLifelinesUI();
  setMessage("50/50 active: choose between the lit shells.");
});

lifeReveal.addEventListener("pointerdown", async (e) => {
  e.preventDefault(); e.stopPropagation();
  if (life.reveal <= 0) return;
  if (resolveBusy) return;
  if (phase !== "guess") return;

  life.reveal--;
  syncLifelinesUI();

  placePearlUnderShell(pearlUnderShellId);
  showPearl(true);
  setMessage("Revealed.");
  await sleep(650);
  hidePearl();

  applyFiftyVisuals();
  setMessage("Pick a shell.");
});

/* =========================
   TAP ANYWHERE
========================= */
async function onGlobalTap(){
  if (phase === "loading") return;
  if (resolveBusy) return;
  if (phase === "shuffle" || phase === "guess" || phase === "reveal") return;

  if (phase === "title"){
    hideScreen(titleScreen);
    hideGameUnderScreens(false);

    phase = "lockout";
    setMessage("Get ready…");

    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (phase !== "lockout") return;
      prepareNextLayoutIfNeeded();
      phase = "ready";
      setMessage("Tap anywhere to start");
    }, POST_TITLE_LOCK_MS);

    return;
  }

  if (phase === "lockout") return;

  if (phase === "ready"){
    prepareNextLayoutIfNeeded();
    await runRound();
  }
}
document.addEventListener("pointerdown", onGlobalTap, { passive:true });

/* =========================
   RESET / BOOT
========================= */
function resetGame(){
  resolveBusy = false;

  score = 0;
  refreshHUD();

  stageShells = 3;
  stageClears = 0;
  totalClearsThisRun = 0;
  difficultyTier = 0;

  themeIndex = 0;

  life = { slow:1, shield:1, fifty:0, reveal:0 };
  slowArmed = false;
  slowActive = false;
  clearFiftyState();
  syncLifelinesUI();

  hidePearl();
  boot();
}

async function boot(){
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;

  if (titleCta) titleCta.style.display = SHOW_TITLE_CTA_OVERLAY ? "block" : "none";

  buildShells(3);
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
  hidePearl();

  applyTheme();
  syncLifelinesUI();

  hideGameUnderScreens(true);
  setMessage("");
  phase = "loading";

  showScreen(loadingScreen);
  await sleep(FADE_MS);
  await sleep(LOADING_HOLD_MS);

  await hideScreen(loadingScreen);
  showScreen(titleScreen);
  await sleep(FADE_MS);

  phase = "title";
}

btnReset.addEventListener("click", (e) => {
  e.stopPropagation();
  resetGame();
});

boot();