const API_URL = "https://script.google.com/macros/s/AKfycbx94_rAz6wIFA_ClGvdxCgwndME8nsLa0pOJQzt1l3MhEWHklffHB1OAyeOah_hduGfVw/exec";

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

async function callAPI(data) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(data)
  });
  return await res.json();
}


async function loadSets() {
  const data = await callAPI({ action: "getTodaySets" });

  const container = document.getElementById("setsContainer");
  container.innerHTML = "<h2>Pool Play Matches</h2>";

  data.forEach(match => {
    const div = document.createElement("div");
    div.className = "match-card";

    const hasScore = match.score && match.score !== "";

    let scoreHTML = "";

    if (hasScore) {
      const [a, b] = match.score.split("-").map(Number);

      const isWin = match.teamA.includes("Max"); // TEMP "(I)" logic

      scoreHTML = `
        <div class="score">${match.score}</div>
        <div class="${isWin ? "win" : "loss"}">${isWin ? "WIN" : "LOSS"}</div>
      `;
    } else {
      scoreHTML = `
        <button class="enter-score" onclick="quickScore(${match.set},1)">
          Enter Score
        </button>
      `;
    }

    div.innerHTML = `
      <div class="match-left">
        <div class="teamA">${match.teamA}</div>
        <div class="teamB">${match.teamB}</div>
      </div>
      <div class="match-right">
        ${scoreHTML}
      </div>
    `;

    container.appendChild(div);
  });
}

async function quickScore(set, game) {
  const score = prompt("Enter score");
  if (!score) return;

  await callAPI({
    action: "score",
    set,
    game,
    score
  });

  loadSets();
}

// ACTIONS
async function generateGames() {
  haptic();
  await callAPI({ action: "games" });
}

async function completeDay() {
  haptic();
  await callAPI({ action: "done" });
}

async function setScore(set, game) {
  haptic();

  const score = prompt("Enter score (ex: 11-7)");
  if (!score) return;

  await callAPI({
    action: "score",
    set,
    game,
    score
  });
}

// REAL-TIME UPDATE LOOP
setInterval(async () => {
  const data = await callAPI({ action: "getRankings" });
  renderChart(data);
}, 1500);

async function loadData() {
  // rankings
  const rankings = await callAPI({ action: "getRankings" });

  if (rankings) {
    renderChart(rankings);
  }
}

// CHART
function renderChart(data) {
  const ctx = document.getElementById("chart");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(p => p.name),
      datasets: [{
        data: data.map(p => p.wins)
      }]
    }
  });
}

let startX = 0;

document.addEventListener("touchstart", e => {
  startX = e.touches[0].clientX;
});

document.addEventListener("touchend", e => {
  const endX = e.changedTouches[0].clientX;
  const diff = startX - endX;

  if (Math.abs(diff) > 50) {
    swipe(diff > 0 ? "left" : "right");
  }
});

const pages = ["home","rankings","schedule","sets","input"];
let currentPage = 0;

function swipe(direction) {
  if (direction === "left" && currentPage < pages.length - 1) {
    currentPage++;
  }
  if (direction === "right" && currentPage > 0) {
    currentPage--;
  }
  showPage(pages[currentPage]);
}




function toggleMenu() {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

window.onload = () => {
  loadSets();
};