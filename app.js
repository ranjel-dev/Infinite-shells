/* =========================
   Infinite Shells — app.js (FULL MERGED)
   Ladder progression + pacing:
   - Start at 3 shells
   - After 2 wins at 3 → 4 shells
   - After 2 wins at 4 → 5 shells
   - After 2 wins at 5 → 6 shells
   - After 1 win  at 6 → 7 shells
   - After 1 win  at 7 → theme advances + reset to 3 shells
   - Each time you clear 7 shells, the next cycle (back at 3) is slightly harder (difficultyTier++)
   - Pearl positioning uses cached slot positions (fixes “drift”)
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
  { key:"ivory",  bg:"#0F2F1F" }, // confirmed: ivory shell on dark green bg
  { key:"coral",  bg:"#0E3A44" },
  { key:"green",  bg:"#2B1240" },
  { key:"gray",   bg:"#1C2736" },
  { key:"purple", bg:"#3A0E1A" },
  { key:"blue",   bg:"#3A260F" },
  { key:"red",    bg:"#0A1224" }
];

/* ---------- Lifelines scaffold (disabled for now) ---------- */
const lifelines = {
  reveal: { enabled:false, uses:0, maxUses:1 },
  slowMo: { enabled:false, uses:0, maxUses:1 }
};
const canUseLifeline = (n) => lifelines[n]?.enabled && lifelines[n].uses < lifelines[n].maxUses;
const useLifeline = (n) => canUseLifeline(n) ? (++lifelines[n].uses, true) : false;

/* ---------- DOM ---------- */
const board      = document.getElementById("board");
const shellLayer = document.getElementById("shellLayer");
const pearl      = document.getElementById("pearl");
const msg        = document.getElementById("msg");
const scoreLine  = document.getElementById("scoreLine");
const overlay    = document.getElementById("overlay");
const recordText = document.getElementById("recordText");
const btnStart   = document.getElementById("btnStart");
const btnReset   = document.getElementById("btnReset");

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rndInt = (n) => Math.floor(Math.random() * n);

/* ---------- State ---------- */
let score = 0;
let bestScore = Number(localStorage.getItem("infiniteShells_bestScore") || "0");
let recordShownThisRun = false;

let themeIndex = 0;

// “Run” = one attempt until you lose.
let totalWinsThisRun = 0;

// Ladder tracking (your requested rules)
let stageShells = 3;       // current stage shell count (3..7)
let stageWins = 0;         // wins achieved within the current stage
let difficultyTier = 0;    // increments each time 7-shell is cleared (next cycle slightly harder)

let shellCount = 3;
const MIN_SHELLS = 3;
const MAX_SHELLS = 7;

let shells = [];           // shell DOM nodes (identity-based)
let slots = [];            // slots[shellId] = slotIndex (where that shell currently sits)
let slotPerc = [];         // cached percentage positions for each slot

let pearlUnderShellId = 0; // pearl hidden under a shell identity
let canGuess = false;
let busy = false;

