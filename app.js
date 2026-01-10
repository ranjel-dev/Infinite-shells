/* =========================
   LOCKED / APPROVED BASE
========================= */
const SHOW_TITLE_CTA_OVERLAY = true;
const LOADING_HOLD_MS = 5200;
const FADE_MS = 550;
const POST_TITLE_LOCK_MS = 3000;

const RESOLVE_HOLD_MS = 900;
const POST_RESOLVE_BUFFER_MS = 260;

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
  { key:"ivory",  color:"#F3EFE2" },
  { key:"coral",  color:"#FF6B6B" },
  { key:"green",  color:"#46D18C" },
  { key:"gray",   color:"#B8BECA" },
  { key:"purple", color:"#B06CFF" },
  { key:"blue",   color:"#4AA3FF" },
  { key:"red",    color:"#FF3C3C" }
];

/* =========================
   DOM
========================= */
const shellLayer    = document.getElementById("shellLayer");
const pearl         = document.getElementById("pearl");
const msg           = document.getElementById("msg");
const scoreLine     = document.getElementById("scoreLine");
const overlay       = document.getElementById("overlay");
const btnReset      = document.getElementById("btnReset");

const loadingScreen = document.getElementById("loadingScreen");
const titleScreen   = document.getElementById("titleScreen");
const titleCta      = document.querySelector(".pressStart");

const gameOverMenu  = document.getElementById("gameOverMenu");
const btnRetry      = document.getElementById("btnRetry");
const btnTitle      = document.getElementById("btnTitle");

/* Lifelines */
const lifeSlow   = document.getElementById("lifeSlow");
const lifeShield = document.getElementById("lifeShield"); // display-only
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

function setMessage(t){ msg.textContent = t; }
function refreshHUD(){ scoreLine.textContent = `Score: ${score}`; }
function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

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
  const ll = document.getElementById("lifelines");
  if (ll) ll.style.visibility = shouldHide ? "hidden" : "visible";
}

function stopTap(e){
  e.preventDefault();
  e.stopPropagation();
}

/* =========================
   THEME + ICONS
========================= */
function setThemeCSS(){
  const th = THEMES[themeIndex % THEMES.length];
  document.documentElement.style.setProperty("--themeColor", th.color);
}

