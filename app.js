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
function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

/* =========================
   STATE
========================= */
let phase = "loading"; // loading -> title -> lockout -> ready -> shuffling -> guessing
let lockTimer = null;

let score = 0;
let busy = false;
let canGuess = false;

/* ladder (internal terms ok) */
let stageShells = 3;      // 3..7
let stageWins = 0;        // wins within current stage
let totalWinsThisRun = 0;
let difficultyTier = 0;   // bumps each time 7->3 reset happens

/* theme */
let themeIndex = 0;

/* shells layout */
let shellCount = 3;
let shells = [];
let slots = [];
let slotPerc = [];
let pearlUnderShellId = 0;

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

function recomputeSlots(){
  slotPerc = computeSlotPercents(shellCount);
}

/* =========================
   LADDER: 2-2-2-1-1
========================= */
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
  if (stageWins < need) return { changed:false, didReset:false };

  stageWins = 0;

  if (stageShells === 7){
    stageShells = 3;
    themeIndex = (themeIndex + 1) % THEMES.length;
    difficultyTier++;
    return { changed:true, didReset:true };
  } else {
    stageShells++;
    return { changed:true, didReset:false };
  }
}

/* =========================
   DIFFICULTY
========================= */
function difficultyFromProgress(totalWins, shellsNow, tier){
  const t = Math.min(1, totalWins / 40);
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

/* =========================
   ART APPLY
========================= */
function applyArt(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
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

  applyArt();

  if (pearlUnderShellId >= shellCount) pearlUnderShellId = 0;
  placePearlUnderShell(pearlUnderShellId);
}

function placePearlUnderShell(shellId){
  const slotIndex = slots[shellId];
  pearl.style.left = `${slotPerc[slotIndex]}%`;
}

/* =========================
   ROUND FLOW
========================= */
function pickPearlForRound(){
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
}

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

async function shuffle(){
  const d = difficultyFromProgress(totalWinsThisRun, shellCount, difficultyTier);

  busy = true;
  canGuess = false;
  phase = "shuffling";
  setMessage("Shuffling…");

  try{
    for (let k = 0; k < d.swaps; k++){
      let a = rndInt(shellCount);
      let b = rndInt(shellCount);
      while (b === a) b = rndInt(shellCount);

      await animateSwap(a, b, d.duration);

      if (Math.random() < d.pauseChance) await sleep(rndInt(d.pauseExtraMax));
      else await sleep(rndInt(55));
    }
  } finally {
    busy = false;
    canGuess = true;
    phase = "guessing";
    setMessage("Pick a shell.");
  }
}

async function startRound(){
  if (busy || canGuess) return;

  if (shellCount !== stageShells){
    buildShells(stageShells);
  } else {
    applyArt();
    recomputeSlots();
    shells.forEach((_, shellId) => {
      shells[shellId].style.left = `${slotPerc[slots[shellId]]}%`;
    });
  }

  pickPearlForRound();

  setMessage(`Watch the pearl… (${stageShells} shells)`);
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await shuffle();
}

/* =========================
   GUESS
========================= */
async function handleGuess(shellId){
  if (phase !== "guessing") return;
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;

  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();

    totalWinsThisRun++;
    stageWins++;

    const result = advanceStageIfReady();

    // in-game wording (no win/level/stage language)
    if (result.didReset){
      setMessage("Shift. Intensity rises.");
    } else if (result.changed){
      setMessage(`Shift. ${stageShells} shells.`);
    } else {
      setMessage("Locked.");
    }

    await sleep(850);
    hidePearl();

    /* ✅ FIX #1 (THEME POP ISSUE)
       If we hit the 7 -> 3 reset, the themeIndex has already advanced.
       We rebuild shells NOW (while still in this post-correct pause),
       so the next theme is already visible BEFORE the player taps.
    */
    if (result.didReset){
      buildShells(stageShells); // stageShells is now 3
      hidePearl();              // hard guarantee: pearl not visible between rounds
    } else if (result.changed){
      // for shell-count changes, pre-build too so the new layout is visible immediately
      buildShells(stageShells);
      hidePearl();
    } else {
      // no rebuild needed; keep current shell layout, just ensure art is correct
      applyArt();
    }

    busy = false;
    phase = "ready";
    setMessage("Tap anywhere for next round");
  } else {
    setMessage("Wrong — Game Over");
    overlay.classList.add("flash");
    await sleep(520);
    overlay.classList.remove("flash");
    await sleep(250);
    resetGame();
  }
}

/* =========================
   TAP ANYWHERE
========================= */
function onGlobalTap(){
  if (phase === "loading") return;
  if (phase === "shuffling" || phase === "guessing") return;

  if (phase === "title"){
    hideScreen(titleScreen);
    hideGameUnderScreens(false);

    phase = "lockout";
    setMessage("Get ready…");

    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (phase !== "lockout") return;
      phase = "ready";
      setMessage("Tap anywhere to start");
    }, POST_TITLE_LOCK_MS);

    return;
  }

  if (phase === "lockout") return;

  if (phase === "ready"){
    startRound();
  }
}
document.addEventListener("pointerdown", onGlobalTap, { passive:true });

/* =========================
   RESET / BOOT
========================= */
function resetGame(){
  busy = false;
  canGuess = false;

  score = 0;
  totalWinsThisRun = 0;

  stageShells = 3;
  stageWins = 0;

  themeIndex = 0;
  difficultyTier = 0;

  refreshHUD();
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