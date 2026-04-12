const API_URL = "https://script.google.com/macros/s/AKfycbw4Najwv5fh84LSBnq3a3415zdQPME-dyBcwFdg1oyyj6vdjYGxEkvABs2HgUkx1qtE/exec";

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
let historyCache = [];
let selectedPlayer = "max";
let playerSelectTouched = false;
let lastTodaySetsData = null;

const LS_DAY_COMPLETE = "pbTracker_dayComplete";
const LS_PLAYER_PREF = "pbTracker_playerPref_v1";
const LS_MORNING_WINPCT = "pbTracker_morningWinPct";



const player =
  getPlayerFromURL() ||
  localStorage.getItem("player");

document.getElementById("greetingText").innerText =
  getGreeting(player);

const urlPlayer = getPlayerFromURL();
const storedPlayer = localStorage.getItem("player");

if (!urlPlayer && !storedPlayer) {
  document.getElementById("namePrompt").style.display = "block";
}


function getGreeting(name) {
  const hour = new Date().getHours();

  let greeting = hour < 12 ? "Good Morning" : "Good Afternoon";

  return name ? `${greeting} ${capitalize(name)}.` : greeting;
}
function saveName() {
  const name = document.getElementById("nameInput").value.toLowerCase();
  if (!name) return;

  localStorage.setItem("player", name);
  location.reload();
}


function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isDayComplete() {
  return localStorage.getItem(LS_DAY_COMPLETE) === todayKey();
}

function setDayComplete(on) {
  if (on) localStorage.setItem(LS_DAY_COMPLETE, todayKey());
  else localStorage.removeItem(LS_DAY_COMPLETE);
}

function getPreferredPlayerFromStorage() {
  const v = (localStorage.getItem(LS_PLAYER_PREF) || "").trim().toLowerCase();
  return v || null;
}

function setPreferredPlayer(name) {
  if (!name) return;
  localStorage.setItem(LS_PLAYER_PREF, String(name).trim().toLowerCase());
}

function getMorningWinPctSnapshot(trendData) {
  const today = todayKey();
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(LS_MORNING_WINPCT) || "null");
  } catch (e) {
    parsed = null;
  }
  if (parsed && parsed.date === today && parsed.pcts && typeof parsed.pcts === "object") {
    return parsed.pcts;
  }
  const pcts = {};
  (trendData || []).forEach(p => {
    pcts[p.name.toLowerCase()] = Number(p.winPct) || 0;
  });
  localStorage.setItem(LS_MORNING_WINPCT, JSON.stringify({ date: today, pcts }));
  return pcts;
}

function resolveSelectedPlayer(trendData) {
  const urlP = getPlayerFromURL();
  if (urlP && trendData?.some(p => p.name.toLowerCase() === urlP)) return urlP;
  const stored = getPreferredPlayerFromStorage();
  if (stored && trendData?.some(p => p.name.toLowerCase() === stored)) return stored;
  if (trendData?.some(p => p.name.toLowerCase() === "max")) return "max";
  return (trendData?.[0]?.name || "max").toLowerCase();
}

function sortPlayersForDropdown(data) {
  return [...data].sort((a, b) => {
    if (a.name.toLowerCase() === "max") return -1;
    if (b.name.toLowerCase() === "max") return 1;
    return b.winPct - a.winPct;
  });
}

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
  if (id === "input" || id === "sets") loadTodaySetsAll();
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

