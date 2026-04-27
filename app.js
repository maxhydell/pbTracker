const API_URL = "https://script.google.com/macros/s/AKfycbxS8gPaEmFSp0Suvr2h8KQzBgwS_jBlVgLUaTRyMepd3kcQCdSqwimB99Hcux3YMbnv/exec";



const memoryCache = {};
let playersCache = [];
let isEditingScores = false;
let historyCache = [];
let selectedPlayer = "max";
let playerSelectTouched = false;
let lastTodaySetsData = null;
let scheduleOpenDate = null;
let scheduleRefreshPausedUntil = 0;
let appStartupPromise = null;
let appBootComplete = false;
let refreshLoopStarted = false;
const BOOK_COURT_STORAGE_KEY = "pbTracker_bookedCourtDays_v1";

const LS_DAY_COMPLETE = "pbTracker_dayComplete";
const LS_PLAYER_PREF = "pbTracker_playerPref_v1";
const LS_MORNING_WINPCT = "pbTracker_morningWinPct";
const LS_SCHEDULE_WEEK_ANCHOR = "pbTracker_scheduleWeekAnchor_v1";
const LS_DEVICE_ID = "pbTracker_deviceId_v1";
const LS_DEVICE_VERIFIED = "pbTracker_deviceVerified_v1";
const ACCESS_CODE = "ymcapickle";

// Power Rating Rating Constants
const BITE_STRENGTH_K = 0.75;
const BITE_STRENGTH_D = 12;
const BITE_STRENGTH_ALPHA = 0.75;
const BITE_STRENGTH_MAX_SCORE = 12;
const BITE_STRENGTH_BASE = 50;

let scheduleDirty = false;
let pendingScheduleChanges = [];
let touchStartY = 0;
let holdTimer;
let optimisticUpdates = {};
let globalData = {
  sets: null,
  trend: null,
  schedule: null,
  history: null,
  lastUpdated: null
};

let userIp = null;
let isEditingLocked = false;
let loadingProgress = 0;
let rankingsComponentsReady = false;
let deviceId = null;
let lastMetaSeen = null;
let cachedVisitorContext = null;
function log(label, data) {
  console.log("🔥", label, data);
}
const activeTimers = new Set();

function startTimer(name) {
  if (activeTimers.has(name)) return;
  activeTimers.add(name);
  console.time(`⏱️ ${name}`);
}

function endTimer(name) {
  if (!activeTimers.has(name)) return;
  activeTimers.delete(name);
  console.timeEnd(`⏱️ ${name}`);
}

function updateLoadingProgress(percent, text) {
  loadingProgress = Math.min(100, Math.max(loadingProgress, percent));
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  
  if (progressBar) {
    progressBar.style.width = loadingProgress + "%";
  }
  if (progressText && text) {
    progressText.textContent = text;
  }
}

function hideLoadingScreen() {
  const loader = document.getElementById("loading-screen");
  if (!loader) return;

  loader.style.opacity = "0";
  loader.style.animation = "fadeOut 0.4s ease forwards";

  setTimeout(() => {
    loader.style.display = "none";
  }, 400);
}

function getSetScores(match) {
  const baseScores = Array.isArray(match?.scores) ? [...match.scores] : [];
  const totalGames = Math.max(3, baseScores.length);

  while (baseScores.length < totalGames) {
    baseScores.push("");
  }

  return baseScores;
}

function collectSetScoresFromDom(setNumber) {
  const activePage = document.querySelector(".page.active");
  const scopedCards = activePage
    ? Array.from(activePage.querySelectorAll(`.match-card[data-set="${setNumber}"]`))
    : [];
  const cards = scopedCards.length
    ? scopedCards
    : Array.from(document.querySelectorAll(`.match-card[data-set="${setNumber}"]`));

  return cards.map(card => {
    const inputs = card.querySelectorAll(".score-editable input");
    if (inputs.length < 2) return "";

    const a = String(inputs[0].value || "").trim();
    const b = String(inputs[1].value || "").trim();

    if (a === "" || b === "") {
      return "";
    }

    return `${a}-${b}`;
  });
}

function getOrCreateDeviceId() {
  const player = getPlayerFromURL() || getPreferredPlayerFromStorage() || localStorage.getItem("player");
  const playerKey = player ? `${LS_DEVICE_ID}_${player}` : LS_DEVICE_ID;
  
  let id = localStorage.getItem(playerKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(playerKey, id);
    console.log("📱 New device ID created for", player || "guest", ":", id);
  } else {
    console.log("📱 Using stored device ID for", player || "guest", ":", id);
  }
  deviceId = id;
  return id;
}

async function checkDeviceWhitelist() {
  try {
    updateLoadingProgress(15, "Verifying device...");

    const id = getOrCreateDeviceId();

    if (!window.supabaseClient) {
      console.warn("⚠️ Supabase client not available, cannot check whitelist");
      return;
    }

    // Check if device is whitelisted
    const { data, error } = await window.supabaseClient
      .from("device_whitelist")
      .select("*")
      .eq("device_id", id);

    if (error) {
      console.error("❌ Whitelist check error:", error);
      isEditingLocked = true;
      setTimeout(() => {
        showAccessRestrictionPopup();
      }, 500);
      return;
    }

    if (data && data.length > 0) {
      isEditingLocked = false;
      localStorage.setItem(LS_DEVICE_VERIFIED, "1");
      console.log("✅ Device whitelisted:", id);
    } else {
      isEditingLocked = true;
      console.warn("⚠️ Device NOT whitelisted:", id);
      setTimeout(() => {
        showAccessRestrictionPopup();
      }, 500);
    }

  } catch (err) {
    console.error("❌ Device check error:", err);
    isEditingLocked = true;
  }
}

async function loadCriticalPageData(pageId) {
  if (pageId === "rankings") {
    updateLoadingProgress(35, "Loading rankings...");

    const [trend, history] = await Promise.all([
      callAPI({ action: "getUserTrend" }, { force: true }),
      callAPI({ action: "getHistory" }, { force: true })
    ]);

    globalData.trend = trend;
    globalData.history = history;
    historyCache = Array.isArray(history) ? history : [];

    updateLoadingProgress(80, "Building rankings...");
    await loadRankings({ skipAnalytics: true });
    return;
  }

  if (pageId === "schedule") {
    updateLoadingProgress(35, "Loading schedule...");
    await loadSchedule();
    return;
  }

  updateLoadingProgress(35, pageId === "sets" ? "Loading sets..." : "Loading today's sets...");

  const sets = await callAPI({ action: "getTodaySets" }, { force: true });
  globalData.sets = sets;

  updateLoadingProgress(80, "Building sets...");
  await loadTodaySetsAll();
}

function queueBackgroundStartup(pageId) {
  setTimeout(async () => {
    try {
      renderGreeting();
      renderPlayerOnboard();

      if (!playersCache.length) {
        await loadPlayers();
      }

      if (pageId === "rankings") {
        await renderDashboardAnalytics(selectedPlayer);
      }

      const backgroundTasks = [];

      if (!globalData.lastUpdated) {
        backgroundTasks.push(
          callAPI({ action: "lastUpdated" }, { force: true }).then(data => {
            globalData.lastUpdated = data;
          })
        );
      }

      if (!globalData.trend) {
        backgroundTasks.push(
          callAPI({ action: "getUserTrend" }, { force: true }).then(data => {
            globalData.trend = data;
            return data;
          })
        );
      }

      if (!globalData.schedule && pageId !== "schedule") {
        backgroundTasks.push(
          callAPI({ action: "getSchedule" }, { force: true }).then(data => {
            globalData.schedule = data;
            return data;
          })
        );
      }

      if (!globalData.history && pageId !== "rankings") {
        backgroundTasks.push(
          callAPI({ action: "getHistory" }, { force: true }).then(data => {
            globalData.history = data;
            historyCache = Array.isArray(data) ? data : historyCache;
            return data;
          })
        );
      }

      await Promise.all(backgroundTasks);

      if (globalData.trend) {
        getMorningWinPctSnapshot(globalData.trend);
      }

      if (pageId !== "rankings") {
        loadRankings();
      }

      if (pageId !== "schedule") {
        loadSchedule();
      }

      if (pageId !== "input" && pageId !== "sets") {
        loadTodaySetsAll();
      }

      await checkDeviceWhitelist();
      lockEditingIfNeeded();
      trackVisitor();
    } catch (err) {
      console.error("Background startup failed:", err);
    } finally {
      appBootComplete = true;
    }
  }, 100);
}


function showAccessRestrictionPopup() {
  const popupConfigs = [
    { pageId: "input", popupId: "accessRestrictionPopup-input", inputId: "accessCode" },
    { pageId: "schedule", popupId: "accessRestrictionPopup-schedule", inputId: "accessCodeSchedule" },
    { pageId: "sets", popupId: "accessRestrictionPopup-sets", inputId: "accessCodeSets" }
  ];

  popupConfigs.forEach(({ pageId, popupId, inputId }) => {
    const container = document.getElementById(pageId);
    if (!container) return;

    const existingPopup = document.getElementById(popupId);
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement("div");
    popup.id = popupId;
    popup.className = "player-onboard access-restriction-card";
    popup.style.display = "block";
    popup.innerHTML = `
      <div class="player-onboard-inner">
        <div class="player-onboard-text">
          <h3>⚠️ Editing Access Required</h3>
          <p>You currently don't have editing access. Enter the access code to proceed.</p>
          <div style="margin-top: 15px;">
            <input id="${inputId}" type="password" placeholder="Enter access code" class="onboard-input" onkeypress="if(event.key==='Enter') verifyAccessCode()" />
            <button onclick="verifyAccessCode()" style="margin-top: 10px; width: 100%; padding: 10px; background: #4fc3ff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; color: #000;">Unlock</button>
          </div>
        </div>
      </div>
    `;

    container.insertBefore(popup, container.firstChild);
  });

  const activeInput = document.querySelector('.page.active #accessCode, .page.active #accessCodeSchedule, .page.active #accessCodeSets')
    || document.getElementById("accessCode")
    || document.getElementById("accessCodeSchedule")
    || document.getElementById("accessCodeSets");
  if (activeInput) activeInput.focus();
}

