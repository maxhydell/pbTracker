const API_URL = "https://script.google.com/macros/s/AKfycby9lQdVz4faaPjk7_XtAgnOIbVR2aFzy4ln4CzSH0LfdYf2w8xR0qqH_c9rRA83xEwz/exec";

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
    .split("/")
    .map(n => n.trim().charAt(0).toUpperCase() + n.trim().slice(1).toLowerCase())
    .join(" & ");
}

async function callAPI(params) {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}?${query}`);
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      console.error("INVALID JSON:", text);
      return null;
    }
  } catch (err) {
    console.error("API ERROR:", err);
    return null;
  }
}

async function loadSets() {
  const data = await callAPI({ action: "getTodaySets" });
  log("SETS DATA", data);

  const container = document.querySelector("#input #setsContainer");
  if (!container) return;


  if (!data || !Array.isArray(data)) {
    container.innerHTML = "No matches found";
    return;
  }






  data.forEach(match => {
    // Creating the container for the specific Set
    const setWrapper = document.createElement("div");
    setWrapper.className = "set-container";
    setWrapper.innerHTML = `<div class="set-title">Round ${match.set}</div>`;

    const games = ["G1", "G2", "G3"];

    games.forEach((g, i) => {
      const score = match.scores?.[i] || "0-0";
      let a = 0, b = 0;

      if (score && score.includes("-")) {
        const parts = score.split("-");
        a = Number(parts[0]);
        b = Number(parts[1]);
      }

      let result = "tie";
      if (Number(a) > Number(b)) result = "win";
      else if (Number(b) > Number(a)) result = "loss";



      // Match Card structured like the screenshot
      const matchCard = `
        <div class="match-card">
          <div class="left-content">
            <div class="team-row">
              <span class="team-names">${formatNames(match.teamA)}</span>
              <span class="status-badge ${result}">${result}</span>
            </div>
            <div class="opponents">
              ${formatNames(match.teamB)}
            </div>
          </div>

          <div class="right-content">
            <div class="score-editable">
              <input type="number" inputmode="numeric"
                value="${a === 0 ? '' : a}" 
                oninput="updateScore(${match.set}, ${i}, this)" 
                onblur="this.blur()">
              <span class="score-separator">-</span>
              <input type="number" inputmode="numeric"
                value="${b === 0 ? '' : b}" 
                oninput="updateScore(${match.set}, ${i}, this)" 
                onblur="this.blur()">
            </div>
            <div class="meta-info">Game ${i+1} • Set ${match.set}</div>
            <div id="status-${match.set}-${i}"></div>
          </div>
        </div>
      `;
      setWrapper.innerHTML += matchCard;
    });

    container.appendChild(setWrapper);
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
    input.blur();
    const a = Number(inputs[0].value);
    const b = Number(inputs[1].value);

    let result = "tie";
    if (a > b) result = "win";
    else if (b > a) result = "loss";

    const card = input.closest(".match-card");
    if (!card) return;

    const badge = card.querySelector(".status-badge");
    if (!badge) return;

    badge.className = `status-badge ${result}`;
    badge.innerText = result;

    console.log("📤 Sending score:", {
      set,
      game: gameIndex + 1,
      score
    });

    callAPI({
      action: "submitScore",
      set,
      game: gameIndex + 1,
      score
    }).then(res => {
      console.log("✅ API RESPONSE:", res);
    });

    showSuccess(`status-${set}-${gameIndex}`);
  }, 500);
}


function navigate(page) {
  showPage(page);
}

window.onload = async () => {
  try {
    await loadSets();
  } catch (err) {
    console.error("LOAD FAILED", err);
  }

  // ALWAYS RUN THIS
  const loading = document.getElementById("loading-screen");
  if (loading) {
    loading.style.opacity = "0";
    setTimeout(() => loading.style.display = "none", 500);
  }
};