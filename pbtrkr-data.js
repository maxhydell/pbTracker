/*
 * PBTRKR Supabase data service.
 * Enable only after the additive migration is applied and the Auth roles/devices
 * are provisioned. Until then the existing Apps Script path remains available.
 */
(function attachPbtrkrDataService() {
  const root = typeof window !== "undefined" ? window : globalThis;
  const client = () => root.supabaseClient;
  const storage = () => (root.localStorage || {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  });
  function normalizeRole(role) {
    return root.PBTRKRAuthorization?.normalizeRole(role) || "";
  }

  function isAdminRole(role) {
    return root.PBTRKRAuthorization?.isAdminRole(normalizeRole(role)) === true;
  }

  function isEditorRole(role) {
    return root.PBTRKRAuthorization?.isPbtrkrEditorRole(normalizeRole(role)) === true;
  }

  function isAdminUser(user) {
    return root.PBTRKRAuthorization?.isAdminUser(user) === true;
  }

  function isEditorUser(user) {
    return root.PBTRKRAuthorization?.isPbtrkrEditorUser(user) === true;
  }
  const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  function todayIso() {
    return DAY_FORMATTER.format(new Date());
  }

  function isoDate(yearText, monthText, dayText) {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!Number.isInteger(year) || year < 1 || year > 9999
      || !Number.isInteger(month) || month < 1 || month > 12
      || !Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }

    const parsed = new Date(0);
    parsed.setUTCHours(0, 0, 0, 0);
    parsed.setUTCFullYear(year, month - 1, day);
    if (parsed.getUTCFullYear() !== year
      || parsed.getUTCMonth() !== month - 1
      || parsed.getUTCDate() !== day) {
      return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function dateToIso(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const isoDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:([Zz])|([+-])(\d{2}):?(\d{2}))?$)/);
    if (isoDateMatch) {
      const [, year, month, day, hour, minute, second, , , offsetHour, offsetMinute] = isoDateMatch;
      if (hour !== undefined
        && (Number(hour) > 23 || Number(minute) > 59 || Number(second || 0) > 59
          || Number(offsetHour || 0) > 14 || Number(offsetMinute || 0) > 59
          || (Number(offsetHour || 0) === 14 && Number(offsetMinute || 0) !== 0))) {
        return null;
      }
      return isoDate(year, month, day);
    }

    const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (slashDate) {
      const [, month, day, year, hour, minute, second] = slashDate;
      if (hour !== undefined
        && (Number(hour) > 23 || Number(minute) > 59 || Number(second || 0) > 59)) {
        return null;
      }
      return isoDate(year, month, day);
    }

    const explicitMonthDayYear = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/i);
    if (explicitMonthDayYear) {
      const [, day, monthText, year] = explicitMonthDayYear;
      const monthMap = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      const month = monthMap[String(monthText).toLowerCase()];
      if (!month) return null;
      return isoDate(year, month, day);
    }

    const monthNameDate = raw.match(/^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/i);
    if (monthNameDate) {
      const [, monthText, day, year] = monthNameDate;
      const monthMap = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      const month = monthMap[String(monthText).toLowerCase()];
      if (!month) return null;
      return isoDate(year, month, day);
    }

    if (/^(\d{1,2})-[A-Za-z]{3}$/i.test(raw) || /^[A-Za-z]{3}\s+\d{1,2}$/.test(raw)) {
      return null;
    }

    return null;
  }

  function legacyDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${month}/${day}/${year}`;
  }

  function scheduleWeekday(value) {
    const date = dateToIso(value);
    if (!date) return null;
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "America/New_York"
    }).format(new Date(`${date}T12:00:00Z`));
  }

  function scheduleSlots(values, rawRow, firstColumn) {
    const slots = Array.isArray(values) && values.length === 4
      ? values.map(value => String(value ?? ""))
      : ["", "", "", ""];
    const rawSlots = [0, 1, 2, 3].map(index => String(rawRow?.[`c${firstColumn + index}`] ?? ""));
    return slots.some(value => value.trim()) || !rawSlots.some(value => value.trim())
      ? slots
      : rawSlots;
  }

  function normalizeScheduleRows(rows, dates) {
    const firstByDate = new Map();
    for (const row of rows || []) {
      const date = dateToIso(row?.schedule_date || row?.date || row?.date_raw);
      if (!date || firstByDate.has(date)) continue;
      const rawRow = row.raw_row && typeof row.raw_row === "object" ? row.raw_row : {};
      firstByDate.set(date, {
        date,
        id: row.id,
        players: scheduleSlots(row.players, rawRow, 3),
        status: scheduleSlots(row.statuses || row.status, rawRow, 8).map(value => Number(value) || 0)
      });
    }
    return (dates || []).map(value => {
      const date = dateToIso(value);
      return firstByDate.get(date) || {
        date,
        players: ["", "", "", ""],
        status: [0, 0, 0, 0]
      };
    });
  }

  function deviceId() {
    return root.PBTRKRAuthorization?.getDeviceId() || "";
  }

  function num(value) {
    if (value === null || value === undefined || value === "") return 0;
    const text = String(value).trim();
    if (text.endsWith("%")) return Number(text.slice(0, -1)) / 100 || 0;
    return Number(text) || 0;
  }

  function toPercent(value) {
    const raw = String(value ?? "").trim();
    return num(raw);
  }

  async function requestExistingUserMagicLink(email, redirectTo) {
    return client().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo }
    });
  }

  function magicLinkErrorMessage(error) {
    const status = Number(error?.status);
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (status === 429 || code.includes("rate") || message.includes("rate limit") || message.includes("too many")) {
      return "Too many sign-in link requests. Wait a few minutes before requesting another link.";
    }
    if (code === "user_not_found" || status === 404 || message.includes("user not found") || message.includes("signups not allowed for otp")) {
      return "This email does not have a provisioned Supabase account. Ask a PBTRKR administrator to provision the user and assign its trusted app_metadata.role.";
    }
    return "Unable to send the sign-in link. Check the email address and try again later.";
  }

  function toLegacyPlayer(row) {
    return {
      id: row.player_key,
      playerKey: row.player_key,
      name: row.player_name,
      rating: row.rating,
      DUPR: row.dupr,
      PWRank: row.pw_rank,
      notes: row.notes || "",
      wins: Number(row.wins || 0),
      points: Number(row.points_earned || 0),
      games: Number(row.games || 0),
      winPct: row.win_pct === null || row.win_pct === undefined
        ? toPercent(row.win_avg_raw)
        : Number(row.win_pct),
      pointsAvg: row.points_avg === null || row.points_avg === undefined ? num(row.point_avg_raw) : Number(row.points_avg),
      phone: row.phone || "",
      availability: row.availability || "",
      order_index: row.order_index
    };
  }

  function mergeSupabasePlayerRows(players, directoryRows) {
    const normalizedName = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
    const directory = new Map();
    for (const row of directoryRows || []) {
      const name = normalizedName(row?.name);
      if (name) directory.set(name, row);
    }

    const missing = [];
    const merged = (players || [])
      .filter(player => normalizedName(player?.name) !== "")
      .map(player => {
        const row = directory.get(normalizedName(player.name));
        if (!row) {
          missing.push(player.name);
          return player;
        }
        return {
          ...player,
          id: row.id,
          DUPR: row.DUPR,
          PWRank: row.PWRank,
          phone: row.phone ?? "",
          order_index: row.order_index
        };
      });

    return { players: merged, missing };
  }

  function toLegacySet(row) {
    return {
      id: row.id,
      matchDate: row.match_date,
      setNumber: row.set_number,
      persisted: true,
      date: row.date_raw || (row.match_date ? legacyDate(row.match_date) : ""),
      set: Number(row.set_number) || row.set_number,
      teamA: row.team_a || "",
      teamB: row.team_b || "",
      scores: Array.isArray(row.game_scores) ? row.game_scores.map(value => value || "") : [],
      scoresResolved: row.scores_resolved !== false
    };
  }

  function dayWindow() {
    const [year, month, day] = todayIso().split("-").map(Number);
    const today = new Date(Date.UTC(year, month - 1, day, 12));
    const weekday = today.getDay();
    const offset = weekday === 0 ? 1 : weekday === 6 ? 2 : 1 - weekday;
    const monday = new Date(today);
    monday.setDate(today.getDate() + offset);
    const days = [];
    for (let index = 0; index < 5; index += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      days.push(DAY_FORMATTER.format(date));
    }
    return days;
  }

  async function selectAll(table, columns, configure) {
    const db = client();
    if (!db) throw new Error("Supabase client is unavailable");
    const rows = [];
    const pageSize = 1000;
    for (let start = 0; ; start += pageSize) {
      let query = db.from(table).select(columns).range(start, start + pageSize - 1);
      if (configure) query = configure(query);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  async function getPlayers() {
    const db = client();
    const fields = "player_key,player_name,rating,dupr,pw_rank,notes,wins,points_earned,games,win_avg_raw,point_avg_raw,win_pct,points_avg,availability,order_index,updated_at";
    const { data, error } = await db.from("pbtrkr_player_stats").select(fields)
      .order("order_index", { ascending: true, nullsFirst: false }).order("player_name");
    if (error) throw error;

    const { data: sessionData } = await db.auth.getSession();
    const user = sessionData?.session?.user;
    if (isEditorUser(user)) {
      const { data: phoneRows, error: phoneError } = await db.rpc("pbtrkr_get_player_phones", {
        p_device_id: deviceId()
      });
      if (phoneError && phoneError.code !== "42501") throw phoneError;
      const phoneByKey = new Map((phoneRows || []).map(row => [row.player_key, row.phone]));
        return (data || [])
          .filter(row => String(row.player_name || "").trim() !== "")
          .map(row => ({ ...toLegacyPlayer(row), phone: phoneByKey.get(row.player_key) || "" }));
    }
      return (data || []).filter(row => String(row.player_name || "").trim() !== "").map(toLegacyPlayer);
  }

  async function getCanonicalPlayerKey(name) {
    const normalized = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
    const { data, error } = await client().from("pbtrkr_player_stats")
      .select("player_key")
      .eq("source_player_key", normalized)
      .order("player_key")
      .limit(1);
    if (error) throw error;
    return data?.[0]?.player_key || normalized;
  }

  async function getSchedule() {
    const dates = dayWindow();
    const db = client();
    const { data, error } = await db
      .from("pbtrkr_schedule_days")
      .select("id,schedule_date,date_raw,day_number,players,statuses,raw_row")
      .in("schedule_date", dates)
      .order("id", { ascending: true });
    if (error) throw error;
    return normalizeScheduleRows(data, dates);
  }

  async function getSets(date = todayIso()) {
    const isoDate = dateToIso(date) || todayIso();
    const db = client();
    if (isoDate === todayIso()) {
      const { data: authData } = await db.auth.getSession();
      const user = authData?.session?.user;
      if (isEditorUser(user)) {
        const { error: ensureError } = await db.rpc("pbtrkr_ensure_today_sets", {
          p_match_date: isoDate,
          p_device_id: deviceId()
        });
        if (ensureError) throw ensureError;
      }
    }
    const { data, error } = await db
      .from("pbtrkr_sets")
      .select("id,match_date,date_raw,set_number,team_a,team_b,game_scores,scores_resolved")
      .eq("match_date", isoDate)
      .order("set_number", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    return (data || []).map(toLegacySet);
  }

  async function getAllSets() {
    const rows = await selectAll("pbtrkr_sets", "id,match_date,date_raw,set_number,team_a,team_b,game_scores,scores_resolved", query => query.order("match_date", { ascending: true }).order("set_number", { ascending: true }).order("id", { ascending: true }));
    return rows.map(toLegacySet);
  }

  async function getHistory() {
    const rows = await selectAll("pbtrkr_daily_history", "id,history_date,date_raw,player_name,win_pct_raw,points_avg_raw,is_reverted", query => query.eq("is_reverted", false).order("history_date", { ascending: true }).order("id", { ascending: true }));
    return rows.map(row => ({
      date: row.date_raw || legacyDate(row.history_date),
      name: row.player_name,
      winPct: toPercent(row.win_pct_raw),
      pointsAvg: num(row.points_avg_raw)
    }));
  }

  async function getTrend() {
    const players = await getPlayers();
    return players.map(player => ({
      name: player.name,
      winPct: player.winPct,
      pointsAvg: player.pointsAvg,
      gamesPlayed: player.games
    }));
  }

  async function getLastUpdated() {
    const tables = ["pbtrkr_player_stats", "pbtrkr_schedule_days", "pbtrkr_sets"];
    const values = await Promise.all(tables.map(async table => {
      const { data, error } = await client()
        .from(table)
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.updated_at || null;
    }));
    const timestamps = values.filter(Boolean).sort();
    return timestamps[timestamps.length - 1] || null;
  }

  async function rpc(name, args, options = {}) {
    const startedAt = Date.now();
    const saveRequestId = options.saveRequestId || null;
    const timeoutMs = options.timeoutMs ?? 15000;
    const rpcStarted = {
      saveRequestId,
      event: "save.rpc.started",
      timestamp: new Date().toISOString(),
      rpcName: name,
      timeoutMs,
      argKeys: Object.keys(args || {}),
      argTypes: summarizeRpcArgs(args),
      requestKind: "supabase_rpc"
    };
    console.info("save.rpc.started", rpcStarted);
    try {
      const response = await awaitSupabaseRequest(
        client().rpc(name, args), timeoutMs, "PBTRKR_SAVE_TIMEOUT"
      );
      const { data, error } = response;
      if (error) {
        console.warn("save.rpc.completed", {
          saveRequestId,
          event: "save.rpc.completed",
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          rpcName: name,
          outcome: "error",
          errorCode: safeErrorCode(error),
          httpStatus: safeHttpStatus(error),
          errorMessage: sanitizeForLog(error?.message)
        });
        throw error;
      }
      const durationMs = Date.now() - startedAt;
      console.info("save.rpc.completed", {
        saveRequestId,
        event: "save.rpc.completed",
        timestamp: new Date().toISOString(),
        durationMs,
        rpcName: name,
        outcome: "confirmed",
        classification: classifySaveOutcome({ reachedSupabase: true, finalOutcome: "success" })
      });
      console.info("PBTRKR score-save RPC timing", { durationMs, outcome: "confirmed" });
      return data;
    } catch (error) {
      const timedOut = error?.code === "PBTRKR_SAVE_TIMEOUT";
      const durationMs = Date.now() - startedAt;
      const outcome = timedOut ? "timeout" : "error";
      const summary = {
        saveRequestId,
        event: timedOut ? "save.rpc.timeout" : "save.rpc.failed",
        timestamp: new Date().toISOString(),
        durationMs,
        rpcName: name,
        outcome,
        errorCode: safeErrorCode(error),
        httpStatus: safeHttpStatus(error),
        errorMessage: sanitizeForLog(error?.message),
        timeoutMs,
        classification: classifySaveOutcome({
          reachedSupabase: true,
          timeout: timedOut,
          rpcError: error,
          finalOutcome: timedOut ? "timeout" : "error"
        })
      };
      console.warn(timedOut ? "save.rpc.timeout" : "save.rpc.failed", summary);
      if (timedOut) {
        console.info("PBTRKR score-save RPC timing", { durationMs, outcome: "timeout" });
      }
      throw error;
    }
  }

  function safeErrorCode(error) {
    const code = String(error?.code || "");
    return /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : "unavailable";
  }

  function safeHttpStatus(error) {
    const status = Number(error?.status);
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  }

  async function awaitSupabaseRequest(query, timeoutMs, errorCode) {
    if (!timeoutMs) return query;
    const controller = new AbortController();
    const request = typeof query.abortSignal === "function"
      ? query.abortSignal(controller.signal)
      : query;
    let timeoutId;
    try {
      return await Promise.race([
        Promise.resolve(request),
        new Promise((resolve, reject) => {
          timeoutId = setTimeout(() => {
            const timeoutError = new Error(`Supabase request timed out after ${timeoutMs}ms`);
            timeoutError.code = errorCode;
            controller.abort();
            reject(timeoutError);
          }, timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function sanitizeForLog(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        const [local, domain] = value.split("@");
        const maskedLocal = local.length <= 2 ? "*".repeat(local.length) : `${local.slice(0, 2)}***`;
        return `${maskedLocal}@${domain}`;
      }
      return value.length > 180 ? `${value.slice(0, 177)}...` : value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 8).map(item => sanitizeForLog(item, seen));
    if (typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      const output = {};
      Object.entries(value).forEach(([key, nested]) => {
        if (/token|secret|key|password|refresh|magic|email/i.test(key) && typeof nested === "string") {
          output[key] = key.toLowerCase().includes("email") ? sanitizeForLog(nested) : "[redacted]";
        } else {
          output[key] = sanitizeForLog(nested, seen);
        }
      });
      return output;
    }
    return String(value);
  }

  function summarizeRpcArgs(args) {
    return Object.fromEntries(Object.entries(args || {}).map(([key, value]) => {
      const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
      const summary = type === "string" ? `${value.length} chars` : type === "array" ? `${value.length} items` : String(value);
      return [key, { type, sample: sanitizeForLog(summary) }];
    }));
  }

  function makeSaveRequestId() {
    return `save-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function classifySaveOutcome({ reachedSupabase, rpcError, timeout, reconciliationMatches, finalOutcome, hasCommittedRow, hasSetId }) {
    if (finalOutcome === "success") return "confirmed";
    if (reachedSupabase === false) return "not_reached_supabase";
    if (timeout === true) {
      if (reconciliationMatches === true) return "transaction_committed_response_lost";
      if (hasCommittedRow === true || hasSetId === true) return "transaction_committed_response_lost";
      return "timeout_uncertain_transaction";
    }
    if (rpcError && String(rpcError.code || "").startsWith("42501")) return "definitive_failure";
    if (rpcError && String(rpcError.code || "").startsWith("23")) return "definitive_failure";
    if (rpcError) return "definitive_failure";
    return "uncertain_outcome";
  }

  function normalizedScores(scores) {
    return (scores || []).map(value => String(value ?? ""));
  }

  async function reconcileSetSave(matchDate, setNumber, expectedScores, expectedSetId, saveRequestId = null) {
    const normalizedDate = dateToIso(matchDate);
    if (!normalizedDate) throw new Error("Cannot reconcile a score save with an invalid match date");
    const startedAt = Date.now();
    const logContext = { saveRequestId, event: "save.reconciliation.started", timestamp: new Date().toISOString(), matchDate: normalizedDate, setNumber: String(setNumber), setId: expectedSetId ?? null, expectedScoreCount: Array.isArray(expectedScores) ? expectedScores.length : 0 };
    console.info("save.reconciliation.started", logContext);
    let data;
    try {
      const response = await awaitSupabaseRequest(client().from("pbtrkr_sets")
        .select("id,match_date,set_number,game_scores")
        .eq("match_date", normalizedDate)
        .eq("set_number", String(setNumber))
        .order("id", { ascending: true })
        .limit(2), 8000, "PBTRKR_RECONCILE_TIMEOUT");
      if (response.error) throw response.error;
      data = response.data;
    } catch (error) {
      console.warn("save.reconciliation.completed", {
        saveRequestId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        outcome: error?.code === "PBTRKR_RECONCILE_TIMEOUT" ? "timeout" : "error",
        errorCode: safeErrorCode(error),
        httpStatus: safeHttpStatus(error),
        errorMessage: sanitizeForLog(error?.message)
      });
      throw error;
    }
    const candidates = data || [];
    const first = candidates[0] || null;
    const current = expectedSetId === undefined || expectedSetId === null
      ? first
      : candidates.find(row => String(row.id) === String(expectedSetId)) || null;
    const persistedScores = normalizedScores(current?.game_scores);
    const requestedScores = normalizedScores(expectedScores);
    const intendedRpcRow = Boolean(current) && String(current.id) === String(first?.id);
    const matches = intendedRpcRow
      && JSON.stringify(persistedScores) === JSON.stringify(requestedScores);
    const finalOutcome = matches ? "confirmed" : "not-confirmed";
    const summary = {
      saveRequestId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      candidateCount: candidates.length,
      duplicateRowsDetected: candidates.length > 1,
      intendedRpcRow,
      expectedSetId: expectedSetId ?? null,
      matchedSetId: current?.id ?? null,
      persistedScoreCount: persistedScores.length,
      requestedScoreCount: requestedScores.length,
      fieldsMatched: {
        matchDate: Boolean(current && String(current.match_date) === String(normalizedDate)),
        setNumber: Boolean(current && String(current.set_number) === String(setNumber)),
        scoreSnapshot: JSON.stringify(persistedScores) === JSON.stringify(requestedScores)
      },
      outcome: finalOutcome,
      classification: classifySaveOutcome({
        reachedSupabase: true,
        timeout: false,
        reconciliationMatches: matches,
        hasCommittedRow: Boolean(current),
        hasSetId: Boolean(expectedSetId)
      })
    };
    console.info("save.reconciliation.completed", summary);
    return {
      matches,
      set: current,
      persistedScores
    };
  }

  async function isDeviceAuthorized(id = deviceId()) {
    return (await rpc("pbtrkr_device_is_whitelisted", { p_device_id: id })) === true;
  }

  async function authorizeDevice(id, userId) {
    return rpc("pbtrkr_authorize_device", {
      p_device_id: id,
      p_user_id: userId
    });
  }

  async function saveSchedule(date, changes) {
    const parsedDate = dateToIso(date);
    if (!parsedDate) throw new Error("Invalid schedule date");
    return rpc("pbtrkr_save_schedule_day", {
      p_schedule_date: parsedDate,
      p_changes: changes,
      p_device_id: deviceId()
    });
  }

  function scheduleStatusChanges(column, status) {
    const slot = Number(column);
    if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
      throw new Error("Invalid schedule status column");
    }
    return [{ field: `s${slot}`, value: status }];
  }

  async function call(params, options = {}) {
    const action = params.action;
    switch (action) {
      case "getAllData": {
        const [sets, trend, schedule, history, lastUpdated] = await Promise.all([
          getSets(), getTrend(), getSchedule(), getHistory(), getLastUpdated()
        ]);
        return { sets, trend, schedule, history, lastUpdated };
      }
      case "getPlayers":
        return getPlayers();
      case "getRankings":
      case "getUserTrend":
        return getTrend();
      case "getSchedule":
        return getSchedule();
      case "ensureWeekInitialized": {
        const { data: authData, error } = await client().auth.getSession();
        if (error) throw error;
        const user = authData?.session?.user;
        if (!isEditorUser(user)) {
          return { success: true, created: false, reason: "read_only" };
        }
        return rpc("pbtrkr_ensure_week_initialized", {
          p_week_start: dayWindow()[0],
          p_device_id: deviceId()
        });
      }
      case "getTodaySets":
        return getSets();
      case "getAllSets":
        return getAllSets();
      case "getHistory":
        return getHistory();
      case "getPreviousHistoryEntry": {
        const name = String(params.name || "").trim().toLowerCase();
        const date = dateToIso(params.date || todayIso());
        const entries = (await getHistory()).filter(row => row.name.toLowerCase() === name && dateToIso(row.date) < date);
        return entries[entries.length - 1] || { winPct: 0, pointsAvg: 0 };
      }
      case "lastUpdated":
        return getLastUpdated();
      case "saveSetFull": {
        let saveRequestId = params.saveRequestId || makeSaveRequestId();
        const stageStartedAt = Date.now();
        let matchDate = null;
        let setNumber = null;
        let setId = null;
        let scores = [];
        console.info("save.started", {
          saveRequestId,
          event: "save.started",
          timestamp: new Date().toISOString(),
          setNumber: String(params.set ?? ""),
          action: action,
          scoreCount: Array.isArray(JSON.parse(params.scores || "[]")) ? JSON.parse(params.scores || "[]").length : 0,
          page: typeof window !== "undefined" ? window.location?.pathname || "" : ""
        });
        try {
          const ratingUpdates = JSON.parse(params.ratingUpdates || "[]").map(update => ({
            ...update,
            player_key: update.player_key || String(update.player_name || "").trim().toLowerCase()
          }));
          matchDate = dateToIso(params.date || todayIso());
          if (!matchDate) {
            const error = new Error("Cannot save a set with an invalid match date");
            console.error("save.validation.failed", {
              saveRequestId,
              event: "save.validation.failed",
              timestamp: new Date().toISOString(),
              durationMs: Date.now() - stageStartedAt,
              stage: "date-normalization",
              reason: error.message
            });
            throw error;
          }
          setNumber = String(params.set);
          setId = params.setId;
          scores = JSON.parse(params.scores || "[]");
          console.info("save.validation.completed", {
            saveRequestId,
            event: "save.validation.completed",
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stageStartedAt,
            matchDate,
            setNumber,
            setId: setId ?? null,
            scoreCount: Array.isArray(scores) ? scores.length : 0,
            ratingUpdateCount: Array.isArray(ratingUpdates) ? ratingUpdates.length : 0
          });
          const rpcArgs = {
            p_match_date: matchDate,
            p_set_number: setNumber,
            p_scores: scores,
            p_rating_updates: ratingUpdates,
            p_device_id: deviceId()
          };
          const saveResult = await rpc("pbtrkr_save_set_full", rpcArgs, {
            timeoutMs: options.timeoutMs ?? 15000,
            saveRequestId
          });
          console.info("save.finished", {
            saveRequestId,
            event: "save.finished",
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stageStartedAt,
            level: "success",
            classification: classifySaveOutcome({ reachedSupabase: true, finalOutcome: "success" }),
            rpcOutcome: "confirmed",
            reconciliationOutcome: "not_required"
          });
          return saveResult;
        } catch (error) {
          const timeoutHappened = error?.code === "PBTRKR_SAVE_TIMEOUT";
          console.error("save.finished", {
            saveRequestId,
            event: "save.finished",
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stageStartedAt,
            level: timeoutHappened ? "timeout" : "error",
            errorCode: safeErrorCode(error),
            errorMessage: sanitizeForLog(error?.message),
            classification: classifySaveOutcome({
              reachedSupabase: true,
              timeout: timeoutHappened,
              rpcError: error,
              finalOutcome: timeoutHappened ? "timeout" : "error"
            })
          });
          if (error.code !== "PBTRKR_SAVE_TIMEOUT") throw error;
          try {
            const reconciliation = await reconcileSetSave(matchDate, setNumber, scores, setId, saveRequestId);
            if (reconciliation.matches) {
              console.info("save.finished", {
                saveRequestId,
                event: "save.finished",
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - stageStartedAt,
                level: "success",
                classification: classifySaveOutcome({ reachedSupabase: true, finalOutcome: "success", reconciliationMatches: true }),
                rpcOutcome: "timeout_reconciled",
                reconciliationOutcome: "confirmed"
              });
              return {
                success: true,
                reconciled: true,
                set_id: reconciliation.set.id,
                scores: reconciliation.persistedScores
              };
            }
          } catch (reconciliationError) {
            error.reconciliationError = reconciliationError;
          }
          const uncertainError = new Error(
            "The score save timed out and its commit status could not be confirmed. Verify the saved score before retrying."
          );
          uncertainError.code = "PBTRKR_SAVE_OUTCOME_UNKNOWN";
          uncertainError.cause = error;
          console.error("save.finished", {
            saveRequestId,
            event: "save.finished",
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - stageStartedAt,
            level: "uncertain",
            classification: "timeout_uncertain_transaction",
            rpcOutcome: "timeout",
            reconciliationOutcome: "not_confirmed",
            errorCode: uncertainError.code,
            errorMessage: sanitizeForLog(uncertainError.message)
          });
          throw uncertainError;
        }
      }
      case "updateSchedulePartial": {
        const changes = JSON.parse(params.changes || "[]");
        return saveSchedule(params.date, changes);
      }
      case "updateSchedule": {
        if (params.status !== undefined) {
          return saveSchedule(params.date, scheduleStatusChanges(params.col, params.status));
        }
        const col = Math.max(3, Math.min(6, Number(params.col)));
        return saveSchedule(params.date, [{ field: `p${col - 2}`, value: params.name || "" }]);
      }
      case "saveFullScheduleDay": {
        const names = params.players === undefined
          ? [params.p1, params.p2, params.p3, params.p4]
          : JSON.parse(params.players || "[]");
        const statuses = params.status === undefined
          ? [params.s1, params.s2, params.s3, params.s4]
          : JSON.parse(params.status || "[]");
        const changes = [];
        names.forEach((value, index) => changes.push({ field: `p${index + 1}`, value }));
        statuses.forEach((value, index) => changes.push({ field: `s${index + 1}`, value }));
        if (params.day !== undefined) changes.push({ field: "day", value: params.day });
        return saveSchedule(params.date, changes);
      }
      case "saveScheduleDay":
        return saveSchedule(params.date, [1, 2, 3, 4].map(index => ({ field: `s${index}`, value: 2 })));
      case "saveHistory":
        return { success: true, deferred: "History is written atomically by completeDay." };
      case "saveSharedResult":
        return rpc("pbtrkr_save_shared_result", {
          p_result_id: params.resultId,
          p_result_json: JSON.parse(params.data || "null"),
          p_device_id: deviceId()
        });
      case "completeDay":
        return rpc("pbtrkr_complete_day", {
          p_completion_date: dateToIso(params.date) || todayIso(),
          p_result_id: params.resultId,
          p_result_json: JSON.parse(params.data || "[]"),
          p_history_rows: JSON.parse(params.historyRows || "[]"),
          p_device_id: deviceId()
        });
      case "addPlayer": {
        const added = await rpc("pbtrkr_add_player", {
          p_name: params.name,
          p_rating: params.rating ? Number(params.rating) : null,
          p_phone: params.phone || null,
          p_device_id: deviceId()
        });
        return added;
      }
      case "updatePlayerPhone":
        return rpc("pbtrkr_update_player_phone", {
          p_player_key: await getCanonicalPlayerKey(params.playerKey),
          p_phone: params.phone || "",
          p_device_id: deviceId()
        });
      case "updatePlayerStatus":
        if (params.date && params.col !== undefined) {
          return saveSchedule(params.date, scheduleStatusChanges(params.col, params.status));
        }
        return rpc("pbtrkr_update_player_status", {
          p_player_key: await getCanonicalPlayerKey(params.playerKey),
          p_status: params.status,
          p_device_id: deviceId()
        });
      case "savePlayerOrder":
        return rpc("pbtrkr_save_player_order", {
          p_updates: JSON.parse(params.updates || "[]"),
          p_device_id: deviceId()
        });
      case "getSharedResult": {
        const { data, error } = await client().from("pbtrkr_shared_results")
          .select("result_data,result_json_raw")
          .eq("result_id", params.resultId)
          .order("id", { ascending: false })
          .limit(1);
        if (error) throw error;
        if (!data?.length) return [];
        if (data[0].result_data !== null && data[0].result_data !== undefined) {
          return data[0].result_data;
        }
        try {
          return JSON.parse(data[0].result_json_raw || "[]");
        } catch {
          return [];
        }
      }
      case "revertDay":
        return rpc("pbtrkr_revert_day", { p_completion_date: todayIso(), p_device_id: deviceId() });
      case "sendSaveNotification": {
        const { data, error } = await client().functions.invoke("pbtrkr-notifications", {
          body: { type: "score-saved", device_id: deviceId() }
        });
        if (error) throw error;
        return data;
      }
      default:
        throw new Error(`Unsupported PBTRKR Supabase action: ${action}`);
    }
  }

  const service = {
    call,
    dateToIso,
    todayIso,
    deviceId,
    legacyDate,
    scheduleWeekday,
    normalizeScheduleRows,
    dayWindow,
    getPlayers,
    isAdminRole,
    isEditorRole,
    isAdminUser,
    isEditorUser,
    requestExistingUserMagicLink,
    magicLinkErrorMessage,
    getCanonicalPlayerKey,
    reconcileSetSave,
    getSchedule,
    getSets,
    getAllSets,
    getHistory,
    getTrend,
    getLastUpdated,
    rpc,
    isDeviceAuthorized,
    authorizeDevice,
    saveSchedule,
    toLegacyPlayer,
    toLegacySet,
    mergeSupabasePlayerRows,
    num,
    toPercent
  };

  root.pbtrkrDataService = service;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = service;
  }
})();
