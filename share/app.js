const API_URL = "https://script.google.com/macros/s/AKfycbyb7F3okADxJpkwAZahSRuGkKArYUwS8DBPAnvuSb5auQOSWNEg-4i_Ffy7y7RHFe9M/exec";
const APP_ORIGIN = "https://maxhydell.github.io/pbTracker/";

function getResultsFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("r");
}

function getPlayerFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("p");
}

function setHeroTitleWithLogo() {
  const titleEl = document.getElementById("dynamicTitle");
  if (!titleEl) return;
  titleEl.innerHTML = `
    <span class="brand-inline">
      <span class="brand-mark sm hero-logo-mark" aria-hidden="true">
        <img src="share/transparent.png" alt="">
      </span>
      <span class="hero-app-name">pbTracker</span>
    </span>`;
}

/** Feature cards: /rankings/, /schedule/, /sets/, / — each with ?p= current player when set */
function updateFeatureNavLinks() {
  const p = getPlayerFromURL();
  const qs = p ? `?p=${encodeURIComponent(p)}` : "";
  const bases = ["/rankings/", "/schedule/", "/sets/"];
  document.querySelectorAll("a[data-feature-link]").forEach((a, i) => {
    if (i < 3) a.href = `${bases[i]}${qs}`;
    else if (i === 3) a.href = `/${qs}`;
  });
}

function resolveDefaultPlayer(trendData) {
  if (!trendData?.length) return "max";
  const sorted = [...trendData]
    .filter(p => p.winPct > 0 || p.pointsAvg > 0)
    .sort((a, b) => b.winPct - a.winPct);
  if (sorted.some(p => p.name.toLowerCase() === "max")) return "max";
  return String((sorted[0] || trendData[0]).name).toLowerCase();
}

async function callAPI(params) {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}?${query}`);
    const text = await res.text();
    return JSON.parse(text);
  } catch (err) {
    console.error("API ERROR:", err);
    return null;
  }
}

function capitalize(name) {
  if (!name) return "";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function formatWinPctDisplay(winPct) {
  return `${(Number(winPct) * 100).toFixed(1)}%`;
}

function sortPlayersForDropdown(data) {
  if (!Array.isArray(data)) return [];
  return [...data].sort((a, b) => {
    if (a.name.toLowerCase() === "max") return -1;
    if (b.name.toLowerCase() === "max") return 1;
    return b.winPct - a.winPct;
  });
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

function analyzePlayerFromSets(sets, player) {
  sets = sortSetsChronologically(sets || []);
  player = String(player).toLowerCase();

  const partnerStats = {};
  const opponentStats = {};
  const gameResults = [];

  sets.forEach(set => {
    const teamA = (set.teamA || "").toLowerCase().split("/").map(p => p.trim());
    const teamB = (set.teamB || "").toLowerCase().split("/").map(p => p.trim());

    (set.scores || []).forEach(score => {
      if (!score || !String(score).includes("-")) return;

      const [a, b] = score.split("-").map(Number);
      const winnerA = a > b;

      const isA = teamA.includes(player);
      const isB = teamB.includes(player);
      if (!isA && !isB) return;

      const myTeam = isA ? teamA : teamB;
      const oppTeam = isA ? teamB : teamA;

      const won = (isA && winnerA) || (isB && !winnerA);
      gameResults.push(won ? 1 : 0);

      const partner = myTeam.find(p => p !== player);
      if (partner) {
        if (!partnerStats[partner]) partnerStats[partner] = { wins: 0, games: 0 };
        partnerStats[partner].games++;
        if (won) partnerStats[partner].wins++;
      }

      oppTeam.forEach(o => {
        if (!opponentStats[o]) opponentStats[o] = { wins: 0, games: 0 };
        opponentStats[o].games++;
        if (won) opponentStats[o].wins++;
      });
    });
  });

  let bestPartner = "--";
  let bestPct = -1;
  Object.entries(partnerStats).forEach(([p, s]) => {
    const pct = s.wins / s.games;
    if (pct > bestPct) {
      bestPct = pct;
      bestPartner = p;
    }
  });

  let hardestOpponent = "--";
  let worstPct = 2;
  Object.entries(opponentStats).forEach(([o, s]) => {
    const pct = s.wins / s.games;
    if (pct < worstPct) {
      worstPct = pct;
      hardestOpponent = o;
    }
  });

  let maxWin = 0;
  let curWin = 0;
  let maxLose = 0;
  let curLose = 0;

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

function renderTopSixTable(data, highlightLower) {
  const el = document.getElementById("leaderboard");
  if (!el) return;

  const filtered = [...data]
    .filter(p => p.winPct > 0 || p.pointsAvg > 0)
    .sort((a, b) => b.winPct - a.winPct)
    .slice(0, 6);

  const hl = String(highlightLower || "").toLowerCase();

  if (!filtered.length) {
    el.innerHTML = `<div class="card lb-card"><p class="lb-empty">No rankings yet.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="lb-table-wrap lb-card">
      <div class="lb-table-title">Rankings</div>
      <div class="lb-table-scroll">
        <table class="lb-table" role="table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">Win %</th>
              <th scope="col">Points Avg.</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((p, i) => {
              const rank = i + 1;
              const you = p.name.toLowerCase() === hl;
              const zebra = rank % 2 === 0 ? " lb-row--even" : "";
              const youCls = you ? " lb-row--you" : "";
              const pts = Number(p.pointsAvg);
              const ptsStr = Number.isFinite(pts) ? pts.toFixed(2) : "—";
              return `
                <tr class="lb-row${zebra}${youCls}">
                  <td class="lb-cell-rank">${rank}</td>
                  <td class="lb-cell-name">${capitalize(p.name)}</td>
                  <td class="lb-cell-pct">${formatWinPctDisplay(p.winPct)}</td>
                  <td class="lb-cell-pts">${ptsStr}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function changeDashboardPlayer(name) {
  const pl = String(name || "").toLowerCase();
  if (!pl) return;

  const url = new URL(window.location.href);
  url.searchParams.set("p", pl);
  window.history.replaceState({}, "", url);

  updateFeatureNavLinks();

  const subtitleEl = document.getElementById("dynamicSubtitle");
  setHeroTitleWithLogo();
  if (subtitleEl) {
    subtitleEl.textContent = `Welcome to pbTracker, ${capitalize(pl)}`;
  }

  if (Array.isArray(window.fullData)) {
    renderTopSixTable(window.fullData, pl);
  }

  await renderDashboardAnalytics(pl);
}

function showInstallGuide() {
  const overlay = document.getElementById("installOverlay");
  const stepsEl = document.getElementById("installSteps");
  const noteEl = document.getElementById("installNote");
  if (!overlay || !stepsEl || !noteEl) return;

  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);

  let steps = [];
  let note = "";

  if (iOS) {
    steps = [
      "Use **Safari** for the smoothest install (other browsers on iPhone hide some options).",
      "Tap the **Share** button—the square with an arrow—on the bottom bar.",
      "Scroll and tap **Add to Home Screen**.",
      "Tap **Add** to finish. Your pbTracker icon appears on your home screen.",
    ];
    note =
      "Tip: launch pbTracker from that icon for a full-screen app experience without the Safari chrome.";
  } else if (android) {
    steps = [
      "Open the browser **⋮** menu in the top-right corner.",
      "Tap **Install app**, **Add to Home screen**, or **Install pbTracker** if shown.",
      "Confirm the prompt—the icon will sit with your other apps.",
    ];
    note = "If you don’t see Install, try updating Chrome or look for “Add to Home screen” in the same menu.";
  } else {
    steps = [
      "In **Chrome** or **Edge**, check the address bar for an **install** icon (often ⊕ or a small monitor).",
      "Click it and choose **Install** to add pbTracker as a desktop app.",
      "Alternatively open the **⋯** menu → **Install pbTracker** or **Save and share → Install page as app**.",
    ];
    note = "Installed apps open in their own window, great for keeping pbTracker one click away.";
  }

  stepsEl.innerHTML = steps
    .map((t, i) => {
      const html = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<li class="install-step"><span class="install-step-num">${i + 1}</span><div class="install-step-body">${html}</div></li>`;
    })
    .join("");

  noteEl.textContent = note;
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("install-modal-open");
  overlay.querySelector(".install-close")?.focus();
}

