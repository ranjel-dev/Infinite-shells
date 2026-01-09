/* app.js */
/* =========================
   LOCKED / APPROVED BASE
========================= */
const SHOW_TITLE_CTA_OVERLAY = true;
const LOADING_HOLD_MS = 5200;
const FADE_MS = 550;
const POST_TITLE_LOCK_MS = 3000;

/* =========================
   TIMING (Resolve Gate)
========================= */
const WATCH_SHOW_MS = 900;        // pearl visible before shuffle
const WATCH_HIDE_GAP_MS = 160;    // gap after pearl hides
const REVEAL_HOLD_MS = 900;       // after a guess, pearl stays visible
const POST_RESOLVE_BUFFER_MS = 300; // prevents accidental fast chaining

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
  { key:"ivory",  accent:"#E8DCC2" },
  { key:"coral",  accent:"#FF6B6B" },
  { key:"green",  accent:"#4EE29A" },
  { key:"gray",   accent:"#BFC7D5" },
  { key:"purple", accent:"#B57CFF" },
  { key:"blue",   accent:"#6BB7FF" },
  { key:"red",    accent:"#FF4A4A" }
];

/* =========================
   DOM
========================= */
const board        = document.getElementById("board");
const shellLayer   = document.getElementById("shellLayer");
const pearl        = document.getElementById("pearl");
const msg          = document.getElementById("msg");
const scoreLine    = document.getElementById("scoreLine");
const overlay      = document.getElementById("overlay");
const btnReset     = document.getElementById("btnReset");

const loadingScreen = document.getElementById("loadingScreen");
const titleScreen   = document.getElementById("titleScreen");
const titleCta      = document.querySelector(".pressStart");

/* lifelines */
const lifeSlow   = document.getElementById("lifeSlow");
const lifeShield = document.getElementById("lifeShield");
const lifeFifty  = document.getElementById("lifeFifty");
const lifeReveal = document.getElementById("lifeReveal");

const pipsSlow   = document.getElementById("pipsSlow");
const pipsShield = document.getElementById("pipsShield");
const pipsFifty  = document.getElementById("pipsFifty");
const pipsReveal = document.getElementById("pipsReveal");

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
  if (pulse){
    pearl.classList.remove("revealPulse");
    // force reflow so the animation can retrigger
    void pearl.offsetWidth;
    pearl.classList.add("revealPulse");
  }
  pearl.style.opacity = "1";
}
function hidePearl(){
  pearl.style.opacity = "0";
  pearl.classList.remove("revealPulse");
}

/* =========================
   STATE MACHINE
========================= */
/*
  loading -> title -> lockout -> ready -> watch -> shuffling -> guessing -> resolve -> ready
  (gameOver handled inside resolve if no shield)
*/
let phase = "loading";
let lockTimer = null;

let score = 0;
let busy = false;     // guards against overlapping async
let canGuess = false; // only true in guessing

/* progression ladder 2-2-2-1-1 (internal terms only) */
let stageShells = 3;       // 3..7
let stageWins = 0;         // wins inside stage
let totalWinsThisRun = 0;  // ramps shuffle
let difficultyTier = 0;    // increases each 7->3 reset
let themeIndex = 0;

/* shells */
let shellCount = 3;
let shells = [];
let slots = [];
let slotPerc = [];
let pearlUnderShellId = 0;

/* lifelines (max 3 each) */
const LIFE_MAX = 3;
let life = {
  slow: 1,
  shield: 1,
  fifty: 0,
  reveal: 0
};

let slowArmed = false;       // pressed before round start
let slowActiveThisRound = false;

let fiftyActive = false;
let fiftyLitSet = new Set();

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
    // reset cycle
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

  let duration = Math.round(270 - ease * 120 - (shellsNow - 3) * 12 - tier * 8);
  duration = Math.max(95, duration);

  const pauseChance = Math.min(0.30, 0.10 + ease * 0.10);
  const pauseExtraMax = Math.round(70 + ease * 140);

  return { swaps, duration, pauseChance, pauseExtraMax };
}

/* =========================
   THEME / ART
========================= */
function applyThemeVars(){
  const th = THEMES[themeIndex % THEMES.length];
  board.style.setProperty("--themeAccent", th.accent);
}

