/* =========================
   LOCKED / APPROVED BASE
========================= */
const SHOW_TITLE_CTA_OVERLAY = true;

/* screens */
const LOADING_HOLD_MS = 5200;     // longer logo (per your request)
const FADE_MS = 550;             // matches CSS
const POST_TITLE_LOCK_MS = 3000; // prevent accidental start after title

/* game assets */
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

/* IMPORTANT: background is locked in CSS. We do NOT change board background in JS. */
const SHELL_THEME_KEY = "ivory"; // just the shell art (safe default)

/* DOM */
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

/* helpers */
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

/* state */
let phase = "loading"; // loading -> title -> lockout -> ready -> shuffling -> guessing
let score = 0;

let shellCount = 3;
let shells = [];
let slots = [];     // slots[shellId] = slotIndex position
let slotPerc = [];  // percent positions

let pearlUnderShellId = 0;
let busy = false;
let canGuess = false;

let lockTimer = null;

/* layout */
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

/* difficulty (SAFE EARLY GAME) */
function difficultyForScore(currentScore){
  // super stable early: slow + readable
  if (currentScore < 40) return { swaps: 6, duration: 260, pauseChance: 0.14, pauseExtraMax: 100 };
  if (currentScore < 100) return { swaps: 8, duration: 220, pauseChance: 0.12, pauseExtraMax: 90 };
  return { swaps: 10, duration: 185, pauseChance: 0.10, pauseExtraMax: 80 };
}

/* visuals */
function applyArt(){
  const shellURL = ASSETS.shells[SHELL_THEME_KEY];
  shells.forEach(s => s.style.backgroundImage = `url(${shellURL})`);
  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
}

function setMessage(t){ msg.textContent = t; }
function refreshHUD(){ scoreLine.textContent = `Score: ${score}`; }
function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

/* build */
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

  applyArt();

  if (pearlUnderShellId >= shellCount) pearlUnderShellId = 0;
  placePearlUnderShell(pearlUnderShellId);
}

function placePearlUnderShell(shellId){
  const slotIndex = slots[shellId];
  pearl.style.left = `${slotPerc[slotIndex]}%`;
}

/* round */
function pickPearlForRound(){
  let next = rndInt(shellCount);
  pearlUnderShellId = next;
  placePearlUnderShell(pearlUnderShellId);
}

async function animateSwap(a, b, duration){
  shells[a].classList.add("lift");
  shells[b].classList.add("lift");

  // pearl stays with the shellId, so we only swap positions (slots)
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
  const d = difficultyForScore(score);

  busy = true;
  canGuess = false;
  setMessage("Shuffling…");

  for (let k = 0; k < d.swaps; k++){
    let a = rndInt(shellCount);
    let b = rndInt(shellCount);
    while (b === a) b = rndInt(shellCount);

    await animateSwap(a, b, d.duration);

    if (Math.random() < d.pauseChance) await sleep(rndInt(d.pauseExtraMax));
    else await sleep(rndInt(55));
  }

  busy = false;
  canGuess = true;
  phase = "guessing";
  setMessage("Pick a shell.");
}

async function startRound(){
  if (busy || canGuess) return;

  phase = "shuffling";

  // make sure pearl is under a valid shell and visible for the “watch” moment
  pickPearlForRound();
  setMessage("Watch the pearl…");
  showPearl();
  await sleep(900);
  hidePearl();
  await sleep(160);

  await shuffle();
}

/* guess */
async function handleGuess(shellId){
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;

  // reveal pearl exactly under the correct shell
  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();
    setMessage("Correct!");
    await sleep(900);
    hidePearl();

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

/* tap-anywhere */
function onGlobalTap(){
  if (phase === "loading") return;

  if (phase === "title"){
    // Immediately show the shells (no blank pause), but still lock starting the round for 3s
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

/* reset / boot */
function resetGame(){
  busy = false;
  canGuess = false;
  score = 0;
  refreshHUD();
  hidePearl();
  boot();
}

async function boot(){
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;

  // CTA overlay locked ON (tvgphjn needs it)
  if (titleCta) titleCta.style.display = SHOW_TITLE_CTA_OVERLAY ? "block" : "none";

  // build game, but keep hidden behind screens until title tap
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