function renderSetsInto(container, data, opts = {}) {
  if (!container) return;
  const locked = opts.locked === true || isDayComplete();
  container.innerHTML = "";

  if (!data || !Array.isArray(data)) {
    container.innerHTML = "No matches found";
    return;
  }

  data.forEach(match => {
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

      const game1 = match.scores?.[0] || "";
      const game2 = match.scores?.[1] || "";

      const isGame3Locked =
        !locked &&
        i === 2 &&
        game1.includes("-") &&
        game2.includes("-") &&
        (
          (Number(game1.split("-")[0]) > Number(game1.split("-")[1]) &&
           Number(game2.split("-")[0]) > Number(game2.split("-")[1])) ||
          (Number(game1.split("-")[1]) > Number(game1.split("-")[0]) &&
           Number(game2.split("-")[1]) > Number(game2.split("-")[0]))
        );

      if (score && score.includes("-")) {
        const parts = score.split("-");
        a = Number(parts[0]);
        b = Number(parts[1]);
      }

      let result = "tie";
      if (Number(a) > Number(b)) result = "win";
      else if (Number(b) > Number(a)) result = "loss";

      const inputDisabled = locked || isGame3Locked;

      const matchCard = `
        <div class="match-card ${isGame3Locked ? "locked" : ""} ${locked ? "day-locked-card" : ""}">
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
                ${inputDisabled ? "disabled" : ""}
                value="${a === 0 ? '' : a}" 
                oninput="updateScore(${match.set}, ${i}, this)" 
                onblur="this.blur()">
              <span class="score-separator">-</span>
              <input type="number" inputmode="numeric"
                ${inputDisabled ? "disabled" : ""}
                value="${b === 0 ? '' : b}" 
                oninput="updateScore(${match.set}, ${i}, this)" 
                onblur="this.blur()">
            </div>

            ${isGame3Locked && !locked ? `
              <div style="text-align:right; margin-top:4px;">
                <img src="unlock.png"
                  onclick="unlockGame(${match.set}, ${i})"
                  style="width:14px; opacity:0.7; cursor:pointer;">
              </div>
            ` : ""}

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

async function loadTodaySetsAll() {
  const data = await callAPI({ action: "getTodaySets" });
  log("SETS DATA", data);
  lastTodaySetsData = data;
  const locked = isDayComplete();
  const targets = [
    document.querySelector("#input #setsContainer"),
    document.getElementById("setsList")
  ].filter(Boolean);
  targets.forEach(el => renderSetsInto(el, data, { locked }));
  restoreResultsIfAny();
  updateDoneUiVisibility();
}

function updateDoneUiVisibility() {
  const done = isDayComplete();
  const btn = document.getElementById("doneBtn");
  const rev = document.getElementById("revertDayBtn");
  if (btn) btn.style.display = done ? "none" : "block";
  if (rev) rev.style.display = done ? "block" : "none";
}

function restoreResultsIfAny() {
  if (!isDayComplete()) return;
  const html = localStorage.getItem(`pbTracker_results_${todayKey()}`);
  const el = document.getElementById("dayResults");
  if (html && el) {
    el.innerHTML = html;
    el.style.display = "block";
  }
}


function unlockGame(set, gameIndex) {
  const inputs = document.querySelectorAll(`[data-set="${set}"][data-game="${gameIndex}"] input`);
  inputs.forEach(i => {
    i.disabled = false;
    i.style.opacity = 1;
    i.style.filter = "none";
  });
}


function toggleSet(el) {
  const body = el.nextElementSibling;
  if (!body) return;

  const card = el.closest(".day-card") || el.closest(".set-container");
  const isOpen = body.classList.contains("open");

  document.querySelectorAll(".day-body, .set-body").forEach(b => {
    b.style.maxHeight = null;
    b.classList.remove("open");
  });

  document.querySelectorAll(".day-card, .set-container").forEach(c => {
    c.classList.remove("expanded");
  });

  document.querySelectorAll(".day-header, .set-header").forEach(h => {
    h.classList.remove("active");
  });

  if (!isOpen) {
    body.classList.add("open");
    el.classList.add("active");
    if (card) card.classList.add("expanded");
    body.style.maxHeight = body.scrollHeight + "px";
  }
}


function editScore(set, current) {
  const newScore = prompt("Edit score", current);
  if (!newScore) return;

  callAPI({
    action: "submitScore",
    set,
    score: newScore
  });

  loadTodaySetsAll();
}


function sendSMS(btn, date, col) {
  const input = btn.parentElement.querySelector("input");
  const name = (input.value || "").trim();
  if (!name) return alert("Enter a name first");

  const player = playersCache.find(p =>
    p.name.toLowerCase().includes(name.toLowerCase())
  );

  if (!player || !player.phone) return alert("No phone");

  const day = new Date(date).toLocaleDateString("en-US",{weekday:"long"});

  const messages = [
    `Hey do you want to play 6:30am @ the Y ${day}?`,
    `Can you play 6:30am @ the Y ${day}?`,
    `Are you in for 6:30am @ the Y ${day}?`
  ];

  const msg = messages[Math.floor(Math.random()*messages.length)];

  const phone = player.phone.startsWith("+1")
    ? player.phone
    : "+1" + player.phone.replace(/\D/g, "");

  const payload = `${phone}|${msg}`;


  const link = `shortcuts://run-shortcut?name=SMS&input=text&text=${encodeURIComponent(payload)}`;

  window.location.href = link;

  // auto mark as sent
  const check = btn.parentElement.querySelector(".check-btn");
  check.src = "orange.png";
  check.dataset.state = 1;

  callAPI({
    action: "updateSchedule",
    date,
    col,
    status: 1
  }).then(() => {

    // 🔥 if editing TODAY → reload sets instantly
    const today = new Date().toDateString();
    const selected = new Date(date).toDateString();

    if (today === selected) {
      loadTodaySetsAll();
    }

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
    }).then(() => {
      loadSchedule(); // 🔥 FORCE REFRESH FROM SERVER
    });
    return; // 🔥 IMPORTANT
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
    }).then(() => {
      loadSchedule(); // 🔥 FORCE REFRESH FROM SERVER
    });

    setTimeout(() => {
      checkFullDay(date);
    }, 300);
  }
}


