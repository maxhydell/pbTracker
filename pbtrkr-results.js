(function (root) {
  "use strict";

  function playerKey(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function teamPlayers(value) {
    return String(value || "")
      .split("/")
      .map(name => name.trim())
      .filter(Boolean);
  }

  function parseCompletedGameScore(value) {
    const match = String(value ?? "").trim().match(/^(\d+)-(\d+)$/);
    if (!match) return null;
    const pointsA = Number(match[1]);
    const pointsB = Number(match[2]);
    if (!Number.isSafeInteger(pointsA) || !Number.isSafeInteger(pointsB) || pointsA === pointsB) {
      return null;
    }
    return { pointsA, pointsB };
  }

  function sameRating(valueA, valueB) {
    return Number.isFinite(valueA)
      && Number.isFinite(valueB)
      && Math.abs(valueA - valueB) < 0.000000001;
  }

  function reconstructRatingSpan(rows) {
    if (!rows.length) return null;
    const seenSets = new Set();
    const snapshots = [];
    for (const row of rows) {
      const setNumber = String(row?.set_number ?? "").trim();
      const before = Number(row?.dupr_before);
      const after = Number(row?.dupr_after);
      if (!setNumber || seenSets.has(setNumber) || !Number.isFinite(before) || !Number.isFinite(after)) {
        return null;
      }
      seenSets.add(setNumber);
      snapshots.push({ before, after });
    }

    if (snapshots.every(snapshot =>
      sameRating(snapshot.before, snapshots[0].before)
      && sameRating(snapshot.after, snapshots[0].after)
      && sameRating(snapshot.before, snapshot.after)
    )) {
      return { before: snapshots[0].before, after: snapshots[0].after };
    }

    const starts = snapshots.filter(snapshot => !snapshots.some(other =>
      other !== snapshot && sameRating(other.after, snapshot.before)
    ));
    if (starts.length !== 1) return null;

    const ordered = [starts[0]];
    const used = new Set([starts[0]]);
    while (ordered.length < snapshots.length) {
      const current = ordered[ordered.length - 1];
      const next = snapshots.filter(snapshot =>
        !used.has(snapshot) && sameRating(current.after, snapshot.before)
      );
      if (next.length !== 1) return null;
      ordered.push(next[0]);
      used.add(next[0]);
    }

    return {
      before: ordered[0].before,
      after: ordered[ordered.length - 1].after
    };
  }

  function emptyPlayerStats() {
    return {
      pointsEarned: 0,
      pointsAllowed: 0,
      completedGames: 0,
      incompleteScores: false,
      playedSets: new Set()
    };
  }

  function calculateDayStatistics(sets, rankedPlayers, ratingEvents) {
    const playerStats = new Map();
    const participantNames = new Map();
    const resolvedSets = Array.isArray(sets) ? sets : [];

    function ensurePlayer(name) {
      const key = playerKey(name);
      if (!key) return null;
      if (!playerStats.has(key)) {
        playerStats.set(key, emptyPlayerStats());
        participantNames.set(key, String(name).trim());
      }
      return key;
    }

    resolvedSets.forEach(set => {
      const teamA = teamPlayers(set?.teamA);
      const teamB = teamPlayers(set?.teamB);
      const teamAKeys = teamA.map(ensurePlayer).filter(Boolean);
      const teamBKeys = teamB.map(ensurePlayer).filter(Boolean);
      const setNumber = String(set?.setNumber ?? set?.set ?? "").trim();
      const teamKeys = [...new Set([...teamAKeys, ...teamBKeys])];
      const scores = Array.isArray(set?.scores) ? set.scores : [];
      const hasDuplicateTeamMember = teamAKeys.some(key => teamBKeys.includes(key));

      if (set?.scoresResolved === false) {
        teamKeys.forEach(key => { playerStats.get(key).incompleteScores = true; });
        return;
      }

      if (hasDuplicateTeamMember) {
        teamKeys.forEach(key => { playerStats.get(key).incompleteScores = true; });
        return;
      }

      const validGames = [];
      let hasUnresolvedScore = false;
      scores.forEach(rawScore => {
        const value = String(rawScore ?? "").trim();
        if (!value) return;
        const parsed = parseCompletedGameScore(value);
        if (!parsed) {
          // Tied numeric scores are ignored by the current standings calculation.
          if (!/^\d+-\d+$/.test(value)) hasUnresolvedScore = true;
          return;
        }
        if (!teamAKeys.length || !teamBKeys.length) {
          hasUnresolvedScore = true;
          return;
        }
        validGames.push(parsed);
      });

      if (hasUnresolvedScore) teamKeys.forEach(key => { playerStats.get(key).incompleteScores = true; });

      if (!validGames.length) return;
      if (setNumber) {
        teamKeys.forEach(key => playerStats.get(key).playedSets.add(setNumber));
      } else {
        teamKeys.forEach(key => { playerStats.get(key).incompleteScores = true; });
      }
      validGames.forEach(({ pointsA, pointsB }) => {
        teamAKeys.forEach(key => {
          const stats = playerStats.get(key);
          stats.pointsEarned += pointsA;
          stats.pointsAllowed += pointsB;
          stats.completedGames += 1;
        });
        teamBKeys.forEach(key => {
          const stats = playerStats.get(key);
          stats.pointsEarned += pointsB;
          stats.pointsAllowed += pointsA;
          stats.completedGames += 1;
        });
      });
    });

    const eventRowsByPlayer = new Map();
    (Array.isArray(ratingEvents) ? ratingEvents : []).forEach(row => {
      if (row?.is_reverted === true) return;
      const key = playerKey(row?.player_name);
      if (!key) return;
      if (!eventRowsByPlayer.has(key)) eventRowsByPlayer.set(key, []);
      eventRowsByPlayer.get(key).push(row);
    });

    const ratingSpans = new Map();
    playerStats.forEach((stats, key) => {
      const rows = eventRowsByPlayer.get(key) || [];
      const eventSetNumbers = new Set(rows.map(row => String(row?.set_number ?? "").trim()));
      const coversPlayedSets = stats.playedSets.size > 0
        && rows.length === stats.playedSets.size
        && Array.from(stats.playedSets).every(setNumber => eventSetNumbers.has(setNumber));
      const span = coversPlayedSets ? reconstructRatingSpan(rows) : null;
      if (span) ratingSpans.set(key, span);
    });

    const expectedRanks = new Map();
    const everyParticipantHasSnapshot = playerStats.size > 0
      && Array.from(playerStats.keys()).every(key => ratingSpans.has(key));
    if (everyParticipantHasSnapshot) {
      // Equal pre-day DUPR values use normalized player name as a stable tie-breaker.
      const expectedOrder = Array.from(playerStats.keys()).sort((keyA, keyB) => {
        const ratingDifference = ratingSpans.get(keyB).before - ratingSpans.get(keyA).before;
        if (ratingDifference !== 0) return ratingDifference;
        return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
      });
      expectedOrder.forEach((key, index) => expectedRanks.set(key, index + 1));
    }

    const actualRanks = new Map();
    (Array.isArray(rankedPlayers) ? rankedPlayers : []).forEach((player, index) => {
      const name = player?.displayName || player?.name || player?.player_name;
      const key = playerKey(name);
      if (key) actualRanks.set(key, index + 1);
    });

    const output = {};
    playerStats.forEach((stats, key) => {
      const span = ratingSpans.get(key) || null;
      const expectedRank = expectedRanks.get(key) ?? null;
      const actualRank = actualRanks.get(key) ?? null;
      const rankDirection = expectedRank === null || actualRank === null
        ? "unavailable"
        : actualRank < expectedRank
          ? "better"
          : actualRank > expectedRank
            ? "worse"
            : "same";
      const ea = !stats.incompleteScores
        && stats.completedGames > 0
        && stats.pointsAllowed > 0
        ? stats.pointsEarned / stats.pointsAllowed
        : null;
      const deltaDupr = span ? span.after - span.before : null;

      output[key] = {
        playerName: participantNames.get(key),
        pointsEarned: stats.pointsEarned,
        pointsAllowed: stats.pointsAllowed,
      completedGames: stats.completedGames,
        ea,
        eaDisplay: ea === null || !Number.isFinite(ea) ? "—" : ea.toFixed(1),
        expectedRank,
        expectedRankDisplay: expectedRank === null ? "—" : String(expectedRank),
        actualRank,
        rankDirection,
        rankDescription: rankDirection === "better"
          ? `Finished ${expectedRank - actualRank} place${expectedRank - actualRank === 1 ? "" : "s"} better than expected`
          : rankDirection === "worse"
            ? `Finished ${actualRank - expectedRank} place${actualRank - expectedRank === 1 ? "" : "s"} worse than expected`
            : rankDirection === "same"
              ? "Finished at expected rank"
              : "Expected rank unavailable",
        duprBefore: span?.before ?? null,
        duprAfter: span?.after ?? null,
        deltaDupr,
        deltaDuprDisplay: deltaDupr === null || !Number.isFinite(deltaDupr)
          ? "—"
          : `${deltaDupr > 0 ? "+" : ""}${deltaDupr.toFixed(3)}`,
        deltaDirection: deltaDupr === null || !Number.isFinite(deltaDupr)
          ? "unavailable"
          : deltaDupr > 0
            ? "positive"
            : deltaDupr < 0
              ? "negative"
              : "neutral"
      };
    });

    return output;
  }

  const api = { parseCompletedGameScore, reconstructRatingSpan, calculateDayStatistics };
  root.PBTRKRResults = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
