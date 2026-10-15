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

  function dateToIso(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

    const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
    if (slashDate) {
      const [, monthText, dayText, year] = slashDate;
      const month = Number(monthText);
      const day = Number(dayText);
      const parsed = new Date(Date.UTC(Number(year), month - 1, day));
      if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
        return null;
      }
      return `${year}-${monthText.padStart(2, "0")}-${dayText.padStart(2, "0")}`;
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
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const monthNameDate = raw.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/i);
    if (monthNameDate) {
      const [, monthText, day, year] = monthNameDate;
      const monthMap = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      const month = monthMap[String(monthText).toLowerCase()];
      if (!month) return null;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    if (/^(\d{1,2})-[A-Za-z]{3}$/i.test(raw) || /^[A-Za-z]{3}\s+\d{1,2}$/.test(raw)) {
      return null;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return DAY_FORMATTER.format(parsed);
  }

  function legacyDate(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${month}/${day}/${year}`;
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
    const firstByDate = new Map();
    for (const row of data || []) {
      if (!firstByDate.has(row.schedule_date)) firstByDate.set(row.schedule_date, row);
    }
    return dates.map(date => {
      const row = firstByDate.get(date);
      return {
        date: legacyDate(date),
        players: row?.players || ["", "", "", ""],
        status: (row?.statuses || ["", "", "", ""]).map(value => Number(value) || 0)
      };
    });
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
    const response = await awaitSupabaseRequest(
      client().rpc(name, args), options.timeoutMs, "PBTRKR_SAVE_TIMEOUT"
    );
    const { data, error } = response;
    if (error) throw error;
    return data;
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

  function normalizedScores(scores) {
    return (scores || []).map(value => String(value ?? ""));
  }

  async function reconcileSetSave(matchDate, setNumber, expectedScores) {
    const response = await awaitSupabaseRequest(client().from("pbtrkr_sets")
      .select("id,match_date,set_number,game_scores")
      .eq("match_date", matchDate)
      .eq("set_number", String(setNumber))
      .limit(1), 8000, "PBTRKR_RECONCILE_TIMEOUT");
    const { data, error } = response;
    if (error) throw error;
    const current = data?.[0] || null;
    const persistedScores = normalizedScores(current?.game_scores);
    const requestedScores = normalizedScores(expectedScores);
    return {
      matches: Boolean(current) && JSON.stringify(persistedScores) === JSON.stringify(requestedScores),
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
        const ratingUpdates = JSON.parse(params.ratingUpdates || "[]").map(update => ({
          ...update,
          player_key: update.player_key || String(update.player_name || "").trim().toLowerCase()
        }));
        const matchDate = todayIso();
        const setNumber = String(params.set);
        const scores = JSON.parse(params.scores || "[]");
        const rpcArgs = {
          p_match_date: matchDate,
          p_set_number: setNumber,
          p_scores: scores,
          p_rating_updates: ratingUpdates,
          p_device_id: deviceId()
        };
        const projectUrl = client().supabaseUrl || null;
        const diagnosticPromise = Promise.resolve()
          .then(() => client().auth?.getSession?.())
          .then(sessionResult => {
            console.info("PBTRKR score-save authorization context", {
              projectUrl,
              userId: sessionResult?.data?.session?.user?.id || null,
              deviceId: rpcArgs.p_device_id,
              matchDate,
              setNumber
            });
          })
          .catch(() => {
            console.info("PBTRKR score-save authorization context", {
              projectUrl,
              userId: null,
              deviceId: rpcArgs.p_device_id,
              matchDate,
              setNumber
            });
          });
        try {
          const saveResult = await rpc("pbtrkr_save_set_full", rpcArgs, {
            timeoutMs: options.timeoutMs ?? 15000
          });
          void diagnosticPromise;
          return saveResult;
        } catch (error) {
          void diagnosticPromise;
          if (error.code !== "PBTRKR_SAVE_TIMEOUT") throw error;
          try {
            const reconciliation = await reconcileSetSave(matchDate, setNumber, scores);
            if (reconciliation.matches) {
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