function checkFullDay(date) {
  const card = document.querySelector(`.day-card[data-date="${date}"]`);
  if (!card) return;

  const checks = card.querySelectorAll(".check-btn");
  const allGreen = [...checks].every(c => c.dataset.state == 2);

  if (allGreen && !card.classList.contains("day-complete")) {
    card.classList.add("day-complete");

    callAPI({
      action: "saveScheduleDay",
      date
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
      return "";
    }

    const players = row.players
      .filter(Boolean)
      .map(p => p ? capitalize(p) : "")
      .join(", ");

   
    const allConfirmed = row.status && row.status.every(s => s == 2);
    return `
      <div class="day-card ${allConfirmed ? "day-complete" : ""}" data-date="${row.date}">
        <div class="day-header" onclick="toggleSet(this)">
          <div class="day-name">${dayName}</div>

          ${i === topDayIndex ? `<div class="tag">Top Day</div>` : ""}

          <div class="carrot"></div>
        </div>

        <div class="day-body">
          <div class="player-row">
            ${[0,1,2,3].map(col => {
              const status = row.status?.[col] || 0;

              let img = "white.png";
              if (status == 1) img = "orange.png";
              if (status == 2) img = "green.png";

              return `
                <div class="player-slot">
                  <input class="player-input"
                    value="${row.players?.[col] ? capitalize(row.players[col]) : ""}"
                    ${status !== 0 ? "disabled" : ""}
                    ${status == 2 ? `style="border:2px solid #00c853"` : ""}
                    onfocus="attachAutocomplete(this, '${row.date}', ${col+1})">

                  ${status == 2 ? `
                    <img src="unlock.png" class="sms-btn"
                      onclick="unlockPlayer(this, '${row.date}', ${col+1})">
                  ` : `
                    <img src="imessage.png" class="sms-btn"
                      onclick="sendSMS(this, '${row.date}', ${col+1})">
                  `}

                  <img src="${img}" class="check-btn"
                    data-state="${status}"
                    onclick="toggleCheck(this, '${row.date}', ${col+1})">
                </div>
              `;
            }).join("")}
          </div>
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

function getPlayerFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("p")?.toLowerCase();
}

async function loadRankings() {
  const data = await callAPI({ action: "getUserTrend" });
  if (!data || !data.length) return;

  getMorningWinPctSnapshot(data);

  const sorted = [...data].sort((a, b) => b.winPct - a.winPct);
  const dropdownSorted = sortPlayersForDropdown(data);
  console.log("RAW DATA:", data);

  const select = document.getElementById("playerSelect");
  if (select) {
    select.innerHTML = dropdownSorted.map(p =>
      `<option value="${p.name.toLowerCase()}">${capitalize(p.name)}</option>`
    ).join("");

    const pick =
      playerSelectTouched && data.some(p => p.name.toLowerCase() === selectedPlayer)
        ? selectedPlayer
        : resolveSelectedPlayer(data);
    select.value = pick;
    selectedPlayer = pick;
  }

  const player = data.find(p => p.name.toLowerCase() === selectedPlayer);
  if (!player) return;

  const bigStatEl = document.getElementById("bigStat");
  if (bigStatEl) {
    bigStatEl.innerText = formatWinPctDisplay(player.winPct);
  }

  if (!historyCache.length) {
    historyCache = await callAPI({ action: "getHistory" });
  }

  await renderDashboardAnalytics(selectedPlayer);

  const rank = sorted.findIndex(p => p.name === player.name) + 1;
  document.getElementById("topPercent").innerText =
    `#${rank} Place`;

  const playerHistory = historyCache
    .filter(p => p.name.toLowerCase() === selectedPlayer)
    .slice(-30)
    .map(p => ({
      date: new Date(p.date).toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric"
      }),
      value: Number((p.winPct * 100).toFixed(1))
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

  const filtered = [...data].filter(p =>
    p.winPct > 0 || p.pointsAvg > 0
  ).sort((a, b) => b.winPct - a.winPct);

  renderLeaderboard(filtered);
}

function formatWinPctDisplay(winPct) {
  return `${(Number(winPct) * 100).toFixed(1)}%`;
}

async function onRankingsPlayerChange() {
  playerSelectTouched = true;
  const select = document.getElementById("playerSelect");
  if (select) selectedPlayer = select.value;
  const dash = document.getElementById("dashPlayerSelect");
  if (dash) dash.value = selectedPlayer;
  await loadRankings();
}



function unlockPlayer(btn, date, col) {
  const slot = btn.parentElement;
  const input = slot.querySelector("input");

  input.disabled = false;
  input.value = "";
  input.style.border = "";

  btn.src = "imessage.png";

  const check = slot.querySelector(".check-btn");
  check.src = "white.png";
  check.dataset.state = 0;

  callAPI({
    action: "updatePlayerStatus",
    date,
    col,
    status: 0
  });
}



function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}


const pages = ["rankings","schedule","sets","input"];
let currentPage = 0;


function renderLeaderboard(data) {
  data.sort((a,b) => b.winPct - a.winPct); // 🔥 ADD THIS LINE
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
          <span>${formatWinPctDisplay(p.winPct)}</span>
          <span>${(Number.isFinite(Number(p.pointsAvg)) ? Number(p.pointsAvg) : 0).toFixed(2)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

async function getHistory() {
  historyCache = []; // 🔥 force refresh next time
  return await callAPI({ action: "getHistory" });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function computeTodayStandings(setsData) {
  const stats = {};

  function bump(rawNames, pointsScored, won) {
    rawNames.forEach(nm => {
      const trimmed = String(nm || "").trim();
      if (!trimmed) return;
      const k = trimmed.toLowerCase();
      if (!stats[k]) stats[k] = { key: k, displayName: trimmed, wins: 0, points: 0 };
      stats[k].points += pointsScored;
      if (won) stats[k].wins += 1;
    });
  }

  if (!Array.isArray(setsData)) return [];

  setsData.forEach(match => {
    const teamAraw = (match.teamA || "").split("/").map(s => s.trim()).filter(Boolean);
    const teamBraw = (match.teamB || "").split("/").map(s => s.trim()).filter(Boolean);
    (match.scores || []).forEach(score => {
      if (!score || !String(score).includes("-")) return;
      const parts = String(score).split("-");
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      if (Number.isNaN(a) || Number.isNaN(b) || a === b) return;
      const aWins = a > b;
      const bWins = b > a;
      bump(teamAraw, a, aWins);
      bump(teamBraw, b, bWins);
    });
  });

  return Object.values(stats).filter(s => s.wins > 0 || s.points > 0);
}

function buildResultsHtml(standings, morningPcts, afterTrend) {
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();

  function medalFor(i) {
    if (i === 0) return `<span class="result-medal" aria-hidden="true">🏆</span>`;
    if (i === 1) return `<span class="result-medal" aria-hidden="true">🥈</span>`;
    if (i === 2) return `<span class="result-medal" aria-hidden="true">🥉</span>`;
    return `<span class="result-medal result-medal-empty"></span>`;
  }

  const rows = standings.map((s, i) => {
    const trendRow = (afterTrend || []).find(p => p.name.toLowerCase() === s.key);
    const afterPct = trendRow ? Number(trendRow.winPct) : 0;
    const beforePct =
      morningPcts && morningPcts[s.key] != null ? Number(morningPcts[s.key]) : afterPct;
    const delta = (afterPct - beforePct) * 100;
    const deltaStr = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`;
    const cls = delta >= 0 ? "delta-pos" : "delta-neg";
    return `
      <div class="result-rank-row">
        <div class="result-rank-left">
          ${medalFor(i)}
          <span class="result-player-name">${escapeHtml(capitalize(s.displayName))}</span>
        </div>
        <div class="result-rank-right">
          <div class="result-progress-wrap">
            <div class="result-progress-track">
              <span class="result-progress-label ${cls}">${deltaStr}</span>
            </div>
            <div class="result-check-box" aria-hidden="true">✓</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="results-screen">
      <h2 class="results-title">RESULTS</h2>
      <div class="results-day-pill">${dayName}</div>
      <div class="results-card">
        <div class="results-card-head">
          <span class="results-trophy" aria-hidden="true">🏆</span>
          <span class="results-card-title">RANKINGS</span>
        </div>
        <div class="results-card-body">
          ${rows || "<p class=\"results-empty\">No games recorded today.</p>"}
        </div>
      </div>
    </div>
  `;
}

async function finishDay() {

  // 🔥 1. SNAPSHOT BEFORE
  const before = await callAPI({ action: "getUserTrend" });

  // 🔥 2. SAVE DAY + UPDATE STATS (your existing backend logic)
  await callAPI({ action: "saveHistory" });

  // 🔥 3. SNAPSHOT AFTER
  const after = await callAPI({ action: "getUserTrend" });

  // 🔥 4. GET TODAY SETS (for wins + points)
  const sets = await callAPI({ action: "getTodaySets" });

  const results = {};

  // ===== BUILD WINS + POINTS =====
  sets.forEach(set => {
    const teamA = set.teamA.split("/").map(p => p.trim().toLowerCase());
    const teamB = set.teamB.split("/").map(p => p.trim().toLowerCase());

    // init players
    [...teamA, ...teamB].forEach(p => {
      if (!results[p]) results[p] = { wins: 0, points: 0 };
    });

    set.scores.forEach(score => {
      if (!score || !score.includes("-")) return;

      const [a, b] = score.split("-").map(Number);

      teamA.forEach(p => {
        results[p].points += a;
        if (a > b) results[p].wins++;
      });

      teamB.forEach(p => {
        results[p].points += b;
        if (b > a) results[p].wins++;
      });
    });
  });

  // ===== ADD % CHANGE =====
  const final = Object.keys(results).map(name => {

    const beforeP =
      before.find(p => p.name.toLowerCase() === name)?.winPct || 0;

    const afterP =
      after.find(p => p.name.toLowerCase() === name)?.winPct || 0;

    const change = ((afterP - beforeP) * 100).toFixed(2);

    return {
      name,
      wins: results[name].wins,
      points: results[name].points,
      change
    };
  });

  // ===== SORT (wins → points) =====
  final.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.points - a.points;
  });

  // ===== RENDER =====
  renderResults(final);

  const shareId = generateShareId();
  localStorage.setItem("results_" + shareId, JSON.stringify(final));

  const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareId}`;

  showShareButton(shareUrl);

}



function showShareButton(url) {
  const btn = document.createElement("button");
  btn.innerText = "Share Results";
  btn.style.marginTop = "10px";

  btn.onclick = () => {
    navigator.clipboard.writeText(url);
    btn.innerText = "Copied!";
  };

  document.querySelector(".results-card").appendChild(btn);
}

function loadSharedResults() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get("share");

  if (!shareId) return false;

  const data = localStorage.getItem("results_" + shareId);
  if (!data) return false;

  renderResults(JSON.parse(data));
  return true;
}

function renderResults(data) {

  const medals = ["🏆","🥈","🥉",""];
  const bestPlayer = data[0]?.name || "";

  const html = `
    <div class="results-card">

      <div class="results-title">RESULTS</div>
      <div class="results-day">
        ${new Date().toLocaleDateString("en-US",{weekday:"long"}).toUpperCase()}
      </div>

      <div class="results-inner">

        ${data.map((p,i)=>`
          <div class="result-row">

            <div class="left">
              <span class="medal">${medals[i] || ""}</span>
              ${capitalize(p.name)}
            </div>

            <div class="right">

              <div class="progress">
                <div class="fill ${p.change >= 0 ? "green" : "red"}"
                     style="width:${Math.min(Math.abs(p.change)*4,100)}%">
                  ${p.change > 0 ? "+" : ""}${p.change}%
                </div>
              </div>

            </div>

          </div>
        `).join("")}

      </div>

      <button onclick="revertDay()" class="revert-btn">Revert</button>
    </div>
  `;

  // 🔥 REPLACE DONE BUTTON CARD
  document.querySelector("#input .card").innerHTML = html;
}




function generateShareId() {
  return Math.random().toString(36).substring(2, 10);
}


async function revertDay() {
  if (!confirm("Revert finishing today? This clears the results card and unlocks scores (server must support revert).")) return;

  await callAPI({ action: "revertDay" });
  localStorage.removeItem(LS_MORNING_WINPCT);
  setDayComplete(false);
  localStorage.removeItem(`pbTracker_results_${todayKey()}`);
  const box = document.getElementById("dayResults");
  if (box) {
    box.innerHTML = "";
    box.style.display = "none";
  }
  const ds = document.getElementById("dayStats");
  if (ds) ds.innerHTML = "";
  updateDoneUiVisibility();
  await loadTodaySetsAll();
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
  let dropdown = input.parentNode.querySelector(".autocomplete");

  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "autocomplete";
    input.parentNode.appendChild(dropdown);
  }

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
        }).then(() => {
          loadTodaySetsAll();
          loadSchedule();
        });
      };
    });
  });

  // 🔥 FIX: close dropdown on blur
  input.addEventListener("blur", () => {
    setTimeout(() => dropdown.innerHTML = "", 150);
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
  if (isDayComplete()) return;

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
  }, 1000);
}

