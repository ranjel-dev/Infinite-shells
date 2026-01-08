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

/* Better “match the shell” accents (first theme fixed) */
const THEME_ACCENTS = {
  ivory:  { accent:"rgba(245,240,220,0.96)", soft:"rgba(245,240,220,0.18)", softer:"rgba(245,240,220,0.10)" },
  coral:  { accent:"rgba(255,170,165,0.96)", soft:"rgba(255,170,165,0.18)", softer:"rgba(255,170,165,0.10)" },
  green:  { accent:"rgba(155,255,190,0.96)", soft:"rgba(155,255,190,0.18)", softer:"rgba(155,255,190,0.10)" },
  gray:   { accent:"rgba(220,225,235,0.94)", soft:"rgba(220,225,235,0.16)", softer:"rgba(220,225,235,0.09)" },
  purple: { accent:"rgba(205,170,255,0.96)", soft:"rgba(205,170,255,0.18)", softer:"rgba(205,170,255,0.10)" },
  blue:   { accent:"rgba(150,205,255,0.96)", soft:"rgba(150,205,255,0.18)", softer:"rgba(150,205,255,0.10)" },
  red:    { accent:"rgba(255,140,155,0.96)", soft:"rgba(255,140,155,0.18)", softer:"rgba(255,140,155,0.10)" }
};

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

const lifelinesWrap = document.getElementById("lifelines");

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

/* ladder */
let stageShells = 3;   // 3..7
let stageWins = 0;
let totalWinsThisRun = 0;
let difficultyTier = 0;

/* theme */
let themeIndex = 0;

/* shells layout */
let shellCount = 3;
let shells = [];
let slots = [];
let slotPerc = [];
let pearlUnderShellId = 0;

/* lifelines */
const LIFE_MAX = 3;
let life = { slow:1, shield:1, fifty:0, reveal:0 }; // starts with 1 slow + 1 shield
let usedThisRound = { slow:false, shield:false, fifty:false, reveal:false };
let slowActiveThisRound = false;
let shieldArmed = false;          // if true, first wrong guess is forgiven
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
   THEME APPLY
========================= */
function applyThemeVars(){
  const th = THEMES[themeIndex % THEMES.length];
  const c = THEME_ACCENTS[th.key] || THEME_ACCENTS.ivory;

  board.style.setProperty("--accent", c.accent);
  board.style.setProperty("--accentSoft", c.soft);
  board.style.setProperty("--accentSofter", c.softer);
}

