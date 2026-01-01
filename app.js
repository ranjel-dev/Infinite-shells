const board = document.getElementById("board");
const loadingScreen = document.getElementById("loadingScreen");
const titleScreen = document.getElementById("titleScreen");
const msg = document.getElementById("msg");

let phase = "loading"; // loading → title → ready → playing

/* =========================
   BOOT SEQUENCE
========================= */
setTimeout(() => {
  loadingScreen.style.display = "none";
  titleScreen.style.display = "flex";
  phase = "title";
}, 800);

/* =========================
   TAP HANDLING
========================= */
document.addEventListener("pointerdown", () => {

  if (phase === "title"){
    titleScreen.style.display = "none";
    msg.textContent = "Tap anywhere to Start.";
    phase = "ready";
    return;
  }

  if (phase === "ready"){
    msg.textContent = "Watch the ball…";
    phase = "playing";
    // shuffle logic already exists
  }

});

/* =========================
   RESET
========================= */
document.getElementById("btnReset").addEventListener("click", () => {
  phase = "loading";
  loadingScreen.style.display = "flex";
  titleScreen.style.display = "none";
  msg.textContent = "";

  setTimeout(() => {
    loadingScreen.style.display = "none";
    titleScreen.style.display = "flex";
    phase = "title";
  }, 800);
});