function svgIcon(kind){
  const common = `fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "slow") {
    return `<svg viewBox="0 0 24 24" ${common}>
      <path d="M7 2h10M7 22h10"/>
      <path d="M8 2c0 6 8 6 8 10s-8 4-8 10"/>
    </svg>`;
  }
  if (kind === "shield") {
    return `<svg viewBox="0 0 24 24" ${common}>
      <path d="M12 2l8 4v7c0 5-3.5 9-8 9s-8-4-8-9V6l8-4z"/>
      <path d="M12 6v12"/>
    </svg>`;
  }
  if (kind === "fifty") {
    return `<svg viewBox="0 0 24 24" ${common}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3v18"/>
      <path d="M9 9h2M13 15h2"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" ${common}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/>
    <circle cx="12" cy="12" r="2.5"/>
  </svg>`;
}

function installLifelineIcons(){
  lifeSlow.querySelector(".icon").innerHTML   = svgIcon("slow");
  lifeShield.querySelector(".icon").innerHTML = svgIcon("shield");
  lifeFifty.querySelector(".icon").innerHTML  = svgIcon("fifty");
  lifeReveal.querySelector(".icon").innerHTML = svgIcon("reveal");
}

/* =========================
   GAME OVER MENU (NEW)
========================= */
function showGameOverMenu(){
  gameOverMenu.classList.add("show");
  gameOverMenu.setAttribute("aria-hidden", "false");
}

function hideGameOverMenu(){
  gameOverMenu.classList.remove("show");
  gameOverMenu.setAttribute("aria-hidden", "true");
}

/* =========================
   STATE
========================= */
let phase = "loading"; // loading -> title -> lockout -> ready -> shuffling -> guessing -> resolving -> gameoverMenu
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

/* =========================
   LIFELINES
========================= */
const MAX_LIFE = 3;
let life = {
  slow:   1,
  shield: 1,  // always-on auto
  fifty:  0,
  reveal: 0
};

let slowArmed = false;
let fiftyActive = false;
let revealActive = false;

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

function applySlow(duration){
  return Math.min(520, Math.round(duration * 2.2));
}

/* =========================
   ART APPLY
========================= */
function applyArt(){
  const th = THEMES[themeIndex % THEMES.length];
  const shellURL = ASSETS.shells[th.key];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
  setThemeCSS();
}

/* =========================
   HIGHLIGHTS
========================= */
function clearShellHighlights(){
  shells.forEach(s => s.classList.remove("dim","focus","revealHint"));
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
  clearShellHighlights();
}

function placePearlUnderShell(shellId){
  const slotIndex = slots[shellId];
  pearl.style.left = `${slotPerc[slotIndex]}%`;
}

/* =========================
   LIFELINE UI
========================= */
function renderDots(el, count){
  el.innerHTML = "";
  for (let i = 0; i < MAX_LIFE; i++){
    const d = document.createElement("span");
    d.className = "dot" + (i < count ? " on" : "");
    el.appendChild(d);
  }
}

function refreshLifelinesUI(){
  renderDots(dotsSlow, life.slow);
  renderDots(dotsShield, life.shield);
  renderDots(dotsFifty, life.fifty);
  renderDots(dotsReveal, life.reveal);

  // disabled while menu open or screens
  const blocked = (phase === "loading" || phase === "title" || phase === "lockout" || phase === "gameoverMenu");

  lifeSlow.disabled   = blocked || (life.slow <= 0) || (phase !== "ready" && phase !== "guessing");
  lifeFifty.disabled  = blocked || (life.fifty <= 0) || (phase !== "guessing") || fiftyActive;
  lifeReveal.disabled = blocked || (life.reveal <= 0) || (phase !== "guessing") || revealActive;
}

/* Award extras ONLY during reset 7->3 */
function awardResetExtras(){
  life.slow   = Math.min(MAX_LIFE, life.slow + 1);
  life.shield = Math.min(MAX_LIFE, life.shield + 1);
  life.fifty  = Math.min(MAX_LIFE, life.fifty + 1);
  life.reveal = Math.min(MAX_LIFE, life.reveal + 1);
}

/* =========================
   LIFELINE ACTIONS
========================= */
function useSlow(){
  if (life.slow <= 0) return;
  if (phase !== "ready" && phase !== "guessing") return;

  slowArmed = true;
  life.slow--;
  setMessage("Slow armed for next round.");
  refreshLifelinesUI();
}

function useFifty(){
  if (life.fifty <= 0) return;
  if (phase !== "guessing") return;

  fiftyActive = true;
  life.fifty--;

  const correct = pearlUnderShellId;
  let other = rndInt(shellCount);
  while (other === correct) other = rndInt(shellCount);

  shells.forEach((s, id) => {
    if (id === correct || id === other) s.classList.add("focus");
    else s.classList.add("dim");
  });

  setMessage("50/50: choose between the two lit shells.");
  refreshLifelinesUI();
}

function useReveal(){
  if (life.reveal <= 0) return;
  if (phase !== "guessing") return;

  revealActive = true;
  life.reveal--;

  shells[pearlUnderShellId]?.classList.add("revealHint");
  setMessage("Reveal: the correct shell is hinted.");
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
  const d0 = difficultyFromProgress(totalWinsThisRun, shellCount, difficultyTier);

  let duration = d0.duration;
  let swaps = d0.swaps;

  if (slowArmed){
    duration = applySlow(duration);
    swaps = Math.max(3, Math.round(swaps * 0.8));
  }

  busy = true;
  canGuess = false;
  phase = "shuffling";
  refreshLifelinesUI();
  setMessage("Shuffling…");

  try{
    for (let k = 0; k < swaps; k++){
      let a = rndInt(shellCount);
      let b = rndInt(shellCount);
      while (b === a) b = rndInt(shellCount);

      await animateSwap(a, b, duration);

      if (Math.random() < d0.pauseChance) await sleep(rndInt(d0.pauseExtraMax));
      else await sleep(rndInt(55));
    }
  } finally {
    busy = false;
    canGuess = true;
    phase = "guessing";
    slowArmed = false;
    refreshLifelinesUI();
    setMessage("Pick a shell.");
  }
}

async function startRound(){
  if (busy || canGuess) return;

  fiftyActive = false;
  revealActive = false;
  clearShellHighlights();

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

  refreshLifelinesUI();
  setMessage(`Watch the pearl… (${stageShells} shells)`);
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await shuffle();
}

/* =========================
   GUESS (SHIELD AUTO)
========================= */
async function handleGuess(shellId){
  if (phase !== "guessing") return;
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;
  phase = "resolving";
  refreshLifelinesUI();

  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);
  await sleep(RESOLVE_HOLD_MS);

  if (correct){
    score += 10;
    refreshHUD();

    totalWinsThisRun++;
    stageWins++;

    const result = advanceStageIfReady();

    if (result.changed){
      if (result.didReset) awardResetExtras();

      buildShells(stageShells);
      pearlUnderShellId = rndInt(shellCount);
      placePearlUnderShell(pearlUnderShellId);
      hidePearl();
    } else {
      hidePearl();
    }

    if (result.didReset){
      setMessage("Stage cleared! Reset to 3.");
    } else if (result.changed){
      setMessage(`Level up! Now ${stageShells} shells.`);
    } else {
      setMessage("Correct!");
    }

    await sleep(POST_RESOLVE_BUFFER_MS);

    busy = false;
    phase = "ready";
    refreshLifelinesUI();
    setMessage("Tap anywhere for next round");
    return;
  }

  // Wrong: consume shield if available
  if (life.shield > 0){
    life.shield--;
    hidePearl();
    clearShellHighlights();
    setMessage("Shield saved you.");
    refreshLifelinesUI();

    await sleep(POST_RESOLVE_BUFFER_MS);

    busy = false;
    phase = "ready";
    refreshLifelinesUI();
    setMessage("Tap anywhere for next round");
    return;
  }

  // No shield: show Game Over menu (NEW)
  hidePearl();
  overlay.classList.add("flash");
  await sleep(420);
  overlay.classList.remove("flash");

  busy = false;
  canGuess = false;
  phase = "gameoverMenu";
  refreshLifelinesUI();
  showGameOverMenu();
}

/* =========================
   RETRY / START MENU (NEW)
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

  life = { slow:1, shield:1, fifty:0, reveal:0 };
  slowArmed = false;
  fiftyActive = false;
  revealActive = false;

  refreshHUD();
  hidePearl();
  clearShellHighlights();
  applyArt();
  buildShells(3);
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
  hidePearl();
}

function goToTitle(){
  hideGameOverMenu();
  hideGameUnderScreens(true);
  showScreen(titleScreen);
  phase = "title";
  setMessage("");
  refreshLifelinesUI();
}

function retryNow(){
  hideGameOverMenu();
  hideGameUnderScreens(false);

  resetRunState();

  phase = "ready";
  refreshLifelinesUI();
  setMessage("Tap anywhere to start");
}

/* =========================
   TAP ANYWHERE
========================= */
function onGlobalTap(){
  if (phase === "loading") return;
  if (phase === "shuffling" || phase === "guessing" || phase === "resolving") return;
  if (phase === "gameoverMenu") return; // menu controls only

  if (phase === "title"){
    hideScreen(titleScreen);
    hideGameUnderScreens(false);

    phase = "lockout";
    setMessage("Get ready…");

    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (phase !== "lockout") return;
      phase = "ready";
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
function resetGame(){
  // Full reset including boot sequence
  hideGameOverMenu();
  busy = false;
  canGuess = false;

  score = 0;
  totalWinsThisRun = 0;

  stageShells = 3;
  stageWins = 0;

  themeIndex = 0;
  difficultyTier = 0;

  life = { slow:1, shield:1, fifty:0, reveal:0 };
  slowArmed = false;
  fiftyActive = false;
  revealActive = false;

  refreshHUD();
  hidePearl();
  boot();
}

async function boot(){
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;

  if (titleCta) titleCta.style.display = SHOW_TITLE_CTA_OVERLAY ? "block" : "none";

  installLifelineIcons();
  setThemeCSS();

  buildShells(3);
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
  hidePearl();

  hideGameOverMenu();
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

/* Lifeline events */
lifeSlow.addEventListener("pointerdown", (e) => { stopTap(e); useSlow(); }, { passive:false });
lifeFifty.addEventListener("pointerdown", (e) => { stopTap(e); useFifty(); }, { passive:false });
lifeReveal.addEventListener("pointerdown", (e) => { stopTap(e); useReveal(); }, { passive:false });
// Shield has no click handler

/* Game over menu events */
gameOverMenu.addEventListener("pointerdown", stopTap, { passive:false });
btnRetry.addEventListener("pointerdown", (e) => { stopTap(e); retryNow(); }, { passive:false });
btnTitle.addEventListener("pointerdown", (e) => { stopTap(e); goToTitle(); }, { passive:false });

btnReset.addEventListener("click", (e) => {
  e.stopPropagation();
  resetGame();
});

boot();
