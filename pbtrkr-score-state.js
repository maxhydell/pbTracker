(function attachPbtrkrScoreState(root) {
  function create() {
    const states = new Map();
    const savesInFlight = new Set();

    function key(setNumber, gameIndex) {
      return `${setNumber}-${gameIndex}`;
    }

    function get(setNumber, gameIndex) {
      return { ...(states.get(key(setNumber, gameIndex)) || { version: 0, status: "unsaved", value: "" }) };
    }

    function initialize(setNumber, gameIndex, value, persisted) {
      const stateKey = key(setNumber, gameIndex);
      if (!states.has(stateKey)) {
        const score = String(value ?? "");
        const hasPersistedScore = persisted && score.trim() !== "";
        states.set(stateKey, {
          version: 0,
          savedVersion: hasPersistedScore ? 0 : null,
          status: hasPersistedScore ? "saved" : "unsaved",
          value: score
        });
      }
      return get(setNumber, gameIndex);
    }

    function edit(setNumber, gameIndex, value) {
      const stateKey = key(setNumber, gameIndex);
      const current = states.get(stateKey) || { version: 0, savedVersion: null };
      const next = {
        ...current,
        version: current.version + 1,
        status: "unsaved",
        value: String(value ?? "")
      };
      states.set(stateKey, next);
      return { ...next };
    }

    function snapshot(setNumber, scores) {
      return scores.map((value, gameIndex) => {
        initialize(setNumber, gameIndex, value, false);
        const current = get(setNumber, gameIndex);
        return { setNumber, gameIndex, version: current.version, value: String(value ?? "") };
      });
    }

    function updateMatching(snapshotRows, status) {
      for (const item of snapshotRows) {
        const stateKey = key(item.setNumber, item.gameIndex);
        const current = states.get(stateKey);
        if (!current || current.version !== item.version) continue;
        const next = { ...current, status };
        if (status === "saved") next.savedVersion = item.version;
        states.set(stateKey, next);
      }
    }

    function tryBeginSave(setNumber) {
      const setKey = String(setNumber);
      if (savesInFlight.has(setKey)) return false;
      savesInFlight.add(setKey);
      return true;
    }

    function finishSave(setNumber) {
      savesInFlight.delete(String(setNumber));
    }

    function hasUnknown(setNumber, gameCount) {
      for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
        if (get(setNumber, gameIndex).status === "unknown") return true;
      }
      return false;
    }

    return {
      get,
      initialize,
      edit,
      snapshot,
      markSaving: rows => updateMatching(rows, "saving"),
      markSaved: rows => updateMatching(rows, "saved"),
      markError: rows => updateMatching(rows, "error"),
      markUnknown: rows => updateMatching(rows, "unknown"),
      tryBeginSave,
      finishSave,
      hasUnknown
    };
  }

  function runBackground(task, onError) {
    Promise.resolve().then(task).catch(error => {
      if (onError) onError(error);
    });
  }

  const api = { create, runBackground };
  root.PBTRKRScoreState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);