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
  { key:"ivory",  accent:"#EDE7D9" },
  { key:"coral",  accent:"#FFB199" },
  { key:"green",  accent:"#9CFFCE" },
  { key:"gray",   accent:"#C9D3E6" },
  { key:"purple", accent:"#E0B8FF" },
  { key:"blue",   accent:"#B9D7FF" },
  { key:"red",    accent:"#FFB6C6" }
];

/* =========================
   DOM
========================= */
const board          = document.getElementById("board");
const shellLayer     = document.getElementById("shellLayer");
const pearl          = document.getElementById("pearl");
const msg            = document.getElementById("msg");
const scoreLine      = document.getElementById("scoreLine");
const overlay        = document.getElementById("overlay");
const btnReset       = document.getElementById("btnReset");

const loadingScreen  = document.getElementById("loadingScreen");
const titleScreen    = document.getElementById("titleScreen");
const titleCta       = document.querySelector(".pressStart");

/* Lifelines */
const lifeSlow   = document.getElementById("lifeSlow");
const lifeShield = document.getElementById("lifeShield");
const life5050   = document.getElementById("life5050");
const lifeReveal = document.getElementById("lifeReveal");

const pipsSlow   = document.getElementById("pipsSlow");
const pipsShield = document.getElementById("pipsShield");
const pips5050   = document.getElementById("pips5050");
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
function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

function pulsePearl(){
  pearl.classList.remove("revealPulse");
  void pearl.offsetWidth; // restart animation
  pearl.classList.add("revealPulse");
}

/* =========================
   STATE
========================= */
let phase = "loading"; // loading -> title -> lockout -> ready -> shuffling -> guessing
let lockTimer = null;

let score = 0;
let busy = false;
let canGuess = false;

/* ladder */
let stageShells = 3;      // 3..7
let stageWins = 0;        // wins within current stage
let totalWinsThisRun = 0; // total correct guesses this run
let difficultyTier = 0;   // increments only on 7->3 reset

/* theme */
let themeIndex = 0;

/* shells layout */
let shellCount = 3;
let shells = [];
let slots = [];     // slots[shellId] = slotIndex
let slotPerc = [];  // percents
let pearlUnderShellId = 0;

/* Lifelines (charges) */
const MAX_CHARGES = 3;
let charges = {
  slow: 1,    // start with 1
  shield: 1,  // start with 1
  fifty: 0,
  reveal: 0
};

/* Lifelines (round flags) */
let slowArmedThisRound = false;
let fiftyAppliedThisRound = false;

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
    // reset to 3, theme changes, tier bumps
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
   DIFFICULTY (ramps)
========================= */
function difficultyFromProgress(totalWins, shellsNow, tier){
  // smooth ramp across first 40 wins
  const t = Math.min(1, totalWins / 40);
  const ease = t * t * (3 - 2 * t);

  const baseSwaps = 6 + (shellsNow - 3) * 2;
  const tierBumpSwaps = Math.min(8, tier * 1.0);
  const swaps = Math.round(baseSwaps + ease * 8 + tierBumpSwaps);

  // duration goes DOWN as it gets harder
  let duration = Math.round(
    270 - ease * 120 - (shellsNow - 3) * 12 - tier * 8
  );
  duration = Math.max(95, duration);

  const pauseChance = Math.min(0.30, 0.10 + ease * 0.10);
  const pauseExtraMax = Math.round(70 + ease * 140);

  return { swaps, duration, pauseChance, pauseExtraMax };
}

/* =========================
   THEME / ART APPLY
========================= */
function applyThemeVars(){
  const th = THEMES[themeIndex % THEMES.length];
  board.style.setProperty("--accent", th.accent);
}

function applyArt(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
  applyThemeVars();
}

