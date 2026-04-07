const API_URL = "https://script.google.com/macros/s/AKfycbzCgbfG5wCJl7utrnejN4K7_h5E8yfa_cW2Pf7vywREAAvFY0njdYP6AXfN27OFNuw7/exec";

function log(label, data) {
  console.log("🔥", label, data);
}

let touchStartY = 0;
let holdTimer;

document.addEventListener("touchstart", e => {
  touchStartY = e.touches[0].clientY;
});

document.addEventListener("touchmove", e => {
  const y = e.touches[0].clientY;

  if (y - touchStartY > 80) {
    if (!holdTimer) {
      holdTimer = setTimeout(() => {
        location.reload();
      }, 2000);
    }
  }
});

document.addEventListener("touchend", () => {
  clearTimeout(holdTimer);
  holdTimer = null;
});

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
    p.style.display = "none";
  });

  const page = document.getElementById(id);
  page.style.display = "block";
  page.classList.add("active");

  document.getElementById("sideMenu").classList.remove("open");
  document.getElementById("overlay").classList.remove("show");

  if (id === "rankings") loadRankings();
  if (id === "schedule") loadSchedule();
  if (id === "input") loadSets();
}


function formatNames(str) {
  return str
    .toUpperCase()
    .replace(/\//g, " / ");
}

async function callAPI(params) {
  const query = new URLSearchParams(params).toString();

  const res = await fetch(`${API_URL}?${query}`);
  return await res.json();
}

async function loadSets() {
  const data = await callAPI({ action: "getTodaySets" });
  log("SETS DATA", data);

  const container = document.getElementById("setsContainer");

  container.innerHTML = `<h2 class="section-title">Pool Play Matches</h2>`;

  data.forEach(match => {
    const games = ["G1", "G2", "G3"];

    container.innerHTML += `
      <div class="set-container">
        <div class="set-title">SET ${match.set}</div>
    `;

    games.forEach((g, i) => {
      const score = match.scores?.[i] || "";


      

      let a = 0, b = 0;

      if (score && score.includes("-")) {
        const parts = score.split("-");
        a = parts[0];
        b = parts[1];
      }

      let result = "tie";
      if (Number(a) > Number(b)) result = "win";
      if (Number(b) > Number(a)) result = "loss";

      const rightSide = `
        <div class="score-editable">
          <input type="number" value="${a}" oninput="updateScore(${match.set}, ${i}, this)">
          <span>-</span>
          <input type="number" value="${b}" oninput="updateScore(${match.set}, ${i}, this)">
        </div>
     
        <div class="${result}">
          ${result.toUpperCase()}
        </div>
      `;

      container.innerHTML += `
        <div class="match-card">
          <div class="left">
            <div class="game-label">${g}</div>
            <div class="teamA">${formatNames(match.teamA)}</div>
            <div class="teamB">${formatNames(match.teamB)}</div>
          </div>

          <div class="right">
            ${rightSide}
            <div id="status-${match.set}-${i}"></div>
          </div>
        </div>
      `;
    });

    container.innerHTML += `</div>`;
  });
}







function editScore(set, current) {
  const newScore = prompt("Edit score", current);
  if (!newScore) return;

  callAPI({
    action: "submitScore",
    set,
    score: newScore
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




async function loadSchedule() {
  const data = await callAPI({ action: "getSchedule" });

  const container = document.getElementById("scheduleList");

  container.innerHTML = data.map(p => `
    <div class="card">
      ${p.name}
      <button onclick="markSent(this)">Text</button>
    </div>
  `).join("");
}

function markSent(btn) {
  btn.innerText = "✓";
  btn.style.background = "#00c853";
}



function showSuccess(id) {
  const el = document.getElementById(id);
  el.innerHTML = `<div class="success">✔ Score Saved</div>`;

  setTimeout(() => el.innerHTML = "", 1500);
}



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


let chart;

async function loadRankings() {
  const data = await callAPI({ action: "getUserTrend" });

  if (!data.length) return;

  const latest = data[data.length - 1];

  document.getElementById("bigStat").innerText =
    (latest.winPct * 100).toFixed(2) + "%";

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data: data.map(p => p.winPct * 100),
        borderColor: "#00c853",
        borderWidth: 3,
        tension: 0.4
      }]
    },
    options: {
      scales: {
        y: {
          ticks: {
            callback: v => v + "%"
          }
        }
      }
    }
  });
}


const pages = ["rankings","schedule","sets","input"];
let currentPage = 0;




async function finishDay() {
  const res = await callAPI({ action: "done" });

  document.getElementById("dayStats").innerHTML = `
    <div class="success">
      ✔ Day Complete<br>
      Wins: ${res.wins || 0}<br>
      Losses: ${res.losses || 0}
    </div>
  `;
}


function toggleMenu() {
  document.getElementById("sideMenu").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("show");
}

let scoreTimeout;

function updateScore(set, gameIndex, input) {
  clearTimeout(scoreTimeout);

  const parent = input.parentElement;
  const inputs = parent.querySelectorAll("input");

  if (inputs.length < 2) return;

  scoreTimeout = setTimeout(() => {
    const score = `${inputs[0].value}-${inputs[1].value}`;

    callAPI({
      action: "submitScore",
      set,
      game: gameIndex + 1,
      score
    });

    showSuccess(`status-${set}-${gameIndex}`);
  }, 500);
}


function navigate(page) {
  showPage(page);
}

window.onload = () => {
  loadSets();
};