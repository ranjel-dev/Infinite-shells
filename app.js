const ASSETS = {
  ball: "https://i.imgur.com/kLGt0DN.png",
  shells: {
    ivory:"https://i.imgur.com/plbX02y.png",
    coral:"https://i.imgur.com/eo5doV1.png",
    green:"https://i.imgur.com/OHGwmzW.png",
    gray:"https://i.imgur.com/bNUWfLU.png",
    purple:"https://i.imgur.com/xypjVlk.png",
    blue:"https://i.imgur.com/cJeZGFc.png",
    red:"https://i.imgur.com/eJI6atV.png"
  }
};

const THEMES = [
  {key:"ivory",bg:"#0F2F1F"},
  {key:"coral",bg:"#0E3A44"},
  {key:"green",bg:"#2B1240"},
  {key:"gray",bg:"#1C2736"},
  {key:"purple",bg:"#3A0E1A"},
  {key:"blue",bg:"#3A260F"},
  {key:"red",bg:"#0A1224"}
];

const board=document.getElementById("board");
const shellLayer=document.getElementById("shellLayer");
const pearl=document.getElementById("pearl");
const msg=document.getElementById("msg");
const scoreLine=document.getElementById("scoreLine");
const overlay=document.getElementById("overlay");
const recordText=document.getElementById("recordText");

let score=0,round=1,themeIndex=0,shellCount=3;
let shells=[],slots=[],pearlAt=0,canGuess=false,busy=false;
let best=+localStorage.getItem("best")||0,recordShown=false;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rnd=n=>Math.floor(Math.random()*n);

function slotsFor(n){
  const m=n==5?15:n==4?20:25;
  const s=(100-m*2)/(n-1);
  return [...Array(n)].map((_,i)=>m+i*s);
}

function build(n){
  shellLayer.innerHTML="";
  shells=[];slots=[];shellCount=n;
  const p=slotsFor(n);
  for(let i=0;i<n;i++){
    const d=document.createElement("div");
    d.className="shell";
    d.style.left=p[i]+"%";
    d.onclick=()=>pick(i);
    shells.push(d);slots.push(i);
    shellLayer.appendChild(d);
  }
  applyTheme();
}

function applyTheme(){
  const t=THEMES[themeIndex%THEMES.length];
  board.style.background=t.bg;
  shells.forEach(s=>s.style.backgroundImage=`url(${ASSETS.shells[t.key]})`);
  pearl.style.backgroundImage=`url(${ASSETS.ball})`;
}

async function shuffle(){
  canGuess=false;busy=true;msg.textContent="Shuffling…";
  for(let i=0;i<10+round;i++){
    let a=rnd(shellCount),b=rnd(shellCount);if(a==b)continue;
    [slots[a],slots[b]]=[slots[b],slots[a]];
    shells[a].style.left=slotsFor(shellCount)[slots[a]]+"%";
    shells[b].style.left=slotsFor(shellCount)[slots[b]]+"%";
    await sleep(120);
  }
  busy=false;canGuess=true;msg.textContent="Pick a shell.";
}

async function start(){
  if(busy)return;
  if([6,11,16].includes(round)||(round>=21&&(round-1)%10==0))themeIndex++;
  if(round%10==1)shellCount=3;
  if(shellCount<5)shellCount++;
  build(shellCount);
  pearlAt=rnd(shellCount);
  pearl.style.left=slotsFor(shellCount)[slots[pearlAt]]+"%";
  pearl.style.opacity=1;
  await sleep(600);
  pearl.style.opacity=0;
  await shuffle();
}

async function pick(i){
  if(!canGuess)return;
  canGuess=false;
  pearl.style.left=slotsFor(shellCount)[slots[pearlAt]]+"%";
  pearl.style.opacity=1;
  if(i===pearlAt){
    score+=10;scoreLine.textContent=`Score: ${score}`;
    if(score>best&&!recordShown){
      best=score;localStorage.setItem("best",best);
      recordShown=true;recordText.classList.add("show");
      setTimeout(()=>recordText.classList.remove("show"),1500);
    }
    round++;await sleep(700);pearl.style.opacity=0;msg.textContent="Next round";
  }else{
    overlay.classList.add("flash");board.classList.add("shake");
    await sleep(600);
    overlay.classList.remove("flash");board.classList.remove("shake");
    reset();
  }
}

function reset(){
  score=0;round=1;themeIndex=0;recordShown=false;
  scoreLine.textContent="Score: 0";
  msg.textContent="Ready. Hit Start.";
  build(3);
}

document.getElementById("btnStart").onclick=start;
document.getElementById("btnReset").onclick=reset;
reset();