/* =========================
   LIFELINE UI
========================= */
function clampCharges(){
  charges.slow   = Math.max(0, Math.min(MAX_CHARGES, charges.slow));
  charges.shield = Math.max(0, Math.min(MAX_CHARGES, charges.shield));
  charges.fifty  = Math.max(0, Math.min(MAX_CHARGES, charges.fifty));
  charges.reveal = Math.max(0, Math.min(MAX_CHARGES, charges.reveal));
}

function renderPips(el, onCount){
  el.innerHTML = "";
  for (let i = 0; i < MAX_CHARGES; i++){
    const d = document.createElement("span");
    d.className = "pip" + (i < onCount ? " on" : "");
    el.appendChild(d);
  }
}

function refreshLifelinesUI(){
  clampCharges();

  renderPips(pipsSlow, charges.slow);
  renderPips(pipsShield, charges.shield);
  renderPips(pips5050, charges.fifty);
  renderPips(pipsReveal, charges.reveal);

  // enable rules
  const inReady = (phase === "ready" && !busy);
  const inGuess = (phase === "guessing" && !busy);

  lifeSlow.disabled   = !(inReady && charges.slow > 0);
  // shield is passive, button just indicates/exists (no tap required)
  lifeShield.disabled = true;

  life5050.disabled   = !(inGuess && charges.fifty > 0 && !fiftyAppliedThisRound && shellCount >= 3);
  lifeReveal.disabled = !(inGuess && charges.reveal > 0);
}

/* =========================
   ONLY AWARD EXTRAS ON 7->3
========================= */
function awardResetBonusesOnly(){
  // ALWAYS +1 slow & +1 shield (up to max)
  charges.slow = Math.min(MAX_CHARGES, charges.slow + 1);
  charges.shield = Math.min(MAX_CHARGES, charges.shield + 1);

  // alternating bonus: 50/50 then Reveal then 50/50...
  if (difficultyTier % 2 === 1){
    charges.fifty = Math.min(MAX_CHARGES, charges.fifty + 1);
  } else {
    charges.reveal = Math.min(MAX_CHARGES, charges.reveal + 1);
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

    // mobile reliable input
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
   PREP NEXT ROUND VISUALS
   (fixes: "shells pop in after tap" on 7->3)
========================= */
function prepareNextRoundVisuals(){
  // reset round flags
  slowArmedThisRound = false;
  fiftyAppliedThisRound = false;

  // rebuild immediately if shell count changed (or after theme change)
  if (shellCount !== stageShells){
    buildShells(stageShells);
  } else {
    applyArt();
    recomputeSlots();
    shells.forEach((_, shellId) => {
      shells[shellId].style.left = `${slotPerc[slots[shellId]]}%`;
      shells[shellId].style.opacity = "1";
      shells[shellId].style.pointerEvents = "auto";
    });
  }

  hidePearl();
  refreshLifelinesUI();
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

  // swap positions (pearl stays tied to shellId)
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
  const base = difficultyFromProgress(totalWinsThisRun, shellCount, difficultyTier);

  // Slow lifeline: only affects NEXT shuffle, then clears
  const slowMult = slowArmedThisRound ? 1.75 : 1.0;

  const d = {
    swaps: base.swaps,
    duration: Math.round(base.duration * slowMult),
    pauseChance: base.pauseChance,
    pauseExtraMax: Math.round(base.pauseExtraMax * slowMult)
  };

  busy = true;
  canGuess = false;
  phase = "shuffling";
  setMessage("Shuffling…");
  refreshLifelinesUI();

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
    refreshLifelinesUI();

    // Slow is one-time per round
    slowArmedThisRound = false;
  }
}

async function startRound(){
  if (busy || canGuess) return;

  // round flags
  fiftyAppliedThisRound = false;

  // ensure visuals are already correct (including after resets)
  prepareNextRoundVisuals();

  pickPearlForRound();

  setMessage(`Watch the pearl…`);
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await shuffle();
}

/* =========================
   LIFELINE BEHAVIOR
========================= */
function apply5050(){
  if (phase !== "guessing" || busy) return;
  if (charges.fifty <= 0) return;
  if (shellCount < 3) return;
  if (fiftyAppliedThisRound) return;

  charges.fifty--;
  fiftyAppliedThisRound = true;

  // Keep correct + one random incorrect, disable others
  const correctId = pearlUnderShellId;

  let other = rndInt(shellCount);
  while (other === correctId) other = rndInt(shellCount);

  for (let i = 0; i < shellCount; i++){
    if (i === correctId || i === other){
      shells[i].style.opacity = "1";
      shells[i].style.pointerEvents = "auto";
    } else {
      shells[i].style.opacity = "0.35";
      shells[i].style.pointerEvents = "none";
    }
  }

  setMessage("50/50 used.");
  refreshLifelinesUI();
}

async function applyReveal(){
  if (phase !== "guessing" || busy) return;
  if (charges.reveal <= 0) return;

  charges.reveal--;
  placePearlUnderShell(pearlUnderShellId);
  showPearl();
  pulsePearl();

  setMessage("Revealed.");
  refreshLifelinesUI();

  await sleep(650);

  // If still guessing, hide again
  if (phase === "guessing"){
    hidePearl();
    setMessage("Pick a shell.");
  }
}

function armSlow(){
  if (phase !== "ready" || busy) return;
  if (charges.slow <= 0) return;

  charges.slow--;
  slowArmedThisRound = true;

  setMessage("Slow armed for next shuffle.");
  refreshLifelinesUI();
}

/* Wire lifeline buttons */
lifeSlow.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  armSlow();
}, { passive:false });

