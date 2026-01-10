/* =========================
   LOCKED / APPROVED BASE
========================= */
const SHOW_TITLE_CTA_OVERLAY = true;
const LOADING_HOLD_MS = 5200;
const FADE_MS = 550;
const POST_TITLE_LOCK_MS = 3000;

/* resolve gate (prevents “skipping”) */
const RESOLVE_MIN_SHOW_MS = 650;
const RESOLVE_EXTRA_MS = 250;

/* lifelines */
const MAX_CHARGES = 3;
const SLOW_FACTOR = 2.35;
const REVEAL_FLASH_MS = 420;

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

const lifeSlow   = document.getElementById("lifeSlow");
const lifeShield = document.getElementById("lifeShield"); // static div
const lifeFifty  = document.getElementById("lifeFifty");
const lifeReveal = document.getElementById("lifeReveal");

const retryModal = document.getElementById("retryModal");
const btnRetry   = document.getElementById("btnRetry");
const btnToTitle = document.getElementById("btnToTitle");

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

function modalShow(){
  retryModal.classList.add("show");
  retryModal.setAttribute("aria-hidden", "false");
}
function modalHide(){
  retryModal.classList.remove("show");
  retryModal.setAttribute("aria-hidden", "true");
}

/* =========================
   STATE
========================= */
let phase = "loading"; // loading -> title -> lockout -> ready -> shuffling -> guessing -> resolving -> gameover
let lockTimer = null;

let score = 0;
let busy = false;
let canGuess = false;

/* ladder */
let stageShells = 3;
let stageWins = 0;
let totalWinsThisRun = 0;
let difficultyTier = 0;

/* theme */
let themeIndex = 0;

/* shells */
let shellCount = 3;
let shells = [];
let slots = [];
let slotPerc = [];
let pearlUnderShellId = 0;

/* lifelines */
const lifelines = {
  slow:   { unlocked:true,  charges:1, pending:false },
  shield: { unlocked:true,  charges:1 },
  fifty:  { unlocked:false, charges:0, active:false },
  reveal: { unlocked:false, charges:0 }
};

/* reset counter for unlock schedule */
let resetCount = 0;

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

function awardResetCharges(){
  resetCount++;

  for (const k of ["slow","shield","fifty","reveal"]){
    const L = lifelines[k];
    if (!L.unlocked) continue;
    L.charges = Math.min(MAX_CHARGES, L.charges + 1);
  }
  syncLifelineUI();
}

function maybeUnlockOnReset(){
  if (resetCount === 1 && !lifelines.fifty.unlocked){
    lifelines.fifty.unlocked = true;
    lifelines.fifty.charges = Math.min(MAX_CHARGES, Math.max(lifelines.fifty.charges, 1));
  }
  if (resetCount === 5 && !lifelines.reveal.unlocked){
    lifelines.reveal.unlocked = true;
    lifelines.reveal.charges = Math.min(MAX_CHARGES, Math.max(lifelines.reveal.charges, 1));
  }
  syncLifelineUI();
}

function advanceStageIfReady(){
  const need = winsNeededForStage(stageShells);
  if (stageWins < need) return { changed:false, didReset:false };

  stageWins = 0;

  if (stageShells === 7){
    stageShells = 3;
    themeIndex = (themeIndex + 1) % THEMES.length;
    difficultyTier++;

    awardResetCharges();
    maybeUnlockOnReset();

    return { changed:true, didReset:true };
  } else {
    stageShells++;
    return { changed:true, didReset:false };
  }
}

/* =========================
   DIFFICULTY (SLOWED EARLY GAME)
========================= */
function difficultyFromProgress(totalWins, shellsNow, tier){
  // slower start, still ramps later
  const t = Math.min(1, totalWins / 40);
  const ease = t * t * (3 - 2 * t);

  // was 6 at start; now 4 at start
  const baseSwaps = 4 + (shellsNow - 3) * 2;

  const tierBumpSwaps = Math.min(8, tier * 1.0);
  const swaps = Math.round(baseSwaps + ease * 7 + tierBumpSwaps);

  // was ~270 start; now ~330 start
  let duration = Math.round(
    330 - ease * 140 - (shellsNow - 3) * 10 - tier * 7
  );
  duration = Math.max(110, duration);

  const pauseChance = Math.min(0.28, 0.10 + ease * 0.10);
  const pauseExtraMax = Math.round(80 + ease * 170);

  return { swaps, duration, pauseChance, pauseExtraMax };
}