function verifyAccessCode() {
  const codeInput = [
    document.querySelector('.page.active #accessCode'),
    document.querySelector('.page.active #accessCodeSchedule'),
    document.querySelector('.page.active #accessCodeSets'),
    document.getElementById("accessCode"),
    document.getElementById("accessCodeSchedule"),
    document.getElementById("accessCodeSets")
  ].find(input => input && String(input.value || "").trim());

  const fallbackInput = document.querySelector('.page.active #accessCode, .page.active #accessCodeSchedule, .page.active #accessCodeSets')
    || document.getElementById("accessCode")
    || document.getElementById("accessCodeSchedule")
    || document.getElementById("accessCodeSets");
  const inputEl = codeInput || fallbackInput;
  if (!inputEl) return;

  const code = String(inputEl.value || "").trim();

  if (code === ACCESS_CODE) {
    // Add device to whitelist
    if (window.supabaseClient && deviceId) {
      window.supabaseClient
        .from("device_whitelist")
        .insert([{ device_id: deviceId, timestamp: new Date().toISOString() }])
        .then(({ error }) => {
          if (error) {
            console.error("❌ Failed to whitelist device:", error);
          } else {
            console.log("✅ Device added to whitelist");
          }
        });
    }

    localStorage.setItem(LS_DEVICE_VERIFIED, "1");
    isEditingLocked = false;
    console.log("✅ Access unlocked");

    [
      "accessRestrictionPopup-input",
      "accessRestrictionPopup-schedule",
      "accessRestrictionPopup-sets"
    ].forEach(id => {
      const popup = document.getElementById(id);
      if (popup) popup.remove();
    });

    const setInputs = document.querySelectorAll(".score-editable input, .player-input, .match-card input");
    const buttons = document.querySelectorAll(".set-save-btn, #scheduleSaveBtn, #doneBtn, .sms-btn, .check-btn, .add-game-btn, .add-player-btn");

    setInputs.forEach(input => {
      input.disabled = false;
      input.style.opacity = "1";
      input.style.cursor = "pointer";
      input.style.pointerEvents = "";
    });

    buttons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.pointerEvents = "";
    });

    showAccessUnlockedMessage();
  } else {
    inputEl.style.border = "2px solid #dc2626";
    inputEl.value = "";
    setTimeout(() => {
      inputEl.style.border = "";
    }, 2000);
  }
}

function showAccessUnlockedMessage() {
  const existing = document.getElementById("accessUnlockedToast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "accessUnlockedToast";
  toast.className = "access-unlocked-toast";
  toast.textContent = "Unlocked";
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
  }, 900);

  setTimeout(() => {
    toast.remove();
  }, 1300);
}

function lockEditingIfNeeded() {
  if (!isEditingLocked) return;

  console.log("🔒 LOCKING EDITING - IP NOT WHITELISTED");

  // Lock all editing controls
  const setInputs = document.querySelectorAll(".score-editable input, .player-input, .match-card input");
  const buttons = document.querySelectorAll(".set-save-btn, #scheduleSaveBtn, #doneBtn, .sms-btn, .check-btn, .add-game-btn, .add-player-btn");
  
  setInputs.forEach(input => {
    input.disabled = true;
    input.style.opacity = "0.5";
    input.style.cursor = "not-allowed";
    input.style.pointerEvents = "none";
  });

  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
    btn.style.pointerEvents = "none";
  });

  // Prevent score updates
  window.isEditingLocked = true;
}

async function initApp() {
  if (appStartupPromise) return appStartupPromise;
  updateLoadingProgress(5, "Preparing app...");

  appStartupPromise = (async () => {

    const loadedShared = await loadSharedResults();
    if (loadedShared) {
      appBootComplete = true;
      hideLoadingScreen();
      return;
    }

    const currentPage = getInitialPageFromPath();

    updateLoadingProgress(15, "Loading players...");
    await loadPlayers();
    await loadCriticalPageData(currentPage);

    updateLoadingProgress(92, "Opening page...");
    showPage(currentPage, { skipPageLoad: true, skipTracking: true });
    updateLoadingProgress(100, "Ready");
    hideLoadingScreen();

    queueBackgroundStartup(currentPage);

  })().catch(err => {
    appStartupPromise = null;
    appBootComplete = false;
    throw err;
  });

  return appStartupPromise;
}

document.addEventListener("touchstart", e => {
  touchStartY = e.touches[0].clientY;
});

document.addEventListener("touchmove", e => {
  const y = e.touches[0].clientY;

  if (window.scrollY === 0 && y - touchStartY > 80) {
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




function getRoutePage() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");

  if (["input", "rankings", "schedule", "sets"].includes(page)) {
    return page;
  }

  return "input";
}

(function handleResetQuery() {
  const q = new URLSearchParams(window.location.search);
  if (q.get("reset") === null) return;
  localStorage.removeItem("player");
  localStorage.removeItem("pbTracker_playerPref_v1");
  localStorage.removeItem(LS_SCHEDULE_WEEK_ANCHOR);
  const clean = window.location.pathname + (window.location.hash || "");
  window.location.replace(clean);
})();

function getSiteBasePath() {
  const path = (window.location.pathname || "").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  const subs = new Set(["rankings", "schedule", "sets", "share"]);
  if (parts.length && subs.has(parts[parts.length - 1])) parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}

function getInitialPageFromPath() {
  return getRoutePage();
}

function buildHrefForPage(pageId) {
  const base = getSiteBasePath();
  const q = window.location.search || "";
  if (pageId === "input") return base + q;
  const map = {
    rankings: "rankings/",
    schedule: "schedule/",
    sets: "sets/"
  };
  return base + (map[pageId] || "") + q;
}

function getAllData() {
  return {
    sets: getTodaySets(),
    trend: getUserTrend(),
    schedule: getSchedule(),
    history: getHistory(),
    lastUpdated: getLastUpdated()
  };
}

async function loadAllData(force = false) {
  startTimer("Full App Load");

  // 🔥 RUN EVERYTHING AT ONCE (NOT ONE BY ONE)
  const [
    sets,
    trend,
    schedule,
    history,
    lastUpdated
  ] = await Promise.all([
    callAPI({ action: "getTodaySets" }, { force }),
    callAPI({ action: "getUserTrend" }, { force }),
    callAPI({ action: "getSchedule" }, { force }),
    callAPI({ action: "getHistory" }, { force }),
    callAPI({ action: "lastUpdated" }, { force })
  ]);

  globalData = {
    sets,
    trend,
    schedule,
    history,
    lastUpdated
  };

  endTimer("Full App Load");

  return globalData;
}

const player =
  getPlayerFromURL() ||
  localStorage.getItem("player");

const greetingEl = document.getElementById("greetingText");
if (greetingEl) {
  greetingEl.innerText = getGreeting(player);
}

const urlPlayer = getPlayerFromURL();
const storedPlayer = localStorage.getItem("player");

if (!urlPlayer && !storedPlayer) {
  const prompt = document.getElementById("namePrompt");
  if (prompt) {
    prompt.style.display = "block";
  }
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

function showPage(id, options = {}) {
  if (!options.skipTracking && appBootComplete) {
    trackVisitor();
  }
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
    p.style.display = "none";
  });


  const hasUnsaved =
    Object.keys(optimisticUpdates).length > 0 || scheduleDirty;

  if (hasUnsaved) {
    const confirmLeave = confirm("You have unsaved changes. Leave anyway?");
    if (!confirmLeave) return;
  } // ✅ THIS WAS MISSING

  const page = document.getElementById(id);
  page.style.display = "block";
  page.classList.add("active");

  document.getElementById("sideMenu").classList.remove("open");
 // document.getElementById("overlay").classList.remove("show");

  if (options.skipPageLoad) {
    return;
  }

  if (id === "rankings") {
    requestAnimationFrame(() => loadRankings());
  }

  if (id === "schedule") {
    requestAnimationFrame(() => loadSchedule());
  }

  if (id === "input" || id === "sets") {
    requestAnimationFrame(() => loadTodaySetsAll());
  }
}


function formatNames(str) {
  return str
    .split("/")
    .map(n => n.trim().charAt(0).toUpperCase() + n.trim().slice(1).toLowerCase())
    .join(" & ");
}

async function callAPI(params, options = {}) {
  try {
    // 🔥 1. CREATE CACHE KEY
    const key = JSON.stringify(params);

    // 🔥 2. CHECK MEMORY CACHE (THIS IS WHERE YOUR LINE GOES)
    if (memoryCache[key] && !options.force) {
      return memoryCache[key];
    }

    // 🔥 3. FETCH FROM API
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}?${query}`, {
      cache: "no-store"
    });

    if (!res.ok) {
      console.error(`API HTTP ${res.status} for`, params);
    }

    const text = await res.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.error("INVALID JSON:", text);
      return null;
    }

    // 🔥 4. SAVE TO MEMORY CACHE (THIS WAS BROKEN BEFORE)
    memoryCache[key] = data;

    return data;

  } catch (err) {
    console.error("API ERROR:", err);
    return null;
  }
}

function renderSetsInto(container, data, opts = {}) {
  if (!container) return;
  const locked = opts.locked === true || isDayComplete();
  container.innerHTML = "";

  if (!data || !Array.isArray(data) || data.length === 0) {
    container.innerHTML = `
      <div class="card no-sets-card">
        <div style="text-align:center;">
          <h1>No sets today.</h1>
        </div>
      </div>
    `;
    return;
  }


  data.forEach(match => {
    const setWrapper = document.createElement("div");
    setWrapper.className = "set-container";
    setWrapper.innerHTML = `
      <div class="set-header" data-set="${match.set}" onclick="toggleSet(this)">
        <span>Set ${match.set}</span>

        <button class="set-save-btn"
          id="save-btn-${match.set}"
          onclick="event.stopPropagation(); saveSet(${match.set})">
          Save
        </button>

        <span class="add-game-btn" onclick="addGame(${match.set}, event)">+</span>
      </div>

      <div class="set-body"></div>
    `;

    const games = getSetScores(match);

    games.forEach((scoreEntry, i) => {
      const key = `${match.set}-${i}`;
      const score = optimisticUpdates[key] ?? scoreEntry ?? "0-0";
      const isDirty = optimisticUpdates[key] !== undefined;
      let a = 0, b = 0;

      const game1 = games[0] || "";
      const game2 = games[1] || "";

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
        <div class="match-card ${isGame3Locked ? "locked" : ""} ${locked ? "day-locked-card" : ""}" data-set="${match.set}" data-game="${i}">
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

            <div class="meta-row">
              ${!isDirty ? "" : `<span class="unsaved-dot"></span>`}
              <div class="meta-info">Game ${i+1} • Set ${match.set}</div>
            </div>
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
  startTimer("Current Sets");

  if (!globalData.sets) {
    globalData.sets = await callAPI({ action: "getTodaySets" });
  }
  const data = globalData.sets;

  endTimer("Current Sets");
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
  const hasSets = Array.isArray(lastTodaySetsData) && lastTodaySetsData.length > 0;

  if (btn) btn.style.display = (!done && hasSets) ? "block" : "none";
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



async function saveSet(setNumber) {
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }
  
  const btn = document.getElementById(`save-btn-${setNumber}`);
  if (!btn) return;

  btn.innerText = "Saving...";
  btn.disabled = true;

  try {
    const scores = collectSetScoresFromDom(setNumber);

    // 🔥 SEND ONCE
    const res = await callAPI({
      action: "saveSetFull",
      set: setNumber,
      scores: JSON.stringify(scores)
    });
 
    await callAPI({ action: "sendSaveNotification" });

    console.log("🔥 SAVE RESPONSE:", res);
    // 🚨 RED FLAG
    if (res?.error) {
      btn.innerText = "Error";
      alert("🚨 Save blocked: ranking mismatch");
      btn.disabled = false;
      return;
    }

    // 🔥 CRITICAL FIX — CLEAR CACHE
    Object.keys(memoryCache).forEach(k => delete memoryCache[k]);

    loadTodaySetsAll();
    await loadRankings();

    // 🔥 re-apply AFTER DOM rebuild
    setTimeout(() => {
      const btnAfter = document.getElementById(`save-btn-${setNumber}`);
      if (btnAfter) {
        btnAfter.innerText = "Saved";
        btnAfter.classList.add("saved");
        // Remove unsaved indicator when saved
        removeUnsavedIndicator(setNumber);
      }
    }, 120);

  } catch (e) {
    console.error(e);
    btn.innerText = "Error";
  }

  btn.disabled = false;
}

function unlockGame(set, gameIndex) {
  if (isEditingLocked) return;
  
  const inputs = document.querySelectorAll(`.match-card[data-set="${set}"][data-game="${gameIndex}"] input`);
  inputs.forEach(i => {
    i.disabled = false;
    i.style.opacity = 1;
    i.style.filter = "none";
  });
}


function addGame(setNumber, e) {
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }
  
  e.stopPropagation();

  const set = lastTodaySetsData.find(s => s.set === setNumber);
  if (!set) return;

  if (!Array.isArray(set.scores)) {
    set.scores = [];
  }

  const scores = getSetScores(set);
  const [g1, g2] = scores;

  const isSweep =
    g1 && g2 &&
    (
      (g1.split("-")[0] > g1.split("-")[1] &&
       g2.split("-")[0] > g2.split("-")[1]) ||
      (g1.split("-")[1] > g1.split("-")[0] &&
       g2.split("-")[1] > g2.split("-")[0])
    );

  // 🔥 CASE 1: sweep → just unlock game 3
  if (isSweep) {
    unlockGame(setNumber, 2);
    return;
  }

  const existingGameCount = collectSetScoresFromDom(setNumber).length || scores.length;
  const nextIndex = Math.max(existingGameCount, scores.length);

  if (scores[nextIndex] !== undefined) {
    unlockGame(setNumber, nextIndex);
    return;
  }

  set.scores[nextIndex] = "";
  if (globalData.sets) {
    const liveSet = globalData.sets.find(s => s.set === setNumber);
    if (liveSet) {
      if (!Array.isArray(liveSet.scores)) {
        liveSet.scores = [];
      }
      liveSet.scores[nextIndex] = "";
    }
  }

  // 🔥 CASE 2: add another game container
  const container = document.querySelector(`#save-btn-${setNumber}`).closest(".set-container");
  const body = container.querySelector(".set-body");

  const html = `
    <div class="match-card" data-set="${setNumber}" data-game="${nextIndex}">
      <div class="left-content">
        <div class="team-row">
          <span class="team-names">${formatNames(set.teamA)}</span>
          <span class="status-badge tie">tie</span>
        </div>
        <div class="opponents">${formatNames(set.teamB)}</div>
      </div>

      <div class="right-content">
        <div class="score-editable">
          <input type="number" inputmode="numeric" oninput="updateScore(${setNumber}, ${nextIndex}, this)">
          <span class="score-separator">-</span>
          <input type="number" inputmode="numeric" oninput="updateScore(${setNumber}, ${nextIndex}, this)">
        </div>
        <div class="meta-row">
          <div class="meta-info">Game ${nextIndex + 1} • Set ${setNumber}</div>
        </div>
        <div id="status-${setNumber}-${nextIndex}"></div>
      </div>
    </div>
  `;

  body.insertAdjacentHTML("beforeend", html);
  body.classList.add("open");
  body.style.maxHeight = body.scrollHeight + "px";
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
    const dayCard = el.closest(".day-card");
    scheduleOpenDate = dayCard?.dataset?.date || scheduleOpenDate;
  } else {
    const dayCard = el.closest(".day-card");
    if (dayCard?.dataset?.date === scheduleOpenDate) scheduleOpenDate = null;
  }
}