life5050.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  apply5050();
}, { passive:false });

lifeReveal.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  applyReveal();
}, { passive:false });

/* =========================
   GUESS
========================= */
async function handleGuess(shellId){
  if (phase !== "guessing") return;
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;
  refreshLifelinesUI();

  // normalize shell clickability after 50/50
  shells.forEach(s => { s.style.pointerEvents = "auto"; s.style.opacity = "1"; });

  placePearlUnderShell(pearlUnderShellId);
  showPearl();
  pulsePearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();

    totalWinsThisRun++;
    stageWins++;

    const result = advanceStageIfReady();

    if (result.didReset){
      // ✅ THE ONLY PLACE WE AWARD EXTRAS:
      awardResetBonusesOnly();

      // IMPORTANT: apply new theme + 3 shells NOW (no “pop-in after tap”)
      prepareNextRoundVisuals();

      setMessage("Stage cleared.");
    } else if (result.changed){
      // prebuild the next shell count immediately so it’s already there
      prepareNextRoundVisuals();
      setMessage(`Level up.`);
    } else {
      setMessage("Correct!");
    }

    await sleep(750);
    hidePearl();

    busy = false;
    phase = "ready";
    setMessage("Tap anywhere for next round");
    refreshLifelinesUI();

  } else {
    // Shield: prevents game over ONCE per charge (passive)
    if (charges.shield > 0){
      charges.shield--;
      setMessage("Shield saved you.");
      overlay.classList.add("flash");
      await sleep(220);
      overlay.classList.remove("flash");

      await sleep(420);
      hidePearl();

      busy = false;
      phase = "ready";
      setMessage("Tap anywhere for next round");
      refreshLifelinesUI();
      return;
    }

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
      prepareNextRoundVisuals(); // ensure visible + themed before first tap
      setMessage("Tap anywhere to start");
      refreshLifelinesUI();
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

  charges = { slow: 1, shield: 1, fifty: 0, reveal: 0 };

  refreshHUD();
  hidePearl();
  boot();
}

async function boot(){
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;

  if (titleCta) titleCta.style.display = SHOW_TITLE_CTA_OVERLAY ? "block" : "none";

  // build under screens but keep hidden until title tap
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
  refreshLifelinesUI();
}

btnReset.addEventListener("click", (e) => {
  e.stopPropagation();
  resetGame();
});

boot();