async function getAllSets() {
  return await callAPI({ action: "getAllSets" });
}

function sortSetsChronologically(sets) {
  if (!Array.isArray(sets)) return [];
  return [...sets].sort((a, b) => {
    const da = a.date || a.day || "";
    const db = b.date || b.day || "";
    if (da !== db) return String(da).localeCompare(String(db));
    return (Number(a.set) || 0) - (Number(b.set) || 0);
  });
}

function countGamesPlayedInSets(sets, player) {
  const pl = String(player).toLowerCase();
  let n = 0;
  (sets || []).forEach(set => {
    const teamA = (set.teamA || "").toLowerCase().split("/").map(s => s.trim());
    const teamB = (set.teamB || "").toLowerCase().split("/").map(s => s.trim());
    (set.scores || []).forEach(score => {
      if (!score || !String(score).includes("-")) return;
      if (teamA.includes(pl) || teamB.includes(pl)) n++;
    });
  });
  return n;
}

function getBestPartner(sets, player) {
  const map = {};

  sets.forEach(set => {
    const teamA = set.teamA.split("/").map(p => p.trim().toLowerCase());
    const teamB = set.teamB.split("/").map(p => p.trim().toLowerCase());

    const allGames = set.scores || [];

    allGames.forEach(score => {
      if (!score.includes("-")) return;

      const [a,b] = score.split("-").map(Number);
      const winnerA = a > b;

      if (teamA.includes(player)) {
        const partner = teamA.find(p => p !== player);
        if (!map[partner]) map[partner] = { wins:0, games:0 };

        map[partner].games++;
        if (winnerA) map[partner].wins++;
      }

      if (teamB.includes(player)) {
        const partner = teamB.find(p => p !== player);
        if (!map[partner]) map[partner] = { wins:0, games:0 };

        map[partner].games++;
        if (!winnerA) map[partner].wins++;
      }
    });
  });

  let best = null, bestPct = 0;

  Object.keys(map).forEach(p => {
    const pct = map[p].wins / map[p].games;
    if (pct > bestPct) {
      bestPct = pct;
      best = p;
    }
  });

  return best;
}