/* =========================
   ART APPLY
========================= */
function themeToStroke(key){
  const map = {
    ivory:  "rgba(245,245,245,0.92)",
    coral:  "rgba(255,190,180,0.92)",
    green:  "rgba(170,255,210,0.92)",
    gray:   "rgba(215,215,225,0.82)",
    purple: "rgba(210,190,255,0.92)",
    blue:   "rgba(180,220,255,0.92)",
    red:    "rgba(255,175,175,0.90)"
  };
  return map[key] || "rgba(255,255,255,0.85)";
}

function setLifelineStroke(color){
  const svgs = document.querySelectorAll("#lifelines svg");
  svgs.forEach(svg => svg.style.stroke = color);

  if (lifeFifty && !lifelines.fifty.unlocked){
    lifeFifty.querySelector("svg").style.stroke = "rgba(255,255,255,0.35)";
  }
  if (lifeReveal && !lifelines.reveal.unlocked){
    lifeReveal.querySelector("svg").style.stroke = "rgba(255,255,255,0.35)";
  }
}

function applyArt(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;

  setLifelineStroke(themeToStroke(th.key));
  syncLifelineUI();
}

/* =========================
   LIFELINE UI
========================= */
function setPips(el, n){
  if (!el) return;
  const pips = el.querySelectorAll(".pip");
  pips.forEach((p, i) => p.classList.toggle("on", i < n));
}

function syncLifelineUI(){
  if (lifeSlow){
    lifeSlow.classList.toggle("disabled", lifelines.slow.charges <= 0);
    setPips(lifeSlow, lifelines.slow.charges);
  }
  if (lifeShield){
    setPips(lifeShield, lifelines.shield.charges);
  }
  if (lifeFifty){
    lifeFifty.classList.toggle("locked", !lifelines.fifty.unlocked);
    lifeFifty.classList.toggle("disabled", !lifelines.fifty.unlocked || lifelines.fifty.charges <= 0);
    setPips(lifeFifty, lifelines.fifty.charges);
  }
  if (lifeReveal){
    lifeReveal.classList.toggle("locked", !lifelines.reveal.unlocked);
    lifeReveal.classList.toggle("disabled", !lifelines.reveal.unlocked || lifelines.reveal.charges <= 0);
    setPips(lifeReveal, lifelines.reveal.charges);
  }
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

function clearFiftyVisual(){
  shells.forEach(s => { s.classList.remove("dim"); s.classList.remove("hint"); });
  lifelines.fifty.active = false;
}

function syncStageVisualsNow(){
  if (shellCount !== stageShells){
    buildShells(stageShells);
  } else {
    applyArt();
    recomputeSlots();
    shells.forEach((_, shellId) => {
      shells[shellId].style.left = `${slotPerc[slots[shellId]]}%`;
    });
  }
}

async function shuffle(){
  const d0 = difficultyFromProgress(totalWinsThisRun, shellCount, difficultyTier);
  let d = { ...d0 };

  if (lifelines.slow.pending){
    d.duration = Math.round(d.duration * SLOW_FACTOR);
    lifelines.slow.pending = false;
    syncLifelineUI();
  }

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
      else await sleep(rndInt(60));
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
  if (phase !== "ready") return;

  clearFiftyVisual();
  syncStageVisualsNow();

  pickPearlForRound();

  setMessage(`Watch the pearl… (${stageShells} shells)`);
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await shuffle();
}

/* =========================
   LIFELINES
========================= */
function canUseSlow(){
  return lifelines.slow.unlocked && lifelines.slow.charges > 0 && phase === "ready" && !busy;
}
function useSlow(){
  if (!canUseSlow()) return;
  lifelines.slow.charges--;
  lifelines.slow.pending = true;
  setMessage("Slow armed for next round.");
  syncLifelineUI();
}

function canUseFifty(){
  return lifelines.fifty.unlocked && lifelines.fifty.charges > 0 && phase === "guessing" && !busy && canGuess && !lifelines.fifty.active;
}
function useFifty(){
  if (!canUseFifty()) return;
  lifelines.fifty.charges--;
  lifelines.fifty.active = true;

  const correct = pearlUnderShellId;
  let other = rndInt(shellCount);
  while (other === correct) other = rndInt(shellCount);

  shells.forEach((s, i) => {
    s.classList.remove("dim","hint");
    if (i === correct || i === other) s.classList.add("hint");
    else s.classList.add("dim");
  });

  setMessage("50/50 active.");
  syncLifelineUI();
}

function canUseReveal(){
  return lifelines.reveal.unlocked && lifelines.reveal.charges > 0 && phase === "guessing" && !busy && canGuess;
}
async function useReveal(){
  if (!canUseReveal()) return;
  lifelines.reveal.charges--;
  syncLifelineUI();

  placePearlUnderShell(pearlUnderShellId);
  showPearl();
  await sleep(REVEAL_FLASH_MS);
  hidePearl();
}

/* =========================
   GUESS (RESOLVE GATE)
========================= */
async function handleGuess(shellId){
  if (phase !== "guessing") return;
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;
  phase = "resolving";

  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();

    totalWinsThisRun++;
    stageWins++;

    const result = advanceStageIfReady();

    if (result.didReset){
      setMessage("Stage cleared! Reset to 3.");
    } else if (result.changed){
      setMessage(`Level up! Now ${stageShells} shells.`);
    } else {
      setMessage("Correct!");
    }

    await sleep(RESOLVE_MIN_SHOW_MS);
    hidePearl();

    // apply visuals immediately so nothing “pops in” after tap
    syncStageVisualsNow();

    await sleep(RESOLVE_EXTRA_MS);

    busy = false;
    phase = "ready";
    setMessage("Tap anywhere for next round");
    clearFiftyVisual();
    return;
  }

  // wrong
  if (lifelines.shield.unlocked && lifelines.shield.charges > 0){
    lifelines.shield.charges--;
    syncLifelineUI();

    setMessage("Wrong — Shield saved you.");
    overlay.classList.add("flash");
    await sleep(220);
    overlay.classList.remove("flash");

    await sleep(RESOLVE_MIN_SHOW_MS);
    hidePearl();

    await sleep(RESOLVE_EXTRA_MS);

    busy = false;
    phase = "ready";
    setMessage("Tap anywhere for next round");
    clearFiftyVisual();
    return;
  }

  setMessage("Wrong — Game Over");
  overlay.classList.add("flash");
  await sleep(380);
  overlay.classList.remove("flash");

  await sleep(RESOLVE_MIN_SHOW_MS);
  hidePearl();

  busy = false;
  canGuess = false;
  phase = "gameover";
  modalShow();
}