/* ---------- Slots / Layout ---------- */
function computeSlotPercents(n){
  // Tighter margins as shells increase so 7 fits.
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

/* ---------- Ladder rules ---------- */
function winsNeededForStage(shells){
  if (shells === 3) return 2;
  if (shells === 4) return 2;
  if (shells === 5) return 2;
  if (shells === 6) return 1;
  if (shells === 7) return 1;
  return 2;
}

function advanceStageIfReady(){
  const need = winsNeededForStage(stageShells);
  if (stageWins < need) return;

  // reset wins for the next stage
  stageWins = 0;

  if (stageShells === 7){
    // cleared 7 shells → theme + reset to 3, slightly harder next cycle
    themeIndex = (themeIndex + 1) % THEMES.length;
    difficultyTier++;
    stageShells = 3;
  } else {
    stageShells++;
  }
}

/* ---------- Difficulty (slow early, ramps later; tier bumps each cycle) ---------- */
function difficultyFromProgress(totalWins, shellsNow, tier){
  // totalWins ramps “later levels”; tier makes each 3→7 cycle slightly harder.
  const t = Math.min(1, totalWins / 40);           // slower ramp
  const ease = t * t * (3 - 2 * t);                // smoothstep
  const late = Math.max(0, (totalWins - 18) / 22);  // extra ramp later

  const baseSwaps = 5 + (shellsNow - 3) * 2;        // 3 shells ~5, 7 shells ~13
  const tierBump = Math.min(10, tier * 1.2);        // gentle, capped

  const swaps = Math.round(baseSwaps + ease * 8 + late * 10 + tierBump);

  // duration per swap (ms): early readable, later fast; tier nudges faster
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

/* ---------- Build / Place ---------- */
function buildShells(n){
  shellLayer.innerHTML = "";
  shells = [];
  slots = [];

  shellCount = n;
  recomputeSlots();

  // Create shell identities 0..n-1; each starts in its own slot index
  for (let shellId = 0; shellId < shellCount; shellId++){
    const d = document.createElement("div");
    d.className = "shell";

    slots[shellId] = shellId;
    d.style.left = `${slotPerc[slots[shellId]]}%`;

    d.addEventListener("click", () => handleGuess(shellId));
    shells.push(d);
    shellLayer.appendChild(d);
  }

  applyTheme();

  // Clamp pearl if needed
  if (pearlUnderShellId >= shellCount) pearlUnderShellId = 0;
  placePearlUnderShell(pearlUnderShellId);
}

function placePearlUnderShell(shellId){
  const slotIndex = slots[shellId];
  pearl.style.left = `${slotPerc[slotIndex]}%`;
}

function showPearl(){ pearl.style.opacity = "1"; }
function hidePearl(){ pearl.style.opacity = "0"; }

function setMessage(t){ msg.textContent = t; }
function refreshHUD(){ scoreLine.textContent = `Score: ${score}`; }

/* ---------- Pearl selection ---------- */
function pickPearlForRound(){
  // Choose a shell identity to hide pearl under.
  let next = rndInt(shellCount);
  if (shellCount > 1 && next === pearlUnderShellId){
    next = (next + 1 + rndInt(shellCount - 1)) % shellCount;
  }
  pearlUnderShellId = next;
  placePearlUnderShell(pearlUnderShellId);
}

/* ---------- Shuffle animation ---------- */
async function animateSwap(a, b, duration){
  // Lift
  shells[a].classList.add("lift");
  shells[b].classList.add("lift");

  // Swap their slot assignments
  const tmp = slots[a];
  slots[a] = slots[b];
  slots[b] = tmp;

  // Apply movement
  shells[a].style.transitionDuration = `${duration}ms`;
  shells[b].style.transitionDuration = `${duration}ms`;

  shells[a].style.left = `${slotPerc[slots[a]]}%`;
  shells[b].style.left = `${slotPerc[slots[b]]}%`;

  await sleep(Math.max(60, duration * 0.55));

  // Unlift
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

    if (Math.random() < d.pauseChance) {
      await sleep(rndInt(d.pauseExtraMax));
    } else {
      await sleep(rndInt(45));
    }
  }

  busy = false;
  canGuess = true;
  setMessage("Pick a shell.");
}

/* ---------- Round flow ---------- */
async function startRound(){
  if (busy) return;

  // Use ladder shells
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

  // Pick pearl, show briefly, then shuffle
  pickPearlForRound();

  setMessage("Watch the ball…");
  showPearl();
  await sleep(650);
  hidePearl();
  await sleep(120);

  await shuffle();
}

/* ---------- Guess handling ---------- */
async function handleGuess(shellId){
  if (!canGuess || busy) return;

  canGuess = false;
  busy = true;

  // Reveal pearl under correct shell (cached slotPerc + slots map)
  placePearlUnderShell(pearlUnderShellId);
  showPearl();

  const correct = (shellId === pearlUnderShellId);

  if (correct){
    score += 10;
    refreshHUD();

    // NEW RECORD (one-time per run)
    if (score > bestScore && !recordShownThisRun){
      bestScore = score;
      localStorage.setItem("infiniteShells_bestScore", String(bestScore));
      recordShownThisRun = true;
      recordText.classList.add("show");
      setTimeout(() => recordText.classList.remove("show"), 1500);
    }

    // Ladder progress
    totalWinsThisRun++;
    stageWins++;

    const wasSeven = (stageShells === 7);
    advanceStageIfReady();
    const didReset = (wasSeven && stageShells === 3);

    setMessage(didReset ? "Stage cleared! Theme advanced." : "Correct!");

    await sleep(750);
    hidePearl();

    busy = false;
    setMessage("Tap Start / Next Round");
  } else {
    // Loss polish + reset
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

  // Full reset to beginning
  stageShells = 3;
  stageWins = 0;
  difficultyTier = 0;

  themeIndex = 0;
  recordShownThisRun = false;

  refreshHUD();
  hidePearl();
  setMessage("Ready. Hit Start.");

  // Fresh build at 3 shells
  buildShells(MIN_SHELLS);

  // Random starting pearl (not always left)
  pearlUnderShellId = rndInt(shellCount);
  placePearlUnderShell(pearlUnderShellId);
}

/* ---------- Wire buttons ---------- */
btnStart.addEventListener("click", startRound);
btnReset.addEventListener("click", resetGame);

/* ---------- Init ---------- */
resetGame();