// function editScore(set, current) {
//   const newScore = prompt("Edit score", current);
//   if (!newScore) return;

 //  callAPI({
 //    action: "submitScore",
  //   set,
 //    score: newScore
//   });

 //  loadTodaySetsAll();
// }


function sendSMS(btn, date, col) {
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }
  
  const input = btn.parentElement.querySelector("input");
  const name = (input.value || "").trim();
  if (!name) return alert("Enter a name first");

  const player = playersCache.find(p =>
    p.name.toLowerCase().includes(name.toLowerCase())
  );

  if (!player || !player.phone) return alert("No phone");

  const day = new Date(date).toLocaleDateString("en-US",{weekday:"long"});

const gamesPlayed = player.games || 0;

let messages;

if (gamesPlayed > 5) {
  messages = [
    `can you play 630 ${day}`,
    `Can you play 630 ${day}`,
    `can you play 6:30 ${day}`,
    `do you want to play 630 ${day}?`,
    `want to play 6:30 ${day}?`
  ];
} else {
  messages = [
    `Do you want to play 6:30am ${day} @ the Y?`
  ];
}

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
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }
  
  const input = btn.parentElement.querySelector("input");
  const currentName = (input?.value || "").trim();

  // 🔥 ONLY SAVE IF NOT EMPTY
  if (currentName) {
    persistScheduleName(date, col, currentName);
  }

  let state = Number(btn.dataset.state || 0);

  // 🔴 0 → 1 (sent)
  if (state === 0) {
    btn.src = "orange.png";
    btn.dataset.state = 1;

    scheduleDirty = true;

    pendingScheduleChanges.push({
      type: "status",
      date,
      col,
      status: 1
    });

    updateSaveButton();

    return;
  }

  // 🟡 1 → 2 (confirmed)
  if (state === 1) {
    btn.src = "/green.png";
    btn.dataset.state = 2;

    input.disabled = true;
    input.style.border = "2px solid #00c853";

    scheduleDirty = true;

    pendingScheduleChanges.push({
      type: "status",
      date,
      col,
      status: 2
    });

    updateSaveButton();

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


function isWeekend() {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOfWeekContaining(date = new Date()) {
  const today = startOfDay(date);
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  return monday;
}

function nextMondayAfterWeekend(date = new Date()) {
  const today = startOfDay(date);
  const day = today.getDay();
  if (day === 6) {
    const m = new Date(today);
    m.setDate(today.getDate() + 2);
    return m;
  }
  if (day === 0) {
    const m = new Date(today);
    m.setDate(today.getDate() + 1);
    return m;
  }
  return mondayOfWeekContaining(date);
}

function effectiveScheduleWeekMonday() {
  return isWeekend() ? nextMondayAfterWeekend() : mondayOfWeekContaining();
}

function maybeRollScheduleLocalWeek() {
  const mon = effectiveScheduleWeekMonday();
  const anchorKey = mon.toISOString().slice(0, 10);
  const prev = localStorage.getItem(LS_SCHEDULE_WEEK_ANCHOR);
  if (isWeekend() && prev && prev !== anchorKey) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("pbTracker_schedule_")) localStorage.removeItem(k);
    }
  }
  localStorage.setItem(LS_SCHEDULE_WEEK_ANCHOR, anchorKey);
}

function getBookCourtMap() {
  try {
    return JSON.parse(localStorage.getItem(BOOK_COURT_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function isBookCourtDone(date) {
  const map = getBookCourtMap();
  const key = new Date(date).toISOString().slice(0, 10);
  return Boolean(map[key]);
}

function setBookCourtDone(date) {
  const map = getBookCourtMap();
  const key = new Date(date).toISOString().slice(0, 10);
  map[key] = true;
  localStorage.setItem(BOOK_COURT_STORAGE_KEY, JSON.stringify(map));
}

function bookCourt(date, button) {
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }

  console.log("🎾 Book Court clicked", { date });

  const url = "https://app.courtreserve.com/Online/Reservations/Index/9529";

  // UI feedback
  if (button) {
    button.disabled = true;
    button.classList.add("is-booked");
    button.textContent = "Opening...";
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    // Try app / direct open
    window.location.href = url;

    // Fallback to browser tab if app doesn't open
    setTimeout(() => {
      window.open(url, "_blank");
    }, 800);
  } else {
    // Desktop → open new tab
    window.open(url, "_blank");
  }

  // Mark as "done" immediately since it's manual now
  setBookCourtDone(date);

  if (button) {
    button.textContent = "Opened Booking";
  }
}

let scheduleLoading = false;

async function loadSchedule() {
  if (scheduleLoading) return;
  scheduleLoading = true;

  try {
    const rankings = await callAPI({ action: "getUserTrend" });

    startTimer("Schedule");
    setWeekRange();
    maybeRollScheduleLocalWeek();
    console.log("🚀 loadSchedule called");

    // 🔥 ENSURE WEEK STRUCTURE EXISTS BEFORE LOADING
    await callAPI({ action: "ensureWeekInitialized" });

    let data = await callAPI({ action: "getSchedule" }, { force: true });
    globalData.schedule = data;

    console.log("📦 schedule data:", data);
    console.count("loadSchedule fired");

    if (!data || !Array.isArray(data)) {
      console.error("❌ BAD SCHEDULE DATA:", data);
      document.getElementById("scheduleList").innerHTML = "Failed to load schedule";
      return;
    }

const weekStart = new Date(effectiveScheduleWeekMonday());
weekStart.setHours(0,0,0,0);

data = Array.from({ length: 5 }, (_, i) => {
  const target = new Date(weekStart);
  target.setDate(weekStart.getDate() + i);
  target.setHours(0,0,0,0);

  const match = data.find(row => {
    const rd = new Date(row.date + "T12:00:00");
    rd.setHours(0,0,0,0);
    return rd.getTime() === target.getTime();
  });

  return match || {
    date: target.toISOString(),
    players: ["", "", "", ""],
    status: [0, 0, 0, 0]
  };
});

    console.log("📊 SCHEDULE LENGTH:", data.length);

    // FIRST — log rows
    data.forEach((row, i) => {
      console.log(`Row ${i}:`, row.date, row.players);
    });

    // SECOND — fix empty players
    data.forEach(row => {
      if (!row.players || row.players.length === 0) {
        row.players = ["", "", "", ""];
      }
    });

    function getWinPct(name) {
      const p = rankings.find(x =>
        x.name.toLowerCase() === (name || "").toLowerCase()
      );
      return p?.winPct || 0;
    }

    const container = document.getElementById("scheduleList");

    if (!data.length) {
      console.warn("⚠️ No schedule for this week");
      data = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return {
          date: d.toISOString(),
          players: ["", "", "", ""],
          status: [0, 0, 0, 0]
        };
      });
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
      const d = new Date(row.date + "T12:00:00");
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

      // 🔥 Calculate average win% for the day
      const dayWinPcts = row.players
        .map(p => getWinPct(p))
        .filter(v => v > 0);
      
      const dayAvgWinPct = dayWinPcts.length
        ? Math.round(dayWinPcts.reduce((a, b) => a + b, 0) / dayWinPcts.length * 100)
        : 0;

      return `
        <div class="day-card ${allConfirmed ? "day-complete" : ""}" data-date="${row.date}">
          <div class="day-header" onclick="toggleSet(this)">
            <div class="day-name">${dayName}</div>
            <div class="day-win-pct">${dayAvgWinPct}%</div>

            ${i === topDayIndex ? `<div class="tag">Top Day</div>` : ""}

            <div class="carrot"></div>
          </div>

          <div class="day-body">
            <div class="player-row">
              ${[0,1,2,3].map(col => {
                const status = row.status?.[col] || 0;

                let img = "/white.png";
                if (status == 1) img = "orange.png";
                if (status == 2) img = "/green.png";

                return `
                  <div class="player-slot">
                    <input class="player-input"
                      value="${row.players?.[col] ? capitalize(row.players[col]) : ""}"
                      ${status !== 0 ? "disabled" : ""}
                      ${status == 2 ? `style="border:2px solid #00c853"` : ""}
                      onfocus="pauseScheduleRefresh(); attachAutocomplete(this, '${row.date}', ${col+1})">

                    ${status == 2 ? `
                      <img src="/unlock.png" class="sms-btn"
                        onclick="unlockPlayer(this, '${row.date}', ${col+1})">
                    ` : `
                      <img src="/imessage.png" class="sms-btn"
                        onclick="sendSMS(this, '${row.date}', ${col+1})">
                    `}

                    <img src="${img}" class="check-btn"
                      data-state="${status}"
                      onclick="toggleCheck(this, '${row.date}', ${col+1})">
                  </div>
                `;
              }).join("")}
            </div>
            <button class="book-court-btn ${isBookCourtDone(row.date) ? "is-booked" : ""}"
              onclick="bookCourt('${row.date}', this)"
              ${isBookCourtDone(row.date) ? "disabled" : ""}>
              ${isBookCourtDone(row.date) ? "Court Booked" : "Book Court"}
            </button>
          </div>
        </div>
      `;
    }).join("");

    if (scheduleOpenDate) {
      const openHeader = container.querySelector(`.day-card[data-date="${scheduleOpenDate}"] .day-header`);
      if (openHeader) toggleSet(openHeader);
    }

    endTimer("Schedule");

  } catch (err) {
    console.error("❌ loadSchedule crashed:", err);
  } finally {
    scheduleLoading = false; // 🔥 ALWAYS releases
  }
}