function analyzePlayerFromSets(sets, player) {
  sets = sortSetsChronologically(sets || []);
  player = player.toLowerCase();

  let partnerStats = {};
  let opponentStats = {};
  let gameResults = []; // 1 = win, 0 = loss

  sets.forEach(set => {
    const teamA = (set.teamA || "").toLowerCase().split("/").map(p => p.trim());
    const teamB = (set.teamB || "").toLowerCase().split("/").map(p => p.trim());

    (set.scores || []).forEach(score => {
      if (!score || !score.includes("-")) return;

      const [a, b] = score.split("-").map(Number);
      const winnerA = a > b;

      const isA = teamA.includes(player);
      const isB = teamB.includes(player);
      if (!isA && !isB) return;

      const myTeam = isA ? teamA : teamB;
      const oppTeam = isA ? teamB : teamA;

      const won = (isA && winnerA) || (isB && !winnerA);
      gameResults.push(won ? 1 : 0);

      // ✅ BEST PARTNER
      const partner = myTeam.find(p => p !== player);
      if (partner) {
        if (!partnerStats[partner]) partnerStats[partner] = { wins: 0, games: 0 };
        partnerStats[partner].games++;
        if (won) partnerStats[partner].wins++;
      }

      // ✅ HARDEST OPPONENT
      oppTeam.forEach(o => {
        if (!opponentStats[o]) opponentStats[o] = { wins: 0, games: 0 };
        opponentStats[o].games++;
        if (won) opponentStats[o].wins++;
      });
    });
  });

  // ===== BEST PARTNER =====
  let bestPartner = "--";
  let bestPct = -1;

  Object.entries(partnerStats).forEach(([p, s]) => {
    const pct = s.wins / s.games;
    if (pct > bestPct) {
      bestPct = pct;
      bestPartner = p;
    }
  });

  // ===== HARDEST OPPONENT =====
  let hardestOpponent = "--";
  let worstPct = 2;

  Object.entries(opponentStats).forEach(([o, s]) => {
    const pct = s.wins / s.games;
    if (pct < worstPct) {
      worstPct = pct;
      hardestOpponent = o;
    }
  });

  // ===== WIN / LOSING STREAK =====
  let maxWin = 0, curWin = 0;
  let maxLose = 0, curLose = 0;

  gameResults.forEach(g => {
    if (g === 1) {
      curWin++;
      curLose = 0;
    } else {
      curLose++;
      curWin = 0;
    }
    maxWin = Math.max(maxWin, curWin);
    maxLose = Math.max(maxLose, curLose);
  });

  return {
    bestPartner,
    hardestOpponent,
    winStreak: maxWin,
    loseStreak: maxLose
  };
}