function applyArt(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
  applyThemeVars();
  refreshLifelinesUI();
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
  clearFiftyVisuals();
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

function consumeLife(key){
  if (life[key] <= 0) return false;
  life[key] = Math.max(0, life[key] - 1);
  refreshLifelinesUI();
  return true;
}

function awardOnCycleResetOnly(){
  // Only when 7 -> 3 happens
  life.slow   = Math.min(LIFE_MAX, life.slow + 1);
  life.shield = Math.min(LIFE_MAX, life.shield + 1);
  life.fifty  = Math.min(LIFE_MAX, life.fifty + 1);
  life.reveal = Math.min(LIFE_MAX, life.reveal + 1);
  refreshLifelinesUI();
}

/* =========================
   LIFELINES UI + LOGIC
========================= */
function renderPips(el, count){
  el.innerHTML = "";
  for (let i = 0; i < LIFE_MAX; i++){
    const dot = document.createElement("span");
    dot.className = "pipDot" + (i < count ? " on" : "");
    el.appendChild(dot);
  }
}

function refreshLifelinesUI(){
  renderPips(pipsSlow,   life.slow);
  renderPips(pipsShield, life.shield);
  renderPips(pipsFifty,  life.fifty);
  renderPips(pipsReveal, life.reveal);

  // enable/disable buttons based on phase
  const inReady = (phase === "ready");
  const inGuess = (phase === "guessing");
  const inPlayable = inReady || inGuess;

  // Slow: only usable before round starts (ready). Can be "armed"
  setBtnState(lifeSlow, inReady && life.slow > 0, slowArmed);

  // Shield: passive, but still show if you have it
  setBtnState(lifeShield, false, false);
  lifeShield.classList.toggle("disabled", life.shield <= 0);

  // 50/50 + Reveal: only during guessing
  setBtnState(lifeFifty, inGuess && life.fifty > 0 && !fiftyActive, false);
  setBtnState(lifeReveal, inGuess && life.reveal > 0, false);

  // hide lifelines during loading/title screens visually via opacity
  const shouldShow = (phase !== "loading" && phase !== "title");
  document.getElementById("lifelines").style.opacity = shouldShow ? "1" : "0";
  document.getElementById("lifelines").style.pointerEvents = shouldShow ? "auto" : "none";
}

function setBtnState(btn, enabled, armed){
  btn.classList.toggle("disabled", !enabled);
  btn.disabled = !enabled;
  btn.classList.toggle("armed", !!armed);
}

function clearFiftyVisuals(){
  fiftyActive = false;
  fiftyLitSet.clear();
  shells.forEach(s => {
    s.classList.remove("dim");
    s.classList.remove("lit");
    s.style.pointerEvents = "";
  });
}

function applyFiftyVisuals(){
  shells.forEach((s, id) => {
    const lit = fiftyLitSet.has(id);
    s.classList.toggle("lit", lit);
    s.classList.toggle("dim", !lit);
    // enforce only 2 choices
    s.style.pointerEvents = lit ? "auto" : "none";
  });
}

lifeSlow.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (phase !== "ready") return;

  if (life.slow <= 0) return;

  // arm for next round
  slowArmed = !slowArmed;
  refreshLifelinesUI();
  setMessage(slowArmed ? "Slow armed for next round." : "Slow disarmed.");
}, { passive:false });

lifeFifty.addEventListener("pointerdown", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (phase !== "guessing" || busy || !canGuess) return;
  if (life.fifty <= 0) return;

  if (!consumeLife("fifty")) return;

  // pick correct + one decoy
  const correct = pearlUnderShellId;
  let decoy = rndInt(shellCount);
  while (decoy === correct) decoy = rndInt(shellCount);

  fiftyActive = true;
  fiftyLitSet = new Set([correct, decoy]);
  applyFiftyVisuals();
  setMessage("50/50 active: choose between the two lit shells.");
}, { passive:false });

lifeReveal.addEventListener("pointerdown", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (phase !== "guessing" || busy || !canGuess) return;
  if (life.reveal <= 0) return;

  if (!consumeLife("reveal")) return;

  // show the correct pearl briefly, then return to guessing
  busy = true;
  canGuess = false;

  placePearlUnderShell(pearlUnderShellId);
  showPearl(true);
  setMessage("Reveal!");

  await sleep(650);
  hidePearl();
  await sleep(120);

  busy = false;
  canGuess = true;
  setMessage("Pick a shell.");
}, { passive:false });

/* =========================
   SHUFFLE + START ROUND
========================= */
async function shuffle(){
  const base = difficultyFromProgress(totalWinsThisRun, shellCount, difficultyTier);

  // Slow must be meaningfully slower than half
  // We apply a strong multiplier to swap duration + pauses.
  const slowMult = slowActiveThisRound ? 0.35 : 1.0;

  const d = {
    swaps: base.swaps,
    duration: Math.round(base.duration / slowMult), // slower = larger duration
    pauseChance: base.pauseChance,
    pauseExtraMax: Math.round(base.pauseExtraMax / slowMult)
  };

  busy = true;
  canGuess = false;
  phase = "shuffling";
  refreshLifelinesUI();
  setMessage(slowActiveThisRound ? "Shuffling (Slowed)..." : "Shuffling…");

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
    slowActiveThisRound = false; // ends with shuffle
    refreshLifelinesUI();
    setMessage("Pick a shell.");
  }
}

function prepareNextRoundLayout(){
  // This is the fix for “theme/shells pop only after tap”.
  // We ALWAYS pre-apply shell count + theme as soon as we enter ready.
  if (shellCount !== stageShells){
    buildShells(stageShells);
  } else {
    applyArt();
    recomputeSlots();
    shells.forEach((_, shellId) => {
      shells[shellId].style.left = `${slotPerc[slots[shellId]]}%`;
    });
    clearFiftyVisuals();
  }
}