function showSuccess(id) {
  const el = document.getElementById(id);
  el.innerHTML = `<div class="success">✔ Score Saved</div>`;

  setTimeout(() => el.innerHTML = "", 1500);
}

function pauseScheduleRefresh() {
  scheduleRefreshPausedUntil = Date.now() + 5000;
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

async function loadRankings(options = {}) {
  startTimer("Rankings Graph + Leaderboard");
  if (!globalData.trend) await loadAllData();
  const data = globalData.trend;
  const maxGames = Math.max(...data.map(d => d.games));
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

  // Get all sets once for Power Rating calculations
  const allSetsForRatings = (await getAllSets()) || [];

  const bigStatEl = document.getElementById("bigStat");
  const topPercentEl = document.getElementById("topPercent");
  if (bigStatEl) {
    // Calculate Power Rating and display it instead of Win %
    const biteStrength = calculateBiteStrength(selectedPlayer, allSetsForRatings, data);
    bigStatEl.innerText = biteStrength.toFixed(2);
    
    // Update label to show Power Rating
    if (topPercentEl) {
      topPercentEl.innerText = "Power Rating";
    }
    
    // 🔥 EARLY EXIT FOR RANKINGS PAGE
    if (!rankingsComponentsReady && document.getElementById("rankings")?.classList.contains("active")) {
      rankingsComponentsReady = true;
      updateLoadingProgress(95, "Loading complete...");
      setTimeout(() => {
        hideLoadingScreen();
      }, 200);
    }
  }

  if (!historyCache.length) {
    if (!globalData.history) await loadAllData();
    historyCache = globalData.history;
  }
  if (!options.skipAnalytics) {
    startTimer("Analytics");
    await renderDashboardAnalytics(selectedPlayer);
    endTimer("Analytics");
  }

  const rank = sorted.findIndex(p => p.name === player.name) + 1;
  // Label is now set to "Power Rating" in the bigStatEl block above
  // document.getElementById("topPercent").innerText = `#${rank} Place`;

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
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  // Calculate dynamic margins - if data exceeds ±8, expand range
  let margin = 8;
  const rangeFromLatest = Math.max(Math.abs(latest - dataMin), Math.abs(dataMax - latest));
  if (rangeFromLatest > margin) {
    margin = Math.ceil(rangeFromLatest * 1.15); // Add 15% buffer
  }

  const max = latest + margin;
  const min = latest - margin;

  const chartEl = document.getElementById("chart");
  if (!chartEl) return;
  const labels = playerHistory.map(x => x.date);
  const chartData = [...values];

  if (!chart) {
    chart = new Chart(chartEl, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: chartData,
          borderWidth: 3,
          tension: 0.4
        }]
      },
      options: {
        animation: false,
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
  } else {
    const old = JSON.stringify({ labels: chart.data.labels, data: chart.data.datasets?.[0]?.data });
    const next = JSON.stringify({ labels, data: chartData });
    if (old !== next) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = chartData;
      chart.options.scales.y.min = min;
      chart.options.scales.y.max = max;
      chart.update("none");
    }
  }

  const filtered = [...data].filter(p =>
    p.winPct > 0 || p.pointsAvg > 0
  ).sort((a, b) => b.winPct - a.winPct);

  // Calculate Power Rating for all players (reuse allSetsForRatings from above)
  filtered.forEach(player => {
    if (!player.biteStrength) {
      player.biteStrength = calculateBiteStrength(player.name, allSetsForRatings, data);
    }
  });

  renderLeaderboard(filtered);
  endTimer("Rankings Graph + Leaderboard");
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

async function ultraSmartRefresh() {
  if (isEditingScores) return;
  if (Object.keys(optimisticUpdates).length > 0) return; // 🔥 ADD THIS
  if (isDayComplete()) return;
  if (document.visibilityState !== "visible") return;
  if (Date.now() < scheduleRefreshPausedUntil) return;
  if (document.activeElement?.classList?.contains("player-input")) return;

  const meta = await callAPI({ action: "lastUpdated" }, { force: true });

  // 🔥 FIX: stop loop
  if (!meta || meta === lastMetaSeen) return;

  lastMetaSeen = meta;

  console.log("⚡ Updating FULL DATA (batch)");

  await loadAllData();

  loadTodaySetsAll();
  loadRankings();
  if (meta.scheduleChanged) loadSchedule();
}

function unlockPlayer(btn, date, col) {
  if (isEditingLocked) return;
  
  const slot = btn.parentElement;
  const input = slot.querySelector("input");

  input.disabled = false;
  input.value = "";
  input.style.border = "";

  btn.src = "/imessage.png";

  const check = slot.querySelector(".check-btn");
  check.src = "/white.png";
  check.dataset.state = 0;

  // 🔥 NEW: queue change instead of API call
  scheduleDirty = true;

  pendingScheduleChanges.push({
    type: "status",
    date,
    col,
    status: 0
  });

  updateSaveButton();
}

function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}


const pages = ["rankings","schedule","sets","input"];
let currentPage = 0;


function renderLeaderboard(data) {
  if (!data || !Array.isArray(data)) return;


  const container = document.getElementById("leaderboard");
  if (!container) return;

  const html = `
    <div class="leaderboard fade-in">
      <div class="leaderboard-header">
        <span>Rank</span>
        <span>Player</span>
        <span>Win %</span>
        <span>Points Avg.</span>
      </div>

      ${data.map((p, i) => `
        <div class="leaderboard-row ${p.name?.toLowerCase() === selectedPlayer ? "you" : ""}">
          <span>${i + 1}</span>
          <span>${capitalize(p.name)}</span>
          <span>${formatWinPctDisplay(p.winPct)}</span>
          <span>${(Number.isFinite(Number(p.pointsAvg)) ? Number(p.pointsAvg) : 0).toFixed(2)}</span>
        </div>
      `).join("")}
    </div>
  `;

  // 🔥 SMART RENDER (NO RE-RENDER IF SAME)
  if (container.dataset.last === html) return;
  container.dataset.last = html;

  // 🔥 SMOOTH TRANSITION
  container.style.opacity = "0";

  setTimeout(() => {
    container.innerHTML = html;
    container.style.opacity = "1";
    
    // 🔥 EARLY EXIT FOR RANKINGS PAGE
    if (!rankingsComponentsReady && document.getElementById("rankings")?.classList.contains("active")) {
      rankingsComponentsReady = true;
      updateLoadingProgress(95, "Loading complete...");
      setTimeout(() => {
        hideLoadingScreen();
      }, 100);
    }
  }, 100);
}