function closeInstallGuide() {
  const overlay = document.getElementById("installOverlay");
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("install-modal-open");
}

document.addEventListener("mousemove", e => {
  document.querySelectorAll("[data-tilt-target='glare']").forEach(el => {
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--x", `${x}%`);
    el.style.setProperty("--y", `${y}%`);
  });
});

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("[data-install-close]").forEach(el => {
    el.addEventListener("click", closeInstallGuide);
  });
  document.getElementById("installOverlay")?.addEventListener("keydown", e => {
    if (e.key === "Escape") closeInstallGuide();
  });

  updateFeatureNavLinks();

  const resultsParam = getResultsFromURL();

  if (resultsParam) {
    await renderSharedResults(resultsParam);
    return;
  }

  const data = await callAPI({ action: "getUserTrend" });
  window.fullData = data;
  if (!data) return;

  const playerParam = getPlayerFromURL();
  const defaultPl = resolveDefaultPlayer(data);
  let effectivePl = defaultPl;

  const subtitleEl = document.getElementById("dynamicSubtitle");

  if (playerParam) {
    const found = data.find(p => p.name.toLowerCase() === playerParam.toLowerCase());
    if (found) {
      effectivePl = found.name.toLowerCase();
      setHeroTitleWithLogo();
      if (subtitleEl) {
        subtitleEl.textContent = `Welcome to pbTracker, ${capitalize(effectivePl)}`;
      }
    } else {
      setHeroTitleWithLogo();
      if (subtitleEl) subtitleEl.textContent = "Welcome to pbTracker.";
    }
  } else {
    setHeroTitleWithLogo();
    if (subtitleEl) subtitleEl.textContent = "Welcome to pbTracker.";
  }

  renderTopSixTable(data, effectivePl);
  await renderDashboardAnalytics(effectivePl);
});

async function renderSharedResults(id) {
  const container = document.getElementById("leaderboard");
  const features = document.getElementById("featuresSection");
  if (features) features.style.display = "none";

  const dash = document.getElementById("dashboardAnalytics");
  if (dash) dash.innerHTML = "";

  const raw = await callAPI({ action: "getSharedResults", id });

  if (!container) return;

  if (!raw) {
    container.innerHTML = "<div class='card'>No results found.</div>";
    return;
  }

  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      container.innerHTML = "<div class='card'>Invalid results.</div>";
      return;
    }
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    container.innerHTML = "<div class='card'>No results found.</div>";
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-title">Shared Results</div>
      ${parsed.map((p, i) => `
        <div class="result-row">
          <span>${i + 1}. ${capitalize(p.name)}</span>
          <span>${p.change}%</span>
        </div>
      `).join("")}
    </div>
  `;
}

function enterApp() {
  const player = getPlayerFromURL();
  const base = APP_ORIGIN.replace(/\/$/, "");
  if (player) {
    window.location.href = `${base}/?p=${encodeURIComponent(player)}`;
  } else {
    window.location.href = APP_ORIGIN;
  }
}