function applyArt(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
  applyThemeVars();
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
   LIFELINE UI
========================= */
function clampCharges(){
  for (const k of Object.keys(life)){
    life[k] = Math.max(0, Math.min(LIFE_MAX, life[k]));
  }
}

function renderLifelines(){
  if (!lifelinesWrap) return;

  lifelinesWrap.querySelectorAll(".lifeline").forEach(btn => {
    const key = btn.dataset.life;
    const charges = life[key] ?? 0;

    // lock look if empty
    btn.classList.toggle("isLocked", charges <= 0);

    // fill dots
    const dots = btn.querySelectorAll(".charges i");
    dots.forEach((dot, idx) => {
      dot.classList.toggle("filled", idx < charges);
    });
  });
}

function addCharge(key, amt=1){
  life[key] = Math.min(LIFE_MAX, (life[key] ?? 0) + amt);
}

/* Award logic so they accumulate “when you get far” */
function awardChargesOnProgress(result){
  // Only award on actual stage changes
  if (!result.changed) return;

  if (result.didReset){
    // Big milestone: give +1 to all (capped)
    addCharge("slow", 1);
    addCharge("shield", 1);
    addCharge("fifty", 1);
    addCharge("reveal", 1);
  } else {
    // Entering 4/5/6/7 gives specific tools
    if (stageShells === 4) addCharge("slow", 1);
    if (stageShells === 5) addCharge("shield", 1);
    if (stageShells === 6) addCharge("fifty", 1);
    if (stageShells === 7) addCharge("reveal", 1);
  }

  clampCharges();
  renderLifelines();
}

function resetRoundPowers(){
  usedThisRound = { slow:false, shield:false, fifty:false, reveal:false };
  slowActiveThisRound = false;
  shieldArmed = false;
  fiftyAppliedThisRound = false;

  // clear 50/50 disabled shells
  shells.forEach(s => s.classList.remove("disabled"));
}

/* =========================
   LADDER: 2-2-2-1-1 (code term ok)
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

  let swaps = Math.round(baseSwaps + ease * 8 + tierBumpSwaps);

  let duration = Math.round(
    270 - ease * 120 - (shellsNow - 3) * 12 - tier * 8
  );
  duration = Math.max(95, duration);

  const pauseChance = Math.min(0.30, 0.10 + ease * 0.10);
  const pauseExtraMax = Math.round(70 + ease * 140);

  // Slow lifeline modifies this round only
  if (slowActiveThisRound){
    duration = Math.round(duration * 1.65);
    swaps = Math.max(4, swaps - 2);
  }

  return { swaps, duration, pauseChance, pauseExtraMax };
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

/* IMPORTANT FIX:
   When stage changes (including reset to 3), rebuild & apply theme NOW,
   not on the next tap. This kills the “pop-in after press”.
*/
function syncStageVisualsIfNeeded(prevStageShells){
  if (stageShells !== prevStageShells){
    buildShells(stageShells);
    hidePearl();
  } else {
    applyArt();
  }
}

async function startRound(){
  if (busy || canGuess) return;

  // always clear per-round effects at round start
  resetRoundPowers();

  // ensure correct shell count is already there
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

  setMessage("Watch the pearl…");
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await shuffle();
}

/* =========================
   LIFELINE EFFECTS
========================= */
function canUseLife(key){
  return (life[key] ?? 0) > 0 && !usedThisRound[key] && !busy;
}

function spendLife(key){
  life[key] = Math.max(0, (life[key] ?? 0) - 1);
  usedThisRound[key] = true;
  renderLifelines();
}

async function useSlow(){
  // Can be used in ready OR during shuffling (before the bulk of swaps)
  if (!(phase === "ready" || phase === "shuffling")) return;
  if (!canUseLife("slow")) return;

  spendLife("slow");
  slowActiveThisRound = true;
  setMessage("Slow armed.");
  await sleep(220);
  if (phase === "guessing") setMessage("Pick a shell.");
}

async function useShield(){
  // Arm before you guess
  if (!(phase === "ready" || phase === "guessing")) return;
  if (!canUseLife("shield")) return;

  spendLife("shield");
  shieldArmed = true;
  setMessage("Shield armed.");
  await sleep(220);
  if (phase === "guessing") setMessage("Pick a shell.");
}

async function useFifty(){
  // Only meaningful during guessing
  if (phase !== "guessing") return;
  if (!canUseLife("fifty")) return;

  spendLife("fifty");
  fiftyAppliedThisRound = true;

  // Keep pearl shell + 1 random wrong shell enabled; disable rest.
  const wrong = [];
  for (let i = 0; i < shellCount; i++){
    if (i !== pearlUnderShellId) wrong.push(i);
  }
  const keepWrong = wrong[rndInt(wrong.length)];
  for (let i = 0; i < shellCount; i++){
    const shouldDisable = (i !== pearlUnderShellId && i !== keepWrong);
    shells[i].classList.toggle("disabled", shouldDisable);
  }

  setMessage("50/50 used.");
  await sleep(240);
  setMessage("Pick a shell.");
}

async function useReveal(){
  // Only during guessing
  if (phase !== "guessing") return;
  if (!canUseLife("reveal")) return;

  spendLife("reveal");

  // Brief honest reveal
  placePearlUnderShell(pearlUnderShellId);
  shells[pearlUnderShellId].classList.add("lift");
  showPearl();
  await sleep(480);
  hidePearl();
  shells[pearlUnderShellId].classList.remove("lift");

  setMessage("Pick a shell.");
}

/* =========================
   GUESS
========================= */
async function handleGuess(shellId){
  if (phase !== "guessing") return;
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;

  // Show pearl where it truly is
  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();

    totalWinsThisRun++;
    stageWins++;

    const prevStage = stageShells;
    const result = advanceStageIfReady();

    // Award charges on progress
    awardChargesOnProgress(result);

    await sleep(650);
    hidePearl();

    // ✅ FIX #1: Sync visuals immediately when stage changes (including reset to 3)
    syncStageVisualsIfNeeded(prevStage);

    busy = false;
    phase = "ready";
    setMessage("Tap anywhere");
  } else {
    // If shield armed, forgive ONE wrong guess (no score, no progress)
    if (shieldArmed){
      shieldArmed = false;
      await sleep(420);
      hidePearl();

      busy = false;
      phase = "ready";
      setMessage("Saved.");
      return;
    }

    setMessage("Wrong.");
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
function onGlobalTap(e){
  // If tap started on lifelines, ignore global tap
  if (e?.target?.closest && e.target.closest("#lifelines")) return;

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
      setMessage("Tap anywhere");
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
   LIFELINE INPUT
========================= */
if (lifelinesWrap){
  lifelinesWrap.querySelectorAll(".lifeline").forEach(btn => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const key = btn.dataset.life;
      if (key === "slow")   useSlow();
      if (key === "shield") useShield();
      if (key === "fifty")  useFifty();
      if (key === "reveal") useReveal();
    }, { passive:false });
  });
}

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

  // lifelines start state
  life = { slow:1, shield:1, fifty:0, reveal:0 };
  resetRoundPowers();

  refreshHUD();
  hidePearl();
  renderLifelines();
  boot();
}

async function boot(){
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;

  if (titleCta) titleCta.style.display = SHOW_TITLE_CTA_OVERLAY ? "block" : "none";

  // Ensure theme vars are correct immediately (fixes “first theme mismatch”)
  applyThemeVars();

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

renderLifelines();
boot();