function statLabelName(raw) {
  if (!raw || raw === "--") return "—";
  return capitalize(raw);
}

async function renderDashboardAnalytics(player) {
  const pl = String(player || "max").toLowerCase();
  const trend = await callAPI({ action: "getUserTrend" });
  if (!trend?.length) return;

  const allSets = (await getAllSets()) || [];
  const deep = analyzePlayerFromSets(allSets, pl);
  const playerStats = trend.find(p => p.name.toLowerCase() === pl);
  if (!playerStats) return;

  const winPctStr = formatWinPctDisplay(playerStats.winPct);
  const avgPoints = Number(playerStats.pointsAvg);
  const avgPointsSafe = Number.isFinite(avgPoints) ? avgPoints : 0;
  const gamesPlayed = Number(
    playerStats.gamesPlayed ?? playerStats.games ?? countGamesPlayedInSets(allSets, pl)
  ) || 0;

  const dropdownSorted = sortPlayersForDropdown(trend);

  const html = `
    <div class="analytics-main">

      <div class="analytics-title">Analytics</div>
      <div class="analytics-header">
        <select id="dashPlayerSelect" class="select dash-player-select" onchange="changeDashboardPlayer(this.value)">
          ${dropdownSorted.map(p =>
            `<option value="${p.name.toLowerCase()}" ${p.name.toLowerCase() === pl ? "selected" : ""}>
              ${capitalize(p.name)}
            </option>`
          ).join("")}
        </select>
      </div>

      <div class="analytics-grid-big">

        <div class="stat green">
          <div class="stat-title">Best Partner</div>
          <div class="stat-value">${statLabelName(deep.bestPartner)}</div>
        </div>

        <div class="stat blue">
          <div class="stat-title">Win %</div>
          <div class="stat-value">${winPctStr}</div>
        </div>

        <div class="stat yellow">
          <div class="stat-title">Avg Points</div>
          <div class="stat-value">${avgPointsSafe.toFixed(2)}</div>
        </div>

        <div class="stat purple">
          <div class="stat-title">Longest Win Streak</div>
          <div class="stat-value">${deep.winStreak}</div>
        </div>

        <div class="stat red">
          <div class="stat-title">Hardest Opponent</div>
          <div class="stat-value">${statLabelName(deep.hardestOpponent)}</div>
        </div>

        <div class="stat orange">
          <div class="stat-title">Losing Streak</div>
          <div class="stat-value">${deep.loseStreak}</div>
        </div>

        <div class="stat gray">
          <div class="stat-title">Games Played</div>
          <div class="stat-value">${gamesPlayed}</div>
        </div>

      </div>
    </div>
  `;
  const dashboard = document.getElementById("dashboardAnalytics");
  const rankingsEl = document.getElementById("rankingsAnalytics");

  if (dashboard) dashboard.innerHTML = html;
  if (rankingsEl) rankingsEl.innerHTML = html;
}