async function getHistory() {
  try {
    const { data, error } = await window.supabaseClient
      .from('history')
      .select('*')
      .order('Date', { ascending: false });
    
    if (error) throw error;
    
    // Transform Supabase data to match expected format
    const formatted = (data || []).map(row => ({
      date: row.Date,
      name: row.Player,
      winPct: parseFloat(row.WinPct) || 0,
      pointsAvg: parseFloat(row.PointsAvg) || 0
    }));
    
    historyCache = formatted;
    return formatted;
  } catch (err) {
    console.error("❌ Failed to fetch history from Supabase:", err);
    return [];
  }
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
    const delta = Number(s.change) || 0;
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
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }
  
  console.log("🏁 finishDay clicked");
  
  // Show loading bar
  const loadingBar = document.getElementById("doneLoadingBar");
  if (loadingBar) {
    loadingBar.style.display = "block";
  }
  
  function updateDoneProgress(percent) {
    const progress = document.querySelector(".done-loading-progress");
    if (progress) {
      progress.style.width = percent + "%";
    }
  }

  // 🔥 1. SNAPSHOT BEFORE
  updateDoneProgress(10);
  const before = await callAPI({ action: "getUserTrend" }, { force: true });

  // 🔔 REQUEST NOTIFICATION PERMISSION
  updateDoneProgress(15);
  if (window.OneSignal && !localStorage.getItem("notifAsked")) {
    OneSignal.push(() => {
      OneSignal.Notifications.requestPermission();
    });
    localStorage.setItem("notifAsked", "1");
  }

  // 🔥 3. SNAPSHOT AFTER
  updateDoneProgress(25);
  const after = await callAPI({ action: "getUserTrend" }, { force: true });


  const eventName = new Date().toISOString().split("T")[0];

  // 🔥 4. GET TODAY SETS (for wins + points)
  updateDoneProgress(35);
  const sets = await callAPI({ action: "getTodaySets" });
  if (!Array.isArray(sets)) {
    console.error("❌ finishDay failed: no sets data", sets);
    if (loadingBar) loadingBar.style.display = "none";
    return;
  }

  const results = {};

  // ===== BUILD WINS + POINTS =====
  updateDoneProgress(45);
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

  // ===== FETCH PREVIOUS HISTORY FOR EACH PLAYER =====
  updateDoneProgress(55);
  const previousHistoryMap = {};
  for (const name of Object.keys(results)) {
    const prev = await callAPI({
      action: "getPreviousHistoryEntry",
      name: name
    }, { force: true });
    previousHistoryMap[name] = prev;
  }

  // ===== ADD % CHANGE (comparing to PREVIOUS history entry) =====
  updateDoneProgress(65);
  const final = Object.keys(results).map(name => {
    const previous = previousHistoryMap[name] || { winPct: 0, pointsAvg: 0 };
    const current = before.find(p => p.name.toLowerCase() === name)?.winPct || 0;
    const change = Number(((current - previous.winPct) * 100).toFixed(2));

    console.log("📊 finishDay delta", {
      name,
      previousWinPct: previous.winPct,
      currentWinPct: current,
      afterWinPct: after.find(p => p.name.toLowerCase() === name)?.winPct || 0,
      change
    });

    return {
      name,
      wins: results[name].wins,
      points: results[name].points,
      change
    };
  });

  // ===== SORT (wins → points) =====
  updateDoneProgress(70);
  final.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.points - a.points;
  });

  // ===== RENDER =====
  updateDoneProgress(75);
  renderResults(final);
  setDayComplete(true);
  updateDoneUiVisibility();


// 🚫 prevent double processing
const { data: existing } = await window.supabaseClient
  .from("rating_history")
  .select("id")
  .eq("event_name", eventName)
  .limit(1);

let skipRatings = false;

if (existing && existing.length > 0) {
  console.log("⚠️ Event already processed, skipping ratings");
  skipRatings = true;
}

const matchesByPlayer = {};

sets.forEach(set => {
  const teamA = set.teamA.split("/").map(p => p.trim().toLowerCase());
  const teamB = set.teamB.split("/").map(p => p.trim().toLowerCase());

  const scores = set.scores
    .filter(s => s && s.includes("-"))
    .map(s => s.split("-").map(Number));

  [...teamA, ...teamB].forEach(player => {
    if (!matchesByPlayer[player]) matchesByPlayer[player] = [];
  });

  [...teamA, ...teamB].forEach(player => {
    const isTeamA = teamA.includes(player);

    matchesByPlayer[player].push({
      partner: isTeamA ? teamA.find(p => p !== player) : teamB.find(p => p !== player),
      opp1: isTeamA ? teamB[0] : teamA[0],
      opp2: isTeamA ? teamB[1] : teamA[1],
      scores
    });
  });
});



  // ===== SAVE HISTORY TO SUPABASE =====
  updateDoneProgress(80);
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    for (const player of final) {
      const trend = after.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (trend) {
        await window.supabaseClient
          .from('history')
          .insert([
            {
              Date: today,
              Player: player.name,
              WinPct: trend.winPct.toString(),
              PointsAvg: trend.pointsAvg.toString(),
              player_name: player.name,
              rating_before: oldRating,
              rating_after: newRating,
              delta: totalDelta,
              matches_played: matches.length,
              event_name: eventName
            }
          ]);
      }
    }
    console.log("✅ History saved to Supabase");
  } catch (err) {
    console.error("❌ Failed to save history to Supabase:", err);
  }

  await loadRankings();

  updateDoneProgress(90);
  console.log("📊 finishDay snapshots", {
    before,
    after,
    previousHistoryMap,
    final
  });

  const shareId = generateShareId();
  localStorage.setItem("results_" + shareId, JSON.stringify(final));

  // 🔥 ADD THIS (CRITICAL)
  await callAPI({
    action: "saveSharedResult",
    resultId: shareId,
    data: JSON.stringify(final)
  });



  for (const player of final) {
  const playerName = player.name.toLowerCase();

  const matches = matchesByPlayer[playerName] || [];

  // get current rating
  const { data: existing } = await window.supabaseClient
    .from("players")
    .select("bite_strength")
    .eq("name", player.name)
    .single();

  const oldRating = existing?.bite_strength ?? 50;

  // you must resolve ratings for other players
  const getRating = async (name) => {
    const { data } = await window.supabaseClient
      .from("players")
      .select("bite_strength")
      .eq("name", name)
      .single();

    return data?.bite_strength ?? 50;
  };

  let totalDelta = 0;

  for (const match of matches) {
    const R_partner = await getRating(match.partner);
    const R_opp1 = await getRating(match.opp1);
    const R_opp2 = await getRating(match.opp2);

    const R_team = (oldRating + R_partner) / 2;
    const R_opp = (R_opp1 + R_opp2) / 2;

    let score_for = 0;
    let score_against = 0;

    match.scores.forEach(([a, b]) => {
      score_for += a;
      score_against += b;
    });

    const d = score_for - score_against;
    const S = d > 0 ? 1 : 0;

    const E = 1 / (1 + Math.pow(10, (R_opp - R_team) / 12));
    const M = 1 + 0.75 * (Math.abs(d) / 12);

    const delta = 0.75 * M * (S - E);

    totalDelta += delta;
  }

  const newRating = oldRating + totalDelta;

  // save updated rating
  await window.supabaseClient
    .from("players")
    .upsert({
      name: player.name,
      bite_strength: newRating
    });

  // save history
  await window.supabaseClient
    .from("rating_history")
    .insert({
      player_name: player.name,
      rating_before: oldRating,
      rating_after: newRating,
      event_name: eventName,
      delta: totalDelta,
      matches_played: matches.length
    });
}

  updateDoneProgress(95);
  localStorage.setItem(`pbTracker_results_${todayKey()}`, buildResultsHtml(
    final.map(x => ({ ...x, key: x.name.toLowerCase(), displayName: x.name, prevWinPct: previousHistoryMap[x.name]?.winPct || 0 })),
    getMorningWinPctSnapshot(globalData.trend || before || []),
    before || []
  ));

  const shareUrl = `${window.location.origin}${getSiteBasePath()}share/?r=${shareId}`;

  const el = document.getElementById("dayResults");
  if (el) {
    el.innerHTML = localStorage.getItem(`pbTracker_results_${todayKey()}`);
    el.style.display = "block";
  }

  updateDoneProgress(100);
  if (loadingBar) {
    setTimeout(() => {
      loadingBar.style.display = "none";
    }, 300);
  }

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

async function loadSharedResults() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get("r") || params.get("share");

  if (!shareId) return false;

  // 🔥 TRY LOCAL FIRST
  let data = localStorage.getItem("results_" + shareId);

  // 🔥 FALLBACK TO BACKEND
  if (!data) {
    const res = await callAPI({
      action: "getSharedResult",
      resultId: shareId
    });

    if (!res || !res.length) return false;

    renderResults(res);
    return true;
  }

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

  const box = document.getElementById("dayResults");
  if (box) {
    box.innerHTML = html;
    box.style.display = "block";
  }
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
  const rankingsBox = document.getElementById("rankingsAnalytics");
  if (rankingsBox) rankingsBox.innerHTML = "";
  updateDoneUiVisibility();
  await loadTodaySetsAll();
  await loadRankings();

  chart?.destroy();
  chart = null;

  loadRankings();
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
  const menu = document.getElementById("sideMenu");
  // const overlay = document.getElementById("overlay");
 // const app = document.querySelector(".app");

 // const isOpen = menu.classList.toggle("open");

    menu.classList.toggle("open");
 // app.classList.toggle("blurred", isOpen);
}





function openShare() {
  const wrap = document.getElementById("shareModal");
  if (!wrap) return;

  wrap.style.display = "flex";
  wrap.innerHTML = `
    <div class="share-modal-overlay" onclick="closeShare()"></div>
    <div class="share-modal-content card">
      <div class="share-modal-header">
        <h3>Share Player Link</h3>
        <button class="close-btn" onclick="closeShare()">✕</button>
      </div>
      <p class="share-modal-text">Type a player name to copy their share link.</p>
      <div class="onboard-input-wrap">
        <input type="text" id="sharePlayerInput" class="onboard-input" placeholder="Start typing a name" autocomplete="off">
      </div>
      <button onclick="closeShare()" style="margin-top:10px; width:100%;">Cancel</button>
    </div>
  `;

  const input = document.getElementById("sharePlayerInput");
  if (input) {
    setTimeout(() => input.focus(), 100);
    attachShareAutocomplete(input);
  }
}

function attachShareAutocomplete(input) {
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
        triggerShareLink(picked);
      };
    });
  });

  input.addEventListener("blur", () => {
    setTimeout(() => { dropdown.innerHTML = ""; }, 200);
  });
}

function triggerShareLink(name) {
  if (!name) return;
  
  const shareUrl = `https://pbtrkr.app/share/?p=${encodeURIComponent(name.trim())}`;
  
  navigator.clipboard.writeText(shareUrl).then(() => {
    const modal = document.getElementById("shareModal");
    if (!modal) return;
    const content = modal.querySelector(".share-modal-content");
    if (!content) return;
    
    content.innerHTML = `
      <div class="share-modal-header">
        <h3>Link copied</h3>
      </div>
      <p class="share-modal-text" style="font-size: 16px; margin: 20px 0;">Link copied</p>
    `;
    
    setTimeout(() => {
      closeShare();
    }, 1000);
  }).catch(() => {
    alert("Failed to copy link");
  });
}

function closeShare() {
  const wrap = document.getElementById("shareModal");
  if (!wrap) return;
  wrap.style.display = "none";
  wrap.innerHTML = "";
}


function attachAutocomplete(input, date, col) {
  let dropdown = input.parentNode.querySelector(".autocomplete");

  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "autocomplete";
    input.parentNode.appendChild(dropdown);
  }

  input.addEventListener("input", () => {
    scheduleRefreshPausedUntil = Date.now() + 8000;
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

        // 🔥 NEW: queue change instead of API call
        scheduleDirty = true;

        pendingScheduleChanges.push({
          type: "name",
          date,
          col,
          name: el.innerText
        });

        updateSaveButton();

        console.log("📝 queued schedule change", { date, col, name: el.innerText });
      };
    });
  });

  // 🔥 close dropdown on blur
  input.addEventListener("blur", () => {
    setTimeout(() => dropdown.innerHTML = "", 150);
  });
}

