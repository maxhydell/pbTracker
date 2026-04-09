const API_URL = "https://script.google.com/macros/s/AKfycbzCja87dn2eWrpOEA5SltOI8XM8tryMFq-fZRnFwIN2Wh0i7IENT-ZKDj49uC_lBywn/exec";

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
  container.innerHTML = "";


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
       <span class="carrot"></span>
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
  setWeekRange();
  console.log("🚀 loadSchedule called");

  const data = await callAPI({ action: "getSchedule" });
  console.log("📦 schedule data:", data);

  if (!data || !Array.isArray(data)) {
    console.error("❌ BAD SCHEDULE DATA:", data);
    document.getElementById("scheduleList").innerHTML = "Failed to load schedule";
    return;
  }


  console.log("📊 SCHEDULE LENGTH:", data.length);

  data.forEach((row, i) => {
    console.log(`Row ${i}:`, row.date, row.players);
  });



  const rankings = await callAPI({ action: "getUserTrend" });

  function getWinPct(name) {
    const p = rankings.find(x =>
      x.name.toLowerCase() === (name || "").toLowerCase()
    );
    return p?.winPct || 0;
  }

  const container = document.getElementById("scheduleList");

  if (!data.length) {
    console.warn("⚠️ No schedule for this week");
    container.innerHTML = "No games scheduled this week";
    return;
  }

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
    console.log("Row:", row);
    const d = new Date(row.date);
    const dayName = d.toLocaleDateString("en-US",{weekday:"long"});

    if (!data.length) {
      container.innerHTML = "No schedule found";
      return;
    }

    const players = row.players
      .filter(Boolean)
      .map(p => p ? capitalize(p) : "")
      .join(", ");

    return `
      <div class="day-card">
        <div class="day-header" onclick="toggleSet(this)">
          <div>
            <div class="day-players">${players}</div>
            <div class="day-name">${dayName}</div>
          </div>

          ${i === topDayIndex ? `<div class="tag">Top Day</div>` : ""}

          <div class="carrot"></div>
        </div>

        <div class="day-body">
          ${[0,1,2,3].map(col => {
            const status = row.status?.[col] || 0;

            let img = "white.png";
            if (status == 1) img = "orange.png";
            if (status == 2) img = "green.png";

            return `
              <div class="player-slot">
                <input class="player-input"
                  placeholder="Add player..."
                  ${status == 2 ? "disabled style='border:2px solid #00c853'" : ""}
                  onfocus="attachAutocomplete(this, '${row.date}', ${col+3})">

                <img src="imessage.png" class="sms-btn"
                  ${status == 2 ? "style='display:none'" : ""}
                  onclick="sendSMS(this, '${row.date}', ${col+1})">

                <img src="${img}" class="check-btn"
                  data-state="${status}"
                  onclick="toggleCheck(this, '${row.date}', ${col+1})">
              </div>
            `;
          }).join("")}
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
  if (!select.dataset.loaded) {
    select.innerHTML = data.map(p =>
      `<option value="${p.name.toLowerCase()}">${capitalize(p.name)}</option>`
    ).join("");

    select.dataset.loaded = "true";
  }

  // DEFAULT SELECT
  if (!select.value) {
    select.value = selectedPlayer;
  }

  selectedPlayer = select.value;

  selectedPlayer = select.value;
  const player = data.find(p => p.name.toLowerCase() === selectedPlayer);

  // BIG STAT
  document.getElementById("bigStat").innerText =
    Math.round(player.winPct * 100) + "%";


  //analytics

  const history = await callAPI({ action: "getHistory" });
  renderDashboardAnalytics(history, selectedPlayer);

  const streak = getWinStreak(history, selectedPlayer);
  const best = getBestDay(history, selectedPlayer);
  const consistency = getConsistency(history, selectedPlayer);

  document.getElementById("analytics").innerHTML = `
    <div>🔥 Streak: ${streak}</div>
    <div>🏆 Best: ${best ? Math.round(best.winPct*100)+"%" : "--"}</div>
    <div>📊 Consistency: ${consistency}%</div>
  `;



  // RANK
  const rank = data.findIndex(p => p.name === player.name) + 1;
  document.getElementById("topPercent").innerText =
    `#${rank} Place`;

  // GRAPH DATA


const playerHistory = history
  .filter(p => p.name.toLowerCase() === selectedPlayer)
  .slice(-30)   // 🔥 HUGE SPEED BOOST
  .map(p => ({
    date: new Date(p.date).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric"
    }),
    value: Math.round(p.winPct * 100)
  }));
  


const values = playerHistory.map(x => x.value);

