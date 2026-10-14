(function attachPbtrkrPredictions(root) {
  function entries(predictions) {
    if (!predictions || typeof predictions !== "object" || Array.isArray(predictions)) return [];
    return Object.entries(predictions).filter(([, prediction]) =>
      prediction && typeof prediction === "object"
    );
  }

  const api = { entries };
  root.PBTRKRPredictions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);