function persistScheduleName(date, col, rawName) {
  const name = String(rawName || "").trim();
  if (!name) return;

  scheduleDirty = true;

  pendingScheduleChanges.push({
    type: "name",
    date,
    col,
    name
  });

  updateSaveButton();
}


function setWeekRange() {
  const monday = effectiveScheduleWeekMonday();
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const format = d =>
    `${d.getMonth()+1}/${d.getDate()}`;

  const el = document.getElementById("weekRange");
  if (el) {
    el.innerText = `${format(monday)} - ${format(friday)}`;
    if (isWeekend()) el.innerText += " (next week)";
  }
}



function showUnsavedIndicator(setNumber) {
  const header = document.querySelector(`.set-header[data-set="${setNumber}"]`);
  if (!header) return;
  
  let indicator = header.querySelector(".unsaved-dot");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "unsaved-dot";
    indicator.title = "Unsaved changes";
    header.appendChild(indicator);
  }
}

function removeUnsavedIndicator(setNumber) {
  const header = document.querySelector(`.set-header[data-set="${setNumber}"]`);
  if (!header) return;
  
  const indicator = header.querySelector(".unsaved-dot");
  if (indicator) {
    indicator.remove();
  }
}

let scoreTimeout;

function updateScore(set, gameIndex, input) {
  if (isDayComplete()) return;
  if (isEditingLocked) return;

  clearTimeout(scoreTimeout);

  const parent = input.parentElement;
  isEditingScores = true;

  const inputs = parent.querySelectorAll("input");
  if (inputs.length < 2) return;

  scoreTimeout = setTimeout(() => {
    const a = Number(inputs[0].value || 0);
    const b = Number(inputs[1].value || 0);

    const score = `${a}-${b}`;

    // 🔥 RESET SAVE BUTTON & SHOW UNSAVED INDICATOR
const btn = document.getElementById(`save-btn-${set}`);
if (btn && btn.classList.contains("saved")) {
  btn.innerText = "Save";
  btn.classList.remove("saved");
  showUnsavedIndicator(set);
}

    // 🔥 EMPTY = DO NOTHING
    if (a === 0 && b === 0) {
      isEditingScores = false;
      return;
    }

    input.blur();

    // 🔥 DETERMINE RESULT (UI ONLY)
    let result = "tie";
    if (a > b) result = "win";
    else if (b > a) result = "loss";

    const card = input.closest(".match-card");
    if (!card) {
      isEditingScores = false;
      return;
    }

    const badge = card.querySelector(".status-badge");
    if (badge) {
      badge.className = `status-badge ${result}`;
      badge.innerText = result;
    }

    // 🔥 LOCAL STATE UPDATE ONLY (NO API)
    if (globalData.sets) {
      const match = globalData.sets.find(m => m.set == set);
      if (match) {
        match.scores[gameIndex] = score;
      }
    }

    // 🔥 TRACK UNSAVED CHANGES
    const key = `${set}-${gameIndex}`;
    optimisticUpdates[key] = score;

    console.log("📝 Local score update only:", {
      set,
      game: gameIndex + 1,
      score
    });

    // 🔥 DONE EDITING (no fake saving UI)
    isEditingScores = false;

  }, 600);
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




function renderAnalyticsTable(title, columns, rows, highlightPlayer) {
  return `
    <div class="leaderboard">
      <div class="leaderboard-header">
        ${columns.map(c => `<span>${c}</span>`).join("")}
      </div>

      ${rows.map((r, i) => `
        <div class="leaderboard-row ${r.name === highlightPlayer ? "you" : ""}">
          ${Object.values(r).map(v => `<span>${v}</span>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function openBestPartner(player, stats) {
  const p = stats[player];

  const rows = Object.entries(p.partners)
    .map(([name, d]) => ({
      rank: "",
      name: capitalize(name),
      win: formatWinPctDisplay(d.wins / d.games)
    }))
    .sort((a,b)=>parseFloat(b.win)-parseFloat(a.win))
    .slice(0,10);

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  showAnalyticsModal(
    "Best Partners",
    ["Rank","Name","Win %"],
    rows,
    player,
    { highlightFirstRow: true, noHighlight: true }
  );
}
function openHardestOpponent(player, stats) {
  const p = stats[player];

  const rows = Object.entries(p.opponents)
    .map(([name, d]) => ({
      rank: "",
      name: capitalize(name),
      win: formatWinPctDisplay(d.wins / d.games)
    }))
    .sort((a,b)=>parseFloat(a.win)-parseFloat(b.win))
    .slice(0,10);

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  showAnalyticsModal(
    "Hardest Opponents",
    ["Rank","Name","Win %"],
    rows,
    player,
    { highlightFirstRow: true, noHighlight: true }
  );
}
function openLosingStreak(stats, selectedPlayer) {
  const rows = Object.entries(stats)
    .map(([name, d]) => ({
      rank: "",
      name: capitalize(name),
      streak: d.maxLoseStreak
    }))
    .sort((a,b)=>b.streak-a.streak);

  rows.forEach((r,i)=>r.rank = i+1);

  showAnalyticsModal(
    "Losing Streaks",
    ["Rank","Name","Streak"],
    rows,
    selectedPlayer,
    { noHighlight: false }
  );
}
function openGamesPlayed(stats, selectedPlayer) {
const maxGames = Math.max(...Object.values(stats).map(d => d.games)) || 1;

const rows = Object.entries(stats)
  .map(([name, d]) => ({
    name: capitalize(name),
    games: d.games,
    pct: Math.round((d.games / maxGames) * 100) + "%"
  }))
  .sort((a, b) => Number(b.games || 0) - Number(a.games || 0));

  showAnalyticsModal(
    "Games Played",
    ["Name","Games","%"],
    rows,
    selectedPlayer,
    { noHighlight: false }
  );
}
function openBestWeekdayModal(playerKey, rows) {
  const tableRows = (rows || []).map(r => ({
    day: r.day,
    wins: String(r.wins),
    games: String(r.games),
    pct: formatWinPctDisplay(r.pct)
  }));
  showAnalyticsModal(
    "Best day (weekday)",
    ["Day", "Wins", "Games", "Win %"],
    tableRows,
    playerKey,
    { noHighlight: true }
  );
}
function openBestDay(player, stats) {
  if (!stats || !stats[player]) return;
  const days = stats[player].dailyWins;
  const best = Object.entries(days).sort((a, b) => b[1] - a[1])[0];
  showAnalyticsModal(
    "Best calendar day",
    ["Date", "Wins"],
    [{ date: String(best?.[0] ?? "—"), wins: String(best?.[1] ?? "0") }],
    player,
    { noHighlight: true }
  );
}

let lastModalBuildStats = null;
let lastModalPlayerKey = null;
let lastModalDeep = null;
let lastModalWinPctStr = "";
let lastModalAvgPointsStr = "";
let lastModalGamesPlayed = 0;
let lastModalTrend = null;
let lastModalAllSets = null;

function buildRankedStatRows(entries, selectedPlayer, formatter) {
  const rows = [...entries]
    .sort((a, b) => {
      const diff = Number(b.value || 0) - Number(a.value || 0);
      if (diff !== 0) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .map((row, index) => ({
      rankNumber: index + 1,
      name: capitalize(row.name),
      value: row.value
    }));

  const selectedIndex = rows.findIndex(row => String(row.name || "").toLowerCase() === String(selectedPlayer || "").toLowerCase());
  if (selectedIndex === -1 || selectedIndex < 6) {
    return rows.slice(0, 6).map(row => ({
      rank: String(row.rankNumber),
      name: row.name,
      value: formatter(row.value)
    }));
  }

  let start = Math.max(6, selectedIndex - 2);
  let end = Math.min(rows.length - 1, selectedIndex + 2);

  while ((end - start) < 4 && start > 6) start--;
  while ((end - start) < 4 && end < rows.length - 1) end++;

  const topRows = rows.slice(0, 6);
  const focusRows = rows.slice(start, end + 1);

  return [
    ...topRows.map(row => ({
      rank: String(row.rankNumber),
      name: row.name,
      value: formatter(row.value)
    })),
    { rank: "...", name: "...", value: "..." },
    ...focusRows.map(row => ({
      rank: String(row.rankNumber),
      name: row.name,
      value: formatter(row.value)
    }))
  ];
}

function handleAnalyticsStatClick(kind) {
  console.log("📊 analytics stat clicked", kind);
  const pk = lastModalPlayerKey;
  const stats = lastModalBuildStats;
  const deep = lastModalDeep;
  if (!pk) return;

  if (kind === "winPct") {
    const rows = buildRankedStatRows(
      (lastModalTrend || []).map(player => ({
        name: String(player.name || "").toLowerCase(),
        value: Number(player.winPct) || 0
      })),
      pk,
      value => formatWinPctDisplay(value)
    );
    showAnalyticsModal(
      "Win %",
      ["Rank", "Name", "Avg. Win %"],
      rows,
      pk,
      { noHighlight: false }
    );
    return;
  }
  if (kind === "avgPoints") {
    const rows = buildRankedStatRows(
      (lastModalTrend || []).map(player => ({
        name: String(player.name || "").toLowerCase(),
        value: Number(player.pointsAvg) || 0
      })),
      pk,
      value => Number(value || 0).toFixed(2)
    );
    showAnalyticsModal(
      "Avg points",
      ["Rank", "Name", "Avg. Points per Game"],
      rows,
      pk,
      { noHighlight: false }
    );
    return;
  }
  if (kind === "winStreak") {
    const allPlayerKeys = Array.from(new Set([
      ...(lastModalTrend || []).map(player => String(player.name || "").toLowerCase()),
      ...Object.keys(lastModalBuildStats || {})
    ]));
    const rows = buildRankedStatRows(
      allPlayerKeys.map(playerName => ({
        name: playerName,
        value: analyzePlayerFromSets(lastModalAllSets || [], playerName).winStreak || 0
      })),
      pk,
      value => String(value || 0)
    );
    showAnalyticsModal(
      "Longest win streak",
      ["Rank", "Name", "Longest Win Streak"],
      rows,
      pk,
      { noHighlight: false }
    );
    return;
  }
  if (kind === "bestDay") {
    openBestWeekdayModal(pk, deep?.weekdayRows || []);
    return;
  }
  
  if (kind === "biteStrength") {
    const rows = buildRankedStatRows(
      (lastModalTrend || []).map(player => ({
        name: String(player.name || "").toLowerCase(),
        value: player.biteStrength ? Number(player.biteStrength) : BITE_STRENGTH_BASE
      })),
      pk,
      value => (value || BITE_STRENGTH_BASE).toFixed(2)
    );
    showAnalyticsModal(
      "Power Rating",
      ["Rank", "Name", "Power Rating"],
      rows,
      pk,
      { noHighlight: false }
    );
    return;
  }

  if (!stats || !stats[pk]) return;

  if (kind === "bestPartner") openBestPartner(pk, stats);
  else if (kind === "hardest") openHardestOpponent(pk, stats);
  else if (kind === "loseStreak") openLosingStreak(stats, pk);
  else if (kind === "games") openGamesPlayed(stats, pk);
}

function updateSaveButton() {
  const btn = document.getElementById("scheduleSaveBtn");
  if (!btn) return;

  if (scheduleDirty) {
    btn.innerText = "Save";
    btn.classList.remove("saved");
  } else {
    btn.innerText = "Saved";
    btn.classList.add("saved");
  }
}



async function saveScheduleChanges() {
  if (isEditingLocked) {
    alert("⚠️ Editing is locked. Enter the access code to proceed.");
    return;
  }
  
  if (!scheduleDirty) return;

  console.log("💾 Saving FULL schedule");

  const days = {};

  // 🔥 STEP 1: build full day state
  pendingScheduleChanges.forEach(change => {
    if (!days[change.date]) {
      days[change.date] = {
        names: ["", "", "", ""],
        status: [0, 0, 0, 0]
      };
    }

    if (change.type === "name") {
      days[change.date].names[change.col - 1] = change.name.toLowerCase();
    }

    if (change.type === "status") {
      days[change.date].status[change.col - 1] = change.status;
    }
  });

  // 🔥 STEP 2: send structured data
  let hasErrors = false;
  let errorMessages = [];

  for (const date in days) {
    // 🔥 FIX: Extract date directly from ISO string to avoid timezone offset issues
    const dateParts = date.split("T")[0].split("-"); // Extract "YYYY-MM-DD" part
    const formattedDate = `${Number(dateParts[1])}/${Number(dateParts[2])}/${dateParts[0]}`; // Convert to M/D/YYYY

    // 🔥 BUILD PARTIAL CHANGES INSTEAD OF FULL PAYLOAD
    const changes = [];

// 🔥 LOOP THROUGH pending changes (THIS is your source of truth)
pendingScheduleChanges.forEach(c => {
  if (c.date !== date) return;

  if (c.type === "status") {
    changes.push({
      field: `s${c.col}`,
      value: c.status
    });
  }

  if (c.type === "name") {
    changes.push({
      field: `p${c.col}`,
      value: c.name
    });
  }
});

// 🔥 NOTHING CHANGED → SKIP API CALL
if (!changes.length) continue;

// 🔥 NEW PAYLOAD (ONLY CHANGED FIELDS)
const payload = {
  action: "updateSchedulePartial",
  date: formattedDate,
  changes: JSON.stringify(changes)
};

console.log("📤 sending:", payload);

const response = await callAPI(payload);

// 🔥 CHECK FOR ERRORS
if (response && response.error) {
  hasErrors = true;
  errorMessages.push(`❌ Failed to save ${formattedDate}: ${response.error}`);
  console.error("Save error:", response.error);
}
}

  pendingScheduleChanges = [];
  scheduleDirty = false;

  updateSaveButton();

  // 🔥 SHOW ERROR MESSAGE IF ANY FAILED
  if (hasErrors) {
    const errorBox = document.createElement("div");
    errorBox.className = "error-notification";
    errorBox.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: #ff6b6b;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-width: 90%;
      word-wrap: break-word;
    `;
    errorBox.innerText = errorMessages.join("\n");
    document.body.appendChild(errorBox);

    setTimeout(() => {
      errorBox.style.opacity = "0";
      errorBox.style.transition = "opacity 0.3s ease-out";
      setTimeout(() => errorBox.remove(), 300);
    }, 4000);

    return;
  }

  console.log("✅ Schedule saved to sheet");
}



function renderReverseTables(selectedPlayer, stats) {
  const bestWithMe = [];
  const hardestAgainstMe = [];

  Object.entries(stats).forEach(([name, d]) => {
    if (name === selectedPlayer) return;

    if (d.partners[selectedPlayer]) {
      const p = d.partners[selectedPlayer];
      bestWithMe.push({
        name: capitalize(name),
        val: formatWinPctDisplay(p.wins / p.games)
      });
    }

    if (d.opponents[selectedPlayer]) {
      const o = d.opponents[selectedPlayer];
      hardestAgainstMe.push({
        name: capitalize(name),
        val: formatWinPctDisplay(o.wins / o.games)
      });
    }
  });

  document.getElementById("rankingsAnalytics").innerHTML = `
    <h3>Best With Me</h3>
    ${renderMiniTable(bestWithMe)}

    <h3>Hardest Against Me</h3>
    ${renderMiniTable(hardestAgainstMe)}
  `;
}







function buildPlayerStats(history) {
  const stats = {};

  function init(p) {
    if (!stats[p]) {
      stats[p] = {
        games: 0,
        wins: 0,
        partners: {},
        opponents: {},
        currentLoseStreak: 0,
        maxLoseStreak: 0,
        dailyWins: {}
      };
    }
  }

  history.forEach(match => {
    const teamA = match.teamA.split("/").map(p => p.trim().toLowerCase());
    const teamB = match.teamB.split("/").map(p => p.trim().toLowerCase());

    const date = match.date;

    match.scores.forEach(score => {
      if (!score || !score.includes("-")) return;

      const [a, b] = score.split("-").map(Number);
      if (isNaN(a) || isNaN(b)) return;

      const aWin = a > b;
      const bWin = b > a;

      [...teamA, ...teamB].forEach(init);

      // TEAM A
      teamA.forEach(p => {
        stats[p].games++;

        if (aWin) {
          stats[p].wins++;
          stats[p].currentLoseStreak = 0;
        } else {
          stats[p].currentLoseStreak++;
          stats[p].maxLoseStreak = Math.max(
            stats[p].maxLoseStreak,
            stats[p].currentLoseStreak
          );
        }

        stats[p].dailyWins[date] = (stats[p].dailyWins[date] || 0) + (aWin ? 1 : 0);

        teamA.forEach(partner => {
          if (partner !== p) {
            const key = partner;
            if (!stats[p].partners[key]) stats[p].partners[key] = { wins: 0, games: 0 };
            stats[p].partners[key].games++;
            if (aWin) stats[p].partners[key].wins++;
          }
        });

        teamB.forEach(opp => {
          if (!stats[p].opponents[opp]) stats[p].opponents[opp] = { wins: 0, games: 0 };
          stats[p].opponents[opp].games++;
          if (aWin) stats[p].opponents[opp].wins++;
        });
      });

      // TEAM B
      teamB.forEach(p => {
        stats[p].games++;

        if (bWin) {
          stats[p].wins++;
          stats[p].currentLoseStreak = 0;
        } else {
          stats[p].currentLoseStreak++;
          stats[p].maxLoseStreak = Math.max(
            stats[p].maxLoseStreak,
            stats[p].currentLoseStreak
          );
        }

        stats[p].dailyWins[date] = (stats[p].dailyWins[date] || 0) + (bWin ? 1 : 0);

        teamB.forEach(partner => {
          if (partner !== p) {
            if (!stats[p].partners[partner]) stats[p].partners[partner] = { wins: 0, games: 0 };
            stats[p].partners[partner].games++;
            if (bWin) stats[p].partners[partner].wins++;
          }
        });

        teamA.forEach(opp => {
          if (!stats[p].opponents[opp]) stats[p].opponents[opp] = { wins: 0, games: 0 };
          stats[p].opponents[opp].games++;
          if (bWin) stats[p].opponents[opp].wins++;
        });
      });
    });
  });

  return stats;
}



function closeGlobalAnalyticsModal() {
  const el = document.getElementById("globalAnalyticsModal");
  if (!el) return;
  el.innerHTML = "";
  el.classList.remove("is-open");
  el.setAttribute("hidden", "");
}

function getAnalyticsTablesContainer() {
  const activePage = document.querySelector(".page.active")?.id;
  if (activePage === "rankings") return document.getElementById("rankingsAnalyticsTables");
  return document.getElementById("dashboardAnalyticsTables");
}

function closeAnalyticsPanel(buttonEl) {
  const panel = buttonEl?.closest(".analytics-table-panel");
  if (panel) panel.remove();
}

function analyticsRowHighlightClass(r, selectedPlayer, opts) {
  // Highlight first row in blue if requested
  if (opts.highlightFirstRow && opts._isFirstRow) {
    return "highlight-blue";
  }
  
  if (opts.noHighlight || selectedPlayer == null || selectedPlayer === "") return "";
  const sp = String(selectedPlayer).toLowerCase();
  const rn = (r.name != null ? String(r.name) : "").toLowerCase();
  if (rn === sp) return "you";
  if (String(r.name || "") === capitalize(sp)) return "you";
  return "";
}

function showAnalyticsModal(title, columns, rows, selectedPlayer, opts = {}) {
  const container = getAnalyticsTablesContainer();
  if (!container) return;
  const esc = escapeHtml;
  const columnTemplate = columns.length === 2
    ? "1.2fr 1fr"
    : columns.length === 3
      ? "72px minmax(0, 1fr) 120px"
      : columns.length === 4
        ? "60px 1.5fr 80px 100px"
        : `repeat(${columns.length}, minmax(0, 1fr))`;
  
  // Calculate z-index based on how many panels are already open
  const existingPanels = container.querySelectorAll(".analytics-table-panel");
  const zIndex = 100 + existingPanels.length;
  
  const body = `
    <div class="analytics-table-panel" style="z-index: ${zIndex};">
      <div class="analytics-table-head">
        <h3 class="global-analytics-modal__title">${esc(title)}</h3>
        <button type="button" class="global-analytics-modal__close" onclick="closeAnalyticsPanel(this)" aria-label="Close">&times;</button>
      </div>
      <div class="leaderboard leaderboard--modal" style="--leaderboard-grid: ${columnTemplate};">
        <div class="leaderboard-header">
          ${columns.map(c => `<span>${esc(c)}</span>`).join("")}
        </div>
        ${rows
          .map((r, idx) => {
            const rowOpts = { ...opts, _isFirstRow: idx === 0 };
            return `
        <div class="leaderboard-row ${analyticsRowHighlightClass(r, selectedPlayer, rowOpts)}">
          ${Object.values(r)
            .map(v => `<span>${esc(String(v))}</span>`)
            .join("")}
        </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
  container.insertAdjacentHTML("afterbegin", body);
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




// ===== Power Rating CALCULATION (ELO-LIKE RATING) =====
function calculateBiteStrength(playerName, sets, trendData) {
  const pl = String(playerName || "").toLowerCase();
  if (!Array.isArray(sets)) sets = [];
  if (!Array.isArray(trendData)) trendData = [];

  // Get initial rating (or use base)
  const playerTrend = trendData.find(p => String(p.name || "").toLowerCase() === pl);
  let currentRating = playerTrend?.biteStrength ? Number(playerTrend.biteStrength) : BITE_STRENGTH_BASE;
  
  let totalDelta = 0;
  const matches = [];

  // Build match list with score deltas
  sets.forEach(set => {
    const teamA = (set.teamA || "").toLowerCase().split("/").map(p => p.trim());
    const teamB = (set.teamB || "").toLowerCase().split("/").map(p => p.trim());
    
    const isPlayerA = teamA.includes(pl);
    const isPlayerB = teamB.includes(pl);
    if (!isPlayerA && !isPlayerB) return;

    const myTeam = isPlayerA ? teamA : teamB;
    const oppTeam = isPlayerA ? teamB : teamA;
    
    (set.scores || []).forEach(score => {
      if (!score || !String(score).includes("-")) return;
      
      const [aScore, bScore] = score.split("-").map(Number);
      const isWin = (isPlayerA && aScore > bScore) || (isPlayerB && bScore > aScore);
      
      const scoreDiff = isPlayerA ? (aScore - bScore) : (bScore - aScore);
      const absDiff = Math.abs(scoreDiff);
      
      // Get partner rating (use base if not found)
      const partner = myTeam.find(p => p !== pl);
      const partnerObj = trendData.find(t => String(t.name || "").toLowerCase() === partner?.toLowerCase());
      const R_partner = partnerObj?.biteStrength ? Number(partnerObj.biteStrength) : BITE_STRENGTH_BASE;
      
      // Get opponent ratings
      const opp1Obj = trendData.find(t => String(t.name || "").toLowerCase() === oppTeam[0]?.toLowerCase());
      const opp2Obj = trendData.find(t => String(t.name || "").toLowerCase() === oppTeam[1]?.toLowerCase());
      const R_opp1 = opp1Obj?.biteStrength ? Number(opp1Obj.biteStrength) : BITE_STRENGTH_BASE;
      const R_opp2 = opp2Obj?.biteStrength ? Number(opp2Obj.biteStrength) : BITE_STRENGTH_BASE;
      
      // Team ratings
      const R_team = (currentRating + R_partner) / 2;
      const R_opp = (R_opp1 + R_opp2) / 2;
      
      // Expected win probability
      const E = 1 / (1 + Math.pow(10, (R_opp - R_team) / BITE_STRENGTH_D));
      
      // Margin multiplier
      const M = 1 + BITE_STRENGTH_ALPHA * (absDiff / BITE_STRENGTH_MAX_SCORE);
      
      // Rating delta
      const S = isWin ? 1 : 0;
      const delta = BITE_STRENGTH_K * M * (S - E);
      
      totalDelta += delta;
      matches.push({ delta, isWin, scoreDiff: absDiff });
    });
  });

  const newRating = currentRating + totalDelta;
  return Math.max(0, Math.round(newRating * 100) / 100); // Round to 2 decimals, min 0
}

function analyzePlayerFromSets(sets, player) {
  sets = sortSetsChronologically(sets || []);
  player = player.toLowerCase();

  let partnerStats = {};
  let opponentStats = {};
  let gameResults = []; // 1 = win, 0 = loss
  const weekdayStats = {};

  sets.forEach(set => {
    const teamA = (set.teamA || "").toLowerCase().split("/").map(p => p.trim());
    const teamB = (set.teamB || "").toLowerCase().split("/").map(p => p.trim());
    const setDate = set.date ? new Date(set.date) : null;
    const weekday =
      setDate && !isNaN(setDate.getTime()) ? setDate.getDay() : null;

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

      if (weekday !== null) {
        if (!weekdayStats[weekday]) weekdayStats[weekday] = { wins: 0, games: 0 };
        weekdayStats[weekday].games++;
        if (won) weekdayStats[weekday].wins++;
      }

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

  const wdNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let bestWeekdayLabel = "—";
  let bestWeekdayPct = -1;
  const weekdayRows = Object.entries(weekdayStats)
    .map(([wd, s]) => ({
      day: wdNames[Number(wd)],
      wins: s.wins,
      games: s.games,
      pct: s.games ? s.wins / s.games : 0
    }))
    .filter(r => r.games > 0)
    .sort((a, b) => b.pct - a.pct || b.games - a.games);

  weekdayRows.forEach(r => {
    if (r.games >= 1 && r.pct > bestWeekdayPct) {
      bestWeekdayPct = r.pct;
      bestWeekdayLabel = r.day;
    }
  });

  return {
    bestPartner,
    hardestOpponent,
    winStreak: maxWin,
    loseStreak: maxLose,
    bestWeekdayLabel,
    weekdayRows
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
  
  // Calculate Power Rating
  const biteStrength = calculateBiteStrength(pl, allSets, trend);

  const dropdownSorted = sortPlayersForDropdown(trend);
  lastModalBuildStats = buildPlayerStats(allSets);
  lastModalPlayerKey = pl;
  lastModalDeep = deep;
  lastModalWinPctStr = winPctStr;
  lastModalAvgPointsStr = avgPointsSafe.toFixed(2);
  lastModalGamesPlayed = gamesPlayed;
  lastModalTrend = trend;
  lastModalAllSets = allSets;

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

        <div class="stat green" role="button" tabindex="0" onclick="handleAnalyticsStatClick('bestPartner')">
          <div class="stat-title">Best Partner</div>
          <div class="stat-value">${statLabelName(deep.bestPartner)}</div>
        </div>

        <div class="stat blue" role="button" tabindex="0" onclick="handleAnalyticsStatClick('winPct')">
          <div class="stat-title">Win %</div>
          <div class="stat-value">${winPctStr}</div>
        </div>

        <div class="stat yellow" role="button" tabindex="0" onclick="handleAnalyticsStatClick('avgPoints')">
          <div class="stat-title">Avg Points</div>
          <div class="stat-value">${avgPointsSafe.toFixed(2)}</div>
        </div>

        <div class="stat purple" role="button" tabindex="0" onclick="handleAnalyticsStatClick('winStreak')">
          <div class="stat-title">Longest Win Streak</div>
          <div class="stat-value">${deep.winStreak}</div>
        </div>

        <div class="stat teal" role="button" tabindex="0" onclick="handleAnalyticsStatClick('bestDay')">
          <div class="stat-title">Best Day</div>
          <div class="stat-value">${deep.bestWeekdayLabel}</div>
        </div>

        <div class="stat red" role="button" tabindex="0" onclick="handleAnalyticsStatClick('hardest')">
          <div class="stat-title">Hardest Opponent</div>
          <div class="stat-value">${statLabelName(deep.hardestOpponent)}</div>
        </div>

        <div class="stat orange" role="button" tabindex="0" onclick="handleAnalyticsStatClick('loseStreak')">
          <div class="stat-title">Losing Streak</div>
          <div class="stat-value">${deep.loseStreak}</div>
        </div>

        <div class="stat gray" role="button" tabindex="0" onclick="handleAnalyticsStatClick('games')">
          <div class="stat-title">Games Played</div>
          <div class="stat-value">${gamesPlayed}</div>
        </div>

        <div class="stat bite-strength-stat" role="button" tabindex="0" onclick="handleAnalyticsStatClick('biteStrength')">
          <div class="stat-title">Rating</div>
          <div class="stat-value">${biteStrength.toFixed(2)}</div>
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






function renderGreeting() {
  const el = document.getElementById("greetingText");
  if (!el) return;

  const player =
    getPlayerFromURL() ||
    getPreferredPlayerFromStorage() ||
    localStorage.getItem("player");

  el.innerText = getGreeting(player);
}

renderGreeting();



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
  const base = "/pbTracker/";
  const url = new URL(window.location.origin + base);

  const currentParams = new URLSearchParams(window.location.search);
  const player =
    currentParams.get("p") ||
    selectedPlayer ||
    localStorage.getItem("player");

  // ✅ always preserve player
  if (player) {
    url.searchParams.set("p", player);
  }

  // ✅ ALWAYS set page (fixes bugs)
  url.searchParams.set("page", page);

  // ✅ update URL without reload
  window.history.pushState({}, "", url);

  // ✅ update UI
  showPage(page);

  // ✅ CLOSE MENU (important)
  const menu = document.getElementById("sideMenu");
  if (menu) menu.classList.remove("open");
}

function goTo(page) {
  const params = new URLSearchParams(window.location.search);
  const player = params.get("p");

  const url = new URL(window.location.origin + "/pbTracker/");

  if (player) {
    url.searchParams.set("p", player);
  }

  if (page !== "input") {
    url.searchParams.set("page", page);
  }

  window.location.href = url.toString();
}
window.addEventListener("popstate", () => {
  const page = getRoutePage();
  showPage(page);
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initApp();
  } catch (err) {
    console.error("LOAD FAILED", err);
  }
});

async function preloadData() {
  callAPI({ action: "getUserTrend" });
  callAPI({ action: "getSchedule" });
}



window.addEventListener("load", async () => {
  console.log("🚀 App starting");

  try {
    await initApp();
  } catch (e) {
    console.error("Startup crash:", e);
  }

  if (!refreshLoopStarted) {
    refreshLoopStarted = true;
    setInterval(ultraSmartRefresh, 5000);
  }
});


window.addEventListener("beforeunload", function (e) {
  const hasUnsaved = Object.keys(optimisticUpdates).length > 0 || scheduleDirty;

  if (!hasUnsaved) return;

  e.preventDefault();
  e.returnValue = ""; // required for Chrome
});



// ===============================
// 🔥 VISITOR TRACKING
// ===============================
async function getVisitorContext() {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();

    return {
      ip: data.ip,
      city: data.city,
      region: data.region,
      org: data.org
    };
  } catch {
    return {};
  }
}

async function getVisitorIp() {
  // Legacy function - no longer used, returns device_id
  return getOrCreateDeviceId();
}

async function trackVisitor() {
  try {
    const device = getOrCreateDeviceId();
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page") || getRoutePage() || window.location.pathname;

    // 🔥 get location data ONCE
    if (!cachedVisitorContext) {
      cachedVisitorContext = await getVisitorContext();
    }

    const visitor = {
      device_id: device,
      ip: cachedVisitorContext.ip || null,
      city: cachedVisitorContext.city || null,
      region: cachedVisitorContext.region || null,
      org: cachedVisitorContext.org || null,
      page: page || "unknown",
      full_url: window.location.href,
      query: window.location.search || null,
      mode: params.get("p") || null,
      time: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    console.log("🔍 Tracking visitor:", visitor);

    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from("visitors")
        .insert([visitor])
        .select();

      if (error) {
        console.error("❌ Visitor tracking error:", error);
      } else {
        console.log("✅ Visitor tracked:", data);
      }
    } else {
      console.warn("⚠️ Supabase client not available");
    }

  } catch (err) {
    console.error("❌ Track visitor exception:", err);
  }
}