/* =========================
   TAP ANYWHERE
========================= */
function onGlobalTap(){
  if (busy) return;

  if (phase === "loading") return;
  if (phase === "shuffling" || phase === "guessing" || phase === "resolving" || phase === "gameover") return;

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
function resetRunState(){
  busy = false;
  canGuess = false;

  score = 0;
  totalWinsThisRun = 0;

  stageShells = 3;
  stageWins = 0;

  themeIndex = 0;
  difficultyTier = 0;

  resetCount = 0;

  lifelines.slow.unlocked = true;   lifelines.slow.charges = 1;  lifelines.slow.pending = false;
  lifelines.shield.unlocked = true; lifelines.shield.charges = 1;
  lifelines.fifty.unlocked = false; lifelines.fifty.charges = 0; lifelines.fifty.active = false;
  lifelines.reveal.unlocked = false; lifelines.reveal.charges = 0;

  refreshHUD();
  syncLifelineUI();
  clearFiftyVisual();
  hidePearl();
}

async function boot(){
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;

  modalHide();

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

function fullResetToTitle(){
  resetRunState();
  hideGameUnderScreens(true);
  setMessage("");
  phase = "title";
  showScreen(titleScreen);
}

btnReset.addEventListener("click", (e) => {
  e.stopPropagation();
  modalHide();
  resetRunState();
  boot();
});

/* =========================
   RETRY MODAL
========================= */
btnRetry.addEventListener("click", (e) => {
  e.stopPropagation();
  modalHide();
  resetRunState();
  hideGameUnderScreens(false);
  phase = "ready";
  setMessage("Tap anywhere to start");
  syncStageVisualsNow();
});

btnToTitle.addEventListener("click", (e) => {
  e.stopPropagation();
  modalHide();
  fullResetToTitle();
});

/* =========================
   LIFELINE EVENTS
========================= */
lifeSlow.addEventListener("click", (e) => { e.stopPropagation(); useSlow(); });
lifeFifty.addEventListener("click", (e) => { e.stopPropagation(); useFifty(); });
lifeReveal.addEventListener("click", async (e) => { e.stopPropagation(); await useReveal(); });

/* =========================
   START
========================= */
resetRunState();
syncStageVisualsNow();
boot();
