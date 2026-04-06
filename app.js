const API_URL = "https://script.google.com/macros/s/AKfycbxNEkhPV65x6JJt6QFHIJQysuTYN8egIia-lhvGT2ZyRoRosF6V-ZMesqkH9jepv6kd/exec";

function log(label, data) {
  console.log("🔥", label, data);
}

let startY = 0;

document.addEventListener("touchstart", e => {
  startY = e.touches[0].clientY;
});

document.addEventListener("touchend", e => {
  const endY = e.changedTouches[0].clientY;

  if (endY - startY > 100) {
    location.reload();
  }
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

  if (id === "rankings") loadRankings();
  if (id === "schedule") loadSchedule();
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
  log("SETS DATA", data);

  const container = document.getElementById("setsContainer");

  container.innerHTML = `
    <h2 class="section-title">Pool Play Matches</h2>
  `;

  data.forEach(match => {
    const score = match.score || "";
    const complete = score.includes("-");

    let scoreHTML = "";

    if (!complete) {
      scoreHTML = `
        <div class="score-box">
          <input type="number" placeholder="0" oninput="handleScoreInput(${match.set}, this)">
          <span>-</span>
          <input type="number" placeholder="0" oninput="handleScoreInput(${match.set}, this)">
        </div>
      `;
    } else {
      scoreHTML = `
        <div class="score-display" onclick="editScore(${match.set}, '${score}')">
          ${score}
        </div>
      `;
    }

    container.innerHTML += `
      <div class="match-row">
        <div class="teams">
          <div class="teamA">${match.teamA}</div>
          <div class="teamB">${match.teamB}</div>
        </div>

        <div class="score-area">
          ${scoreHTML}
          <div id="status-${match.set}"></div>
        </div>
      </div>
    `;
  });
}


function handleScoreInput(set, input) {
  const parent = input.parentElement;
  const inputs = parent.querySelectorAll("input");

  if (inputs[0].value && inputs[1].value) {
    const score = `${inputs[0].value}-${inputs[1].value}`;

    callAPI({
      action: "score",
      set,
      game: 1,
      score
    });

    showSuccess(`status-${set}`);
    loadSets();
  }
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


function editScore(set, current) {
  const newScore = prompt("Edit score", current);
  if (!newScore) return;

  callAPI({
    action: "score",
    set,
    game: 1,
    score: newScore
  });

  loadSets();
}



async function saveScore(set, input, team) {
  const parent = input.parentElement;
  const inputs = parent.querySelectorAll("input");

  if (inputs[0].value && inputs[1].value) {
    const score = `${inputs[0].value}-${inputs[1].value}`;

    await callAPI({
      action: "score",
      set,
      game: 1,
      score
    });

    showSuccess(`status-${set}`);
    loadSets();
  }
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



async function loadSchedule() {
  const data = await callAPI({ action: "week" });

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
  el.innerHTML = `<div class="success">✔ Saved</div>`;

  setTimeout(() => el.innerHTML = "", 1500);
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


let chart;

async function loadRankings() {
  const data = await callAPI({ action: "getUserTrend" });
  log("RANKINGS DATA", data);

  if (!data || data.length === 0) return;

  const latest = data[data.length - 1];

  document.getElementById("bigStat").innerText = latest.winPct.toFixed(2);
  document.getElementById("topPercent").innerText = "Top 6%";

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data: data.map(p => p.winPct),
        borderColor: "#00c853",
        borderWidth: 3,
        tension: 0.4,
        pointRadius: 3
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}


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

function navigate(page) {
  showPage(page);
  document.getElementById("sideMenu").classList.remove("open");
  document.getElementById("overlay").classList.remove("show");
  toggleMenu(); // closes it
}

window.onload = () => {
  loadSets();
};