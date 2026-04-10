const API_URL = "https://script.google.com/macros/s/AKfycbyb7F3okADxJpkwAZahSRuGkKArYUwS8DBPAnvuSb5auQOSWNEg-4i_Ffy7y7RHFe9M/exec";
function getPlayerFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("player");
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
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// LOAD LEADERBOARD
document.addEventListener("DOMContentLoaded", async () => {
  const data = await callAPI({ action: "getUserTrend" });
  if (!data) return;

  const playerParam = getPlayerFromURL();

  if (playerParam) {
    const player = data.find(p =>
      p.name.toLowerCase() === playerParam.toLowerCase()
    );

    if (player) {
      renderPlayerCard(player);
      return;
    }
  }

  // fallback = leaderboard
  renderLeaderboard(data);
});

function renderPlayerCard(player) {
  document.getElementById("leaderboard").innerHTML = `
    <div class="card">
      <div class="card-title">🏆 ${capitalize(player.name)}</div>

      <div style="font-size: 32px; margin: 10px 0;">
        ${Math.round(player.winPct * 100)}%
      </div>

      <div>Win Percentage</div>

      <div style="margin-top: 10px;">
        Avg Points: ${player.pointsAvg.toFixed(1)}
      </div>

      <div style="margin-top: 10px; color:#aaa;">
        You're climbing the leaderboard 📈
      </div>
    </div>
  `;
}

function renderLeaderboard(data) {
  const top = [...data]
    .filter(p => p.winPct > 0)
    .sort((a,b) => b.winPct - a.winPct)
    .slice(0, 5);

  document.getElementById("leaderboard").innerHTML = `
    <div class="card-title">Top Players</div>
    ${top.map((p,i)=>`
      <div>${i+1}. ${capitalize(p.name)} — ${Math.round(p.winPct*100)}%</div>
    `).join("")}
  `;
}


// INSTALL GUIDE
function showInstallGuide() {
  if (/iphone|ipad/i.test(navigator.userAgent)) {
    alert("📲 Tap Share → 'Add to Home Screen'");
  } else {
    alert("📲 Use your browser menu → 'Install App'");
  }
}

// ENTER MAIN APP
function enterApp() {
  window.location.href = "https://maxhydell.github.io/";
}