const latest = values[values.length - 1] || 50;

const max = latest + 8;
const min = latest - 8;


if (chart) chart.destroy();
chart = new Chart(document.getElementById("chart"), {
  type: "line",
  data: {
    labels: playerHistory.map(x => x.date),
    datasets: [{
      data: values,
      borderWidth: 3,
      tension: 0.4
    }]
  },
  options: {
    layout: {
      padding: {
        top: 0,
        bottom: 0
      }
    },
    scales: {
      y: {
        min,
        max,
        ticks: {
          callback: v => v + "%"
        }
      }
    },
    plugins: {
      legend: { display: false }
    }
  }
});
  const filtered = data.filter(p =>
    p.winPct > 0 || p.pointsAvg > 0
  );

  renderLeaderboard(filtered);
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
        <div class="leaderboard-row ${p.name.toLowerCase() === selectedPlayer ? "you" : ""}">
          <span>${i + 1}</span>
          <span>${capitalize(p.name)}</span>
          <span>${Math.round(p.winPct * 100)}%</span>
          <span>${p.pointsAvg.toFixed(2)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

async function getHistory() {
  return await callAPI({ action: "getHistory" });
}

async function finishDay() {
  await callAPI({ action: "saveHistory" });
  const res = await callAPI({ action: "done" });


  document.getElementById("dayStats").innerHTML = `
    <div class="success">
      ✔ Day Complete<br>
      Wins: ${res.wins || 0}<br>
      Losses: ${res.losses || 0}
    </div>
  `;
}


function getWinStreak(history, player) {
  const games = history
    .filter(p => p.name.toLowerCase() === player)
    .map(p => p.winPct);

  let streak = 0;

  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i] > 0.5) streak++;
    else break;
  }

  return streak;
}


function getBestDay(history, player) {
  const games = history
    .filter(p => p.name.toLowerCase() === player);

  if (!games.length) return null;

  return games.reduce((best, curr) =>
    curr.winPct > best.winPct ? curr : best
  );
}


function getConsistency(history, player) {
  const games = history
    .filter(p => p.name.toLowerCase() === player)
    .map(p => p.winPct);

  if (games.length < 2) return 0;

  const avg = games.reduce((a, b) => a + b, 0) / games.length;

  const variance = games.reduce((sum, val) =>
    sum + Math.pow(val - avg, 2), 0
  ) / games.length;

  const stdDev = Math.sqrt(variance);

  return Math.round((1 - stdDev) * 100);
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


function setWeekRange() {
  const today = new Date();

  const day = today.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const format = d =>
    `${d.getMonth()+1}/${d.getDate()}`;

  const el = document.getElementById("weekRange");
  if (el) {
    el.innerText = `${format(monday)} - ${format(friday)}`;
  }
}



function updateScore(set, gameIndex, input) {
  clearTimeout(scoreTimeout);

  const parent = input.parentElement;
  const inputs = parent.querySelectorAll("input");

  if (inputs.length < 2) return;

  scoreTimeout = setTimeout(() => {
    const score = `${inputs[0].value}-${inputs[1].value}`;
    const a = Number(inputs[0].value);
    const b = Number(inputs[1].value);

    if (a === 0 && b === 0) {
      callAPI({
        action: "submitScore",
        set,
        game: gameIndex + 1,
        score: ""
      });
      return;
    }
    input.blur();

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



function renderDashboardAnalytics(history, player) {
  const games = history.filter(p => p.name.toLowerCase() === player);

  if (!games.length) return;

  const avgWin = games.reduce((a,b)=>a+b.winPct,0)/games.length;
  const avgPoints = games.reduce((a,b)=>a+b.pointsAvg,0)/games.length;

  const best = getBestDay(history, player);
  const streak = getWinStreak(history, player);

  document.getElementById("dashboardAnalytics").innerHTML = `
    <div class="analytics-card green">🔥 Win %: ${Math.round(avgWin*100)}%</div>
    <div class="analytics-card blue">🎯 Avg Pts: ${avgPoints.toFixed(1)}</div>
    <div class="analytics-card yellow">🏆 Best Day: ${best ? Math.round(best.winPct*100)+"%" : "--"}</div>
    <div class="analytics-card red">📉 Streak: ${streak}</div>
  `;
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


  const history = await callAPI({ action: "getHistory" });
  renderDashboardAnalytics(history, selectedPlayer);

  // ALWAYS RUN THIS
  const loading = document.getElementById("loading-screen");
  if (loading) {
    loading.style.opacity = "0";
    setTimeout(() => loading.style.display = "none", 500);
  }
};