async function startRound(){
  if (busy || canGuess) return;
  if (phase !== "ready") return;

  phase = "watch";
  refreshLifelinesUI();

  // clear any old 50/50 restriction at round start
  clearFiftyVisuals();

  // apply layout already prepared, but ensure correct just in case
  prepareNextRoundLayout();

  // if slow was armed, consume NOW and activate for this round's shuffle
  slowActiveThisRound = false;
  if (slowArmed && life.slow > 0){
    consumeLife("slow");
    slowActiveThisRound = true;
    slowArmed = false;
  }
  refreshLifelinesUI();

  pickPearlForRound();

  setMessage(`Watch the pearl…`);
  showPearl();
  await sleep(WATCH_SHOW_MS);
  hidePearl();
  await sleep(WATCH_HIDE_GAP_MS);

  await shuffle();
}

/* =========================
   RESOLVE GATE (NO SKIPPING)
========================= */
async function resolveCorrect(){
  // resolve gate: nothing can advance until this finishes
  phase = "resolve";
  busy = true;
  canGuess = false;
  refreshLifelinesUI();

  // always reveal pearl (guaranteed)
  placePearlUnderShell(pearlUnderShellId);
  showPearl(true);

  await sleep(REVEAL_HOLD_MS);

  hidePearl();

  // progression
  score += 10;
  refreshHUD();

  totalWinsThisRun++;
  stageWins++;

  const step = advanceStageIfReady();

  if (step.didReset){
    awardOnCycleResetOnly(); // ONLY award here (7 -> 3)
    setMessage("Cycle cleared.");
  } else if (step.changed){
    setMessage("Level up.");
  } else {
    setMessage("Correct.");
  }

  // IMPORTANT: pre-apply next layout/theme BEFORE player taps
  prepareNextRoundLayout();

  await sleep(POST_RESOLVE_BUFFER_MS);

  busy = false;
  phase = "ready";
  refreshLifelinesUI();
  setMessage("Tap anywhere for next round");
}

async function resolveWrong(shellId){
  phase = "resolve";
  busy = true;
  canGuess = false;
  refreshLifelinesUI();

  // reveal correct pearl (always)
  placePearlUnderShell(pearlUnderShellId);
  showPearl(true);

  await sleep(REVEAL_HOLD_MS);

  // shield check
  if (life.shield > 0){
    consumeLife("shield");

    hidePearl();
    clearFiftyVisuals();

    setMessage("Shield saved you.");
    await sleep(POST_RESOLVE_BUFFER_MS);

    // do NOT advance stage on wrong guess
    busy = false;
    phase = "ready";
    refreshLifelinesUI();
    setMessage("Tap anywhere for next round");
    return;
  }

  // no shield -> game over flow
  hidePearl();
  setMessage("Wrong — Game Over");
  overlay.classList.add("flash");
  await sleep(520);
  overlay.classList.remove("flash");
  await sleep(250);

  resetGame();
}

async function handleGuess(shellId){
  if (phase !== "guessing") return;
  if (!canGuess || busy) return;

  // if 50/50 is active, only lit shells can be clicked anyway (others have pointer-events none)
  canGuess = false;
  busy = true;

  // once player guesses, clear 50/50 visuals for future rounds
  const correct = (shellId === pearlUnderShellId);
  clearFiftyVisuals();

  busy = false; // resolve functions manage their own busy gate
  if (correct) await resolveCorrect();
  else await resolveWrong(shellId);
}

/* =========================
   TAP ANYWHERE
========================= */
function onGlobalTap(){
  if (phase === "loading") return;
  if (phase === "shuffling" || phase === "guessing" || phase === "resolve" || phase === "watch") return;

  if (phase === "title"){
    hideScreen(titleScreen);
    hideGameUnderScreens(false);

    phase = "lockout";
    refreshLifelinesUI();
    setMessage("Get ready…");

    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (phase !== "lockout") return;
      phase = "ready";
      prepareNextRoundLayout();   // pre-apply immediately
      refreshLifelinesUI();
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
function fullResetState(){
  score = 0;
  totalWinsThisRun = 0;

  stageShells = 3;
  stageWins = 0;

  themeIndex = 0;
  difficultyTier = 0;

  slowArmed = false;
  slowActiveThisRound = false;

  clearFiftyVisuals();

  life = { slow:1, shield:1, fifty:0, reveal:0 };

  refreshHUD();
  refreshLifelinesUI();
}

function resetGame(){
  busy = false;
  canGuess = false;
  phase = "loading";
  fullResetState();
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
  refreshLifelinesUI();

  showScreen(loadingScreen);
  await sleep(FADE_MS);
  await sleep(LOADING_HOLD_MS);

  await hideScreen(loadingScreen);
  showScreen(titleScreen);
  await sleep(FADE_MS);

  phase = "title";
  refreshLifelinesUI();
}

btnReset.addEventListener("click", (e) => {
  e.stopPropagation();
  resetGame();
});

boot();