const API_URL = "PASTE_YOUR_APPS_SCRIPT_URL_HERE";

// remove loading screen
window.onload = () => {
  setTimeout(() => {
    document.getElementById("loading").style.display = "none";
  }, 1000);
};

async function callAPI(data) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(data)
  });
  return await res.json();
}

async function submitScore() {
  const set = document.getElementById("set").value;
  const game = document.getElementById("game").value;
  const score = document.getElementById("score").value;

  await callAPI({
    action: "score",
    set,
    game,
    score
  });

  alert("Score submitted!");
}

async function generateGames() {
  await callAPI({ action: "games" });
  alert("Games generated!");
}

async function completeDay() {
  await callAPI({ action: "done" });
  alert("Day completed!");
}