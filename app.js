/* ===== SETTINGS ===== */
const LOADING_HOLD_MS = 2200;   // longer logo screen
const POST_TITLE_LOCK_MS = 3000;
const FADE_MS = 450;

/* ===== ASSETS ===== */
const ASSETS = {
  ball: "https://i.imgur.com/kLGt0DN.png",
  shell: "https://i.imgur.com/plbX02y.png"
};

/* ===== DOM ===== */
const board = document.getElementById("board");
const shellLayer = document.getElementById("shellLayer");
const pearl = document.getElementById("pearl");
const msg = document.getElementById("msg");
const scoreLine = document.getElementById("scoreLine");
const overlay = document.getElementById("overlay");
const recordText = document.getElementById("recordText");
const btnReset = document.getElementById("btnReset");

const loadingScreen = document.getElementById("loadingScreen");
const titleScreen = document.getElementById("titleScreen");

/* ===== STATE ===== */
let phase = "loading";
let score = 0;
let best = Number(localStorage.getItem("best") || 0);
let canGuess = false;
let busy = false;
let shells = [];
let slots = [];
let pearlIndex = 0;

/* ===== HELPERS ===== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = n => Math.floor(Math.random() * n);

function show(el){ el.classList.add("show"); }
function hide(el){ el.classList.remove("show"); }

/* ===== BUILD ===== */
function buildShells(count){
  shellLayer.innerHTML = "";
  shells = [];
  slots = [];

  const margin = 25;
  const span = 100 - margin * 2;
  const step = span / (count - 1);

  for(let i=0;i<count;i++){
    const d = document.createElement("div");
    d.className = "shell";
    d.style.left = `${margin + step * i}%`;
    d.style.backgroundImage = `url(${ASSETS.shell})`;

    slots[i] = i;

    d.onclick = e => {
      e.stopPropagation();
      handleGuess(i);
    };

    shells.push(d);
    shellLayer.appendChild(d);
  }

  pearl.style.backgroundImage = `url(${ASSETS.ball})`;
  placePearl();
}

function placePearl(){
  pearl.style.left = shells[pearlIndex].style.left;
}

/* ===== FLOW ===== */
async function shuffle(){
  busy = true;
  canGuess = false;
  msg.textContent = "Shuffling…";

  for(let i=0;i<6;i++){
    const a = rnd(shells.length);
    const b = rnd(shells.length);
    if(a === b) continue;

    [slots[a], slots[b]] = [slots[b], slots[a]];
    shells[a].classList.add("lift");
    shells[b].classList.add("lift");

    shells[a].style.left = `${slots[a] * 25 + 25}%`;
    shells[b].style.left = `${slots[b] * 25 + 25}%`;

    await sleep(200);
    shells[a].classList.remove("lift");
    shells[b].classList.remove("lift");
  }

  canGuess = true;
  busy = false;
  msg.textContent = "Pick a shell.";
}

async function startRound(){
  pearlIndex = rnd(shells.length);
  placePearl();

  msg.textContent = "Watch the ball…";
  pearl.style.opacity = 1;
  await sleep(700);
  pearl.style.opacity = 0;
  await shuffle();
}

async function handleGuess(i){
  if(!canGuess || busy) return;

  canGuess = false;
  pearlIndex = slots.indexOf(i);
  placePearl();
  pearl.style.opacity = 1;

  if(i === pearlIndex){
    score += 10;
    scoreLine.textContent = `Score: ${score}`;
    msg.textContent = "Correct!";
    await sleep(900);
    pearl.style.opacity = 0;
    msg.textContent = "Tap anywhere for next round";
    phase = "ready";
  } else {
    msg.textContent = "Wrong — Game Over";
    overlay.classList.add("flash");
    await sleep(500);
    overlay.classList.remove("flash");
    reset();
  }
}

function reset(){
  score = 0;
  scoreLine.textContent = "Score: 0";
  phase = "title";
  boot();
}

/* ===== TAP ANYWHERE ===== */
document.addEventListener("pointerdown", () => {
  if(phase === "title"){
    hide(titleScreen);
    phase = "lock";
    msg.textContent = "Get ready…";
    setTimeout(() => {
      phase = "ready";
      msg.textContent = "Tap anywhere to start";
    }, POST_TITLE_LOCK_MS);
    return;
  }

  if(phase === "ready" && !busy){
    startRound();
  }
});

/* ===== BOOT ===== */
async function boot(){
  buildShells(3);
  pearl.style.opacity = 0;

  phase = "loading";
  show(loadingScreen);
  hide(titleScreen);

  await sleep(LOADING_HOLD_MS);

  hide(loadingScreen);
  show(titleScreen);
  await sleep(FADE_MS);
  phase = "title";
}

btnReset.onclick = e => {
  e.stopPropagation();
  reset();
};

boot();
