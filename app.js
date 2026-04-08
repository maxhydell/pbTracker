const API_URL = "https://script.google.com/macros/s/AKfycbweKxdOu42O-C_AgIXxlHNSDssomGa_7IJi2XaCU4HdwDvGjDNVCQz_Nj1THSe9fFRB/exec";

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



let playersCache = [];

async function loadPlayers() {
  playersCache = await callAPI({ action: "getPlayers" });
}


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
    setWrapper.innerHTML = `
      <div class="set-header" onclick="toggleSet(this)">
        <span>Set ${match.set}</span>
       <span class="carrot">⌄</span>
      </div>
      <div class="set-body"></div>
    `;

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
      setWrapper.querySelector(".set-body").innerHTML += matchCard;
    });

    container.appendChild(setWrapper);
  });


}



function toggleSet(el) {
  const body = el.nextElementSibling;

  el.classList.toggle("active");

  body.style.display =
    body.style.display === "none" ? "block" : "none";
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


function sendSMS(btn, date, col) {
  const input = btn.parentElement.querySelector("input");
  const name = input.value;

  const player = playersCache.find(p =>
    p.name.toLowerCase() === name.toLowerCase()
  );

  if (!player || !player.phone) return alert("No phone");

  const day = new Date(date).toLocaleDateString("en-US",{weekday:"long"});

  const messages = [
    `Hey do you want to play 6:30am @ the Y ${day}?`,
    `Can you play 6:30am @ the Y ${day}?`,
    `Are you in for 6:30am @ the Y ${day}?`
  ];

  const msg = messages[Math.floor(Math.random()*messages.length)];

  const link = `https://maxhydell.github.io/smsLinker/?to=${encodeURIComponent(player.phone)}&body=${encodeURIComponent(msg)}`;

  window.open(link, "_blank");

  // auto mark as sent
  const check = btn.parentElement.querySelector(".check-btn");
  check.src = "orange.png";
  check.dataset.state = 1;

  callAPI({
    action: "updatePlayerStatus",
    date,
    col,
    status: 1
  });
}



async function addPlayerPrompt() {
  const name = prompt("Name");
  const phone = prompt("Phone");
  const rating = prompt("Rating");

  if (!name) return;

  document.body.innerHTML += `<div class="loading">Adding...</div>`;

  await callAPI({
    action: "addPlayer",
    name,
    phone,
    rating
  });

  location.reload();
}



function toggleCheck(btn, date, col) {
  const input = btn.parentElement.querySelector("input");

  let state = Number(btn.dataset.state || 0);

  if (state === 0) {
    btn.src = "orange.png";
    btn.dataset.state = 1;

    callAPI({
      action: "updatePlayerStatus",
      date,
      col,
      status: 1
    });

    return;
  }

  if (state === 1) {
    btn.src = "green.png";
    btn.dataset.state = 2;

    input.disabled = true;
    input.style.border = "2px solid #00c853";

    callAPI({
      action: "updatePlayerStatus",
      date,
      col,
      status: 2
    });
  }
}


function openAddPlayer() {
  document.getElementById("addModal").style.display = "flex";
}

async function submitNewPlayer() {
  const name = newName.value;
  const phone = newPhone.value;
  const rating = newRating.value;

  await callAPI({
    action: "addPlayer",
    name,
    phone,
    rating
  });

  location.reload();
}


async function loadSchedule() {
  const data = await callAPI({ action: "getSchedule" });

  function getWinPct(name) {
    const p = rankings.find(x =>
      x.name.toLowerCase() === (name || "").toLowerCase()
    );
    return p?.winPct || 0;
  }

  const container = document.getElementById("scheduleList");

  let topDayIndex = -1;
  let bestAvg = 0;

  data.forEach((row, i) => {
    const vals = row.players
      .map(p => getWinPct(p))
      .filter(v => v > 0);

    const avg = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : 0;

    if (avg > bestAvg) {
      bestAvg = avg;
      topDayIndex = i;
    }
  });

  container.innerHTML = data.map((row, i) => {
    const d = new Date(row.date);
    const dayName = d.toLocaleDateString("en-US",{weekday:"long"});

    const players = row.players
      .filter(Boolean)
      .map(p => capitalize(p))
      .join(", ");

    return `
      <div class="day-card">
        <div class="day-header" onclick="toggleSet(this)">
          <div>
            <div class="day-players">${players}</div>
            <div class="day-name">${dayName}</div>
          </div>

          ${i === topDayIndex ? `<div class="tag">Top Day</div>` : ""}

          <div class="carrot">⌄</div>
        </div>

        <div class="day-body">
          ${[0,1,2,3].map(col => `
            <div class="player-slot">
              <input class="player-input"
                placeholder="Add player..."
                onfocus="attachAutocomplete(this, '${row.date}', ${col+3})">

              <img src="imessage.png" class="sms-btn" onclick="sendSMS(this)">
              <img src="white.png" class="check-btn" onclick="toggleCheck(this)">
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
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

let selectedPlayer = "max";

async function loadRankings() {
  const data = await callAPI({ action: "getUserTrend" });
  if (!data || !data.length) return;

  // SORT BY WIN %
  data.sort((a, b) => b.winPct - a.winPct);

  // POPULATE DROPDOWN
  const select = document.getElementById("playerSelect");
  select.innerHTML = data.map(p =>
    `<option value="${p.name.toLowerCase()}">${capitalize(p.name)}</option>`
  ).join("");

  // DEFAULT SELECT
  select.value = selectedPlayer;

  const player = data.find(p => p.name.toLowerCase() === select.value);
  selectedPlayer = select.value;

  // BIG STAT
  document.getElementById("bigStat").innerText =
    (player.winPct * 100).toFixed(2) + "%";

  // RANK
  const rank = data.findIndex(p => p.name === player.name) + 1;
  document.getElementById("topPercent").innerText =
    `#${rank} Place`;

  // GRAPH DATA
  const values = data.map(p => p.winPct * 100);

  const max = Math.max(...values) + 8;
  const min = Math.min(...values) - 8;

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: {
      labels: data.map(p => capitalize(p.name)),
      datasets: [{
        data: values,
        borderColor: "#00c853",
        borderWidth: 3,
        tension: 0.4
      }]
    },
    options: {
      scales: {
        y: {
          min,
          max,
          ticks: {
            callback: v => v + "%"
          }
        }
      }
    }
  });

  renderLeaderboard(data);
}

function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}


const pages = ["rankings","schedule","sets","input"];
let currentPage = 0;


function renderLeaderboard(data) {
  const container = document.getElementById("leaderboard");

  container.innerHTML = `
    <div class="leaderboard">
      <div class="leaderboard-header">
        <span>Rank</span>
        <span>Player</span>
        <span>Win %</span>
        <span>Points Avg.</span>
      </div>

      ${data.map((p, i) => `
        <div class="leaderboard-row ${p.name.toLowerCase() === "max" ? "you" : ""}">
          <span>${i + 1}</span>
          <span>${capitalize(p.name)}</span>
          <span>${(p.winPct * 100).toFixed(2)}%</span>
          <span>${p.pointsAvg.toFixed(2)}</span>
        </div>
      `).join("")}
    </div>
  `;
}



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

function attachAutocomplete(input, date, col) {
  const dropdown = document.createElement("div");
  dropdown.className = "autocomplete";

  input.parentNode.appendChild(dropdown);

  input.addEventListener("input", () => {
    const val = input.value.toLowerCase();

    dropdown.innerHTML = playersCache
      .filter(p => p.name.toLowerCase().includes(val))
      .slice(0, 5)
      .map(p => `<div class="auto-item">${capitalize(p.name)}</div>`)
      .join("");

    dropdown.querySelectorAll(".auto-item").forEach(el => {
      el.onclick = () => {
        input.value = el.innerText;
        dropdown.innerHTML = "";

        callAPI({
          action: "updateSchedule",
          date,
          col,
          name: el.innerText
        });
      };
    });
  });
}


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
    await loadPlayers();
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