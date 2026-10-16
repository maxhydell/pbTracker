(function attachPbtrkrPredictions(root) {
  function entries(predictions) {
    if (!predictions || typeof predictions !== "object" || Array.isArray(predictions)) return [];
    return Object.entries(predictions).filter(([, prediction]) =>
      prediction && typeof prediction === "object"
    );
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function ratingValue(player, key) {
    const value = player?.[key];
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  async function buildSetPrediction(set, players, scores, predictScore, calculateRatings) {
    const teamA = String(set?.teamA || "").split("/").map(name => name.trim()).filter(Boolean);
    const teamB = String(set?.teamB || "").split("/").map(name => name.trim()).filter(Boolean);
    if (!teamA.length || !teamB.length) {
      return { available: false, reason: "Both teams need players before a prediction is available." };
    }

    const playerByName = new Map((Array.isArray(players) ? players : [])
      .map(player => [normalizeName(player?.name), player]));
    const teamPlayers = [...teamA, ...teamB].map(name => ({
      name,
      player: playerByName.get(normalizeName(name))
    }));
    const missingPlayers = teamPlayers
      .filter(({ player }) => !player || ratingValue(player, "PWRank") === null)
      .map(({ name }) => name);
    if (missingPlayers.length) {
      return {
        available: false,
        reason: `Power Rating unavailable for ${[...new Set(missingPlayers)].join(", ")}.`,
        missingPlayers: [...new Set(missingPlayers)]
      };
    }

    const average = names => names.reduce((sum, name) =>
      sum + ratingValue(playerByName.get(normalizeName(name)), "PWRank"), 0) / names.length;
    const forecastScore = predictScore(average(teamA), average(teamB));
    const normalizedScores = (Array.isArray(scores) ? scores : [])
      .map(score => String(score ?? "").trim());
    const hasEnteredScore = normalizedScores.some(score => /^\d+-\d+$/.test(score));
    const ratingChanges = hasEnteredScore && typeof calculateRatings === "function"
      ? await calculateRatings({ ...set, scores: normalizedScores }, players)
      : [];

    return {
      available: true,
      teamA,
      teamB,
      forecastScore,
      ratingChanges: Array.isArray(ratingChanges) ? ratingChanges : [],
      hasEnteredScore
    };
  }

  const api = { entries, normalizeName, ratingValue, buildSetPrediction };
  root.PBTRKRPredictions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);