async function changeDashboardPlayer(name) {
  playerSelectTouched = true;
  selectedPlayer = String(name).toLowerCase();
  const ps = document.getElementById("playerSelect");
  if (ps && [...ps.options].some(o => o.value === selectedPlayer)) {
    ps.value = selectedPlayer;
  }
  if (!getPlayerFromURL()) setPreferredPlayer(selectedPlayer);
  await renderDashboardAnalytics(selectedPlayer);
  renderGreeting();
}












function renderGreeting() {
  const el = document.getElementById("dashboardGreeting");
  if (!el) return;
  const url = getPlayerFromURL();
  const stored = getPreferredPlayerFromStorage();
  const nameKey = url || stored || "";
  const h = new Date().getHours();
  let part = "Good evening";
  if (h < 12) part = "Good morning";
  else if (h < 17) part = "Good afternoon";
  el.textContent = nameKey ? `${part}, ${capitalize(nameKey)}.` : `${part}.`;
}

function renderPlayerOnboard() {
  const wrap = document.getElementById("playerOnboard");
  if (!wrap) return;
  if (getPlayerFromURL() || getPreferredPlayerFromStorage()) {
    wrap.style.display = "none";
    wrap.innerHTML = "";
    return;
  }
  wrap.style.display = "block";
  wrap.innerHTML = `
    <div class="player-onboard-inner card">
      <p class="player-onboard-text">Please provide your name for a more tailored experience.</p>
      <div class="onboard-input-wrap">
        <input type="text" id="onboardPlayerInput" class="onboard-input" placeholder="Start typing your name" autocomplete="off">
      </div>
    </div>
  `;
  const inp = document.getElementById("onboardPlayerInput");
  if (inp) attachOnboardAutocomplete(inp);
}

function attachOnboardAutocomplete(input) {
  let dropdown = input.closest(".onboard-input-wrap")?.querySelector(".autocomplete");
  const wrap = input.closest(".onboard-input-wrap");
  if (!wrap) return;

  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "autocomplete onboard-autocomplete-el";
    wrap.appendChild(dropdown);
  }

  input.addEventListener("input", () => {
    const val = input.value.toLowerCase();
    dropdown.innerHTML = playersCache
      .filter(p => p.name.toLowerCase().includes(val))
      .slice(0, 8)
      .map(p => `<div class="auto-item">${capitalize(p.name)}</div>`)
      .join("");
    dropdown.querySelectorAll(".auto-item").forEach(el => {
      el.onclick = () => {
        const picked = el.innerText.trim();
        input.value = picked;
        dropdown.innerHTML = "";
        playerSelectTouched = true;
        selectedPlayer = picked.toLowerCase();
        setPreferredPlayer(selectedPlayer);
        renderPlayerOnboard();
        renderGreeting();
        loadRankings();
      };
    });
  });

  input.addEventListener("blur", () => {
    setTimeout(() => { dropdown.innerHTML = ""; }, 200);
  });
}

function navigate(page) {
  showPage(page);
}

document.addEventListener("DOMContentLoaded", async () => {
  const loadedShared = loadSharedResults();

  if (loadedShared) return; // 🔥 STOP normal app
  try {
    loadTodaySetsAll().then(() => {
      const loading = document.getElementById("loading-screen");
      if (loading) {
        loading.style.opacity = "0";
        setTimeout(() => loading.style.display = "none", 300);
      }
    });

    await loadPlayers();

    await Promise.all([loadRankings(), loadSchedule()]);

    renderGreeting();
    renderPlayerOnboard();
  } catch (err) {
    console.error("LOAD FAILED", err);
  }
});