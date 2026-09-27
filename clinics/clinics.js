(() => {
  "use strict";

  const SUPABASE_URL = "https://qyhzxfserrvsgutfhyel.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aHp4ZnNlcnJ2c2d1dGZoeWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDQ4MDIsImV4cCI6MjA5MjM4MDgwMn0.5guDdk5wnohJw_czrfH4WxUZpZvi6l_0W9jGDmZ4jY4";
  const eventList = document.getElementById("event-list");
  const eventCount = document.getElementById("event-count");
  const toast = document.getElementById("toast");
  const accountButton = document.getElementById("account-button");
  const accountMenu = document.getElementById("account-menu");
  const accountPopover = document.getElementById("account-popover");
  const accountEmail = document.getElementById("account-email");
  const accountRole = document.getElementById("account-role");
  const accountSignOut = document.getElementById("account-sign-out");
  const createEventButton = document.getElementById("create-event-button");
  const analyticsModal = document.getElementById("visitor-analytics-modal");
  const analyticsContent = document.getElementById("analytics-content");
  const analyticsClose = document.getElementById("analytics-close");
  const DEVICE_ID_STORAGE_KEY = "pbTracker_deviceId_v1";
  let currentSession = null;
  let loadedEvents = null;
  let analyticsReturnFocus = null;
  let analyticsRequestId = 0;
  let toastTimeout;

  const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function parseDate(dateValue) {
    if (!dateValue) return null;
    const match = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(dateValue) {
    const date = parseDate(dateValue);
    if (!date) return { primary: "Date to be announced", secondary: "" };
    return {
      primary: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date),
      secondary: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date)
    };
  }

  function formatTime(timeValue) {
    if (!timeValue) return "Time to be announced";
    const match = String(timeValue).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return String(timeValue);
    const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function formatTimeRange(event) {
    if (!event.start_time && !event.end_time) return "Time to be announced";
    if (!event.start_time) return `Until ${formatTime(event.end_time)}`;
    if (!event.end_time) return `From ${formatTime(event.start_time)}`;
    return `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`;
  }

  function showMessage(message, isError = false) {
    eventList.innerHTML = `<div class="state-card${isError ? " state-card-error" : ""}">${escapeHtml(message)}</div>`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function renderEvent(event) {
    const date = formatDate(event.event_date);
    const url = new URL(`/clinic/${encodeURIComponent(event.id)}`, window.location.origin).href;
    const location = event.location || "Location to be announced";
    const address = event.address || "";
    const availability = event.is_full ? "Full" : "Registration open";
    const availabilityClass = event.is_full ? "status-full" : "status-open";
    const canViewVisitors = currentSession?.user?.app_metadata?.role === "clinic_admin";

    return `
      <article class="event-card" data-event-id="${escapeHtml(event.id)}">
        <button class="delete-event-button" type="button" data-delete-event="${escapeHtml(event.id)}" data-event-name="${escapeHtml(event.event_name || "Untitled clinic")}" aria-label="Delete event" title="Delete event">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5"/></svg>
        </button>
        <div class="event-main">
          <h3 class="event-name">${escapeHtml(event.event_name || "Untitled clinic")}</h3>
          <div class="event-subtitle">${event.player_capacity ? `${escapeHtml(event.player_capacity)} player spots` : "All skill-building, all welcome."}</div>
        </div>
        <div class="event-detail event-date">
          <span class="event-detail-label">Date</span>
          <span class="event-detail-value">${escapeHtml(date.primary)}</span>
          ${date.secondary ? `<span class="event-detail-sub">${escapeHtml(date.secondary)}</span>` : ""}
        </div>
        <div class="event-detail event-time">
          <span class="event-detail-label">Time</span>
          <span class="event-detail-value">${escapeHtml(formatTimeRange(event))}</span>
        </div>
        <div class="event-detail event-location">
          <span class="event-detail-label">Location</span>
          <span class="event-detail-value">${escapeHtml(location)}</span>
          ${address ? `<span class="event-detail-sub">${escapeHtml(address)}</span>` : ""}
        </div>
        <div class="event-status"><span class="status ${availabilityClass}">${availability}</span></div>
        <div class="event-actions${canViewVisitors ? " event-actions-admin" : ""}">
          <a class="button button-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Visit <span aria-hidden="true">→</span></a>
          <button class="button button-secondary" type="button" data-copy-url="${escapeHtml(url)}">Copy 🔗</button>
          ${canViewVisitors ? `<button class="button button-neutral" type="button" data-track-visitors="${escapeHtml(event.id)}" data-event-name="${escapeHtml(event.event_name || "Untitled clinic")}">Track Visitors</button>` : ""}
        </div>
      </article>`;
  }

  async function copyEventUrl(button) {
    const value = button.dataset.copyUrl;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement("textarea");
        field.value = value;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Clipboard access is unavailable.");
      }
      showToast("Event link copied!");
    } catch (error) {
      console.error("Could not copy clinic link:", error);
      showToast("Could not copy the link. Please try again.");
    }
  }

  async function loadEvents() {
    if (!supabaseClient) {
      eventCount.textContent = "0";
      showMessage("The event service is unavailable right now. Please try again later.", true);
      return;
    }

    const filters = {
      status: "published",
      order: "created_at.desc"
    };

    try {
      const { data, error } = await supabaseClient
        .from("clinic_events")
        .select("id,event_name,event_date,start_time,end_time,player_capacity,location,address,is_full,status,created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const events = data || [];
      loadedEvents = events;
      eventCount.textContent = String(events.length);

      if (!events.length) {
        console.info("[PBTRKR Clinics] No published events matched the dashboard filters.", filters);
      }

      if (!events.length) {
        eventList.innerHTML = '<div class="state-card state-card-empty"><div><strong>No published clinics just yet.</strong>Check back soon for the next chance to level up your game.</div></div>';
        return;
      }

      renderLoadedEvents();
    } catch (error) {
      console.error("[PBTRKR Clinics] Published event query failed.", {
        filters,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        error
      });
      eventCount.textContent = "0";
      showMessage("We could not load events right now. Please refresh to try again.", true);
    }
  }

  function updateAccountButton(session) {
    if (!accountButton) return;
    currentSession = session || null;
    const user = session?.user;
    accountButton.textContent = user?.email || (user ? "Account" : "Sign In");
    accountButton.href = "/clinic/?p=auth";
    accountButton.title = user ? "Manage your Clinics account" : "Sign in to Clinics";
    accountButton.classList.toggle("button-secondary", true);
    accountButton.setAttribute("aria-expanded", "false");
    if (accountEmail) accountEmail.textContent = user?.email || "Account";
    if (accountRole) accountRole.textContent = user?.app_metadata?.role === "clinic_admin" ? "Clinic Administrator" : "Account";
    closeAccountPopover();
    if (Array.isArray(loadedEvents)) renderLoadedEvents();
    if (!user || user.app_metadata?.role !== "clinic_admin") closeAnalyticsModal();
  }

  function renderLoadedEvents() {
    if (!Array.isArray(loadedEvents)) return;
    if (!loadedEvents.length) {
      eventList.innerHTML = '<div class="state-card state-card-empty"><div><strong>No published clinics just yet.</strong>Check back soon for the next chance to level up your game.</div></div>';
      return;
    }
    eventList.innerHTML = loadedEvents.map(renderEvent).join("");
  }

  function closeAccountPopover() {
    if (!accountPopover || !accountButton) return;
    accountPopover.classList.add("is-hidden");
    accountButton.setAttribute("aria-expanded", "false");
  }

  function toggleAccountPopover() {
    if (!accountPopover || !accountButton) return;
    const willOpen = accountPopover.classList.contains("is-hidden");
    accountPopover.classList.toggle("is-hidden", !willOpen);
    accountButton.setAttribute("aria-expanded", String(willOpen));
  }

  async function handleCreateEventClick(event) {
    event.preventDefault();
    if (!supabaseClient) {
      window.location.assign("/clinic/?p=auth&next=create");
      return;
    }

    createEventButton.setAttribute("aria-busy", "true");
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!data?.session) {
        window.location.assign("/clinic/?p=auth&next=create");
        return;
      }
      window.location.assign("/clinic/?p=create");
    } catch (error) {
      console.error("Could not check clinic account:", error);
      window.location.assign("/clinic/?p=auth&next=create");
    }
  }

  if (supabaseClient) {
    accountButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (currentSession?.user) toggleAccountPopover();
      else window.location.assign("/clinic/?p=auth");
    });
    accountSignOut.addEventListener("click", async () => {
      accountSignOut.disabled = true;
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        updateAccountButton(null);
        showToast("Signed out.");
      } catch (error) {
        console.error("Could not sign out of clinic account:", error);
        showToast("Could not sign out. Please try again.");
      } finally {
        accountSignOut.disabled = false;
      }
    });
    document.addEventListener("click", (event) => {
      if (accountMenu && !accountMenu.contains(event.target)) closeAccountPopover();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAccountPopover();
    });
    createEventButton.addEventListener("click", handleCreateEventClick);
    supabaseClient.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        updateAccountButton(data?.session);
      })
      .catch((error) => console.error("Could not load clinic account:", error));
    supabaseClient.auth.onAuthStateChange((_event, session) => updateAccountButton(session));
  } else {
    createEventButton.addEventListener("click", handleCreateEventClick);
  }

  eventList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-url]");
    if (button) copyEventUrl(button);
    const deleteButton = event.target.closest("[data-delete-event]");
    if (deleteButton) deleteClinicEvent(deleteButton);
    const analyticsButton = event.target.closest("[data-track-visitors]");
    if (analyticsButton) openVisitorAnalytics(analyticsButton);
  });

  async function deleteClinicEvent(button) {
    if (!supabaseClient) {
      showToast("The event service is unavailable right now.");
      return;
    }

    button.disabled = true;
    try {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData?.session?.user;
      if (!user) {
        window.location.assign("/clinic/?p=auth");
        return;
      }
      if (user.app_metadata?.role !== "clinic_admin") {
        showToast("Only clinic administrators can delete events.");
        return;
      }

      const eventName = button.dataset.eventName || "this event";
      if (!window.confirm(`Delete this event?\n\n${eventName}`)) return;

      const { data: deletedEvent, error } = await supabaseClient
        .from("clinic_events")
        .delete()
        .eq("id", button.dataset.deleteEvent)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!deletedEvent) throw new Error("The event was not deleted. Check the administrator policy and try again.");

      button.closest(".event-card")?.remove();
      loadedEvents = loadedEvents?.filter((event) => event.id !== button.dataset.deleteEvent) || [];
      const remainingCount = eventList.querySelectorAll(".event-card").length;
      eventCount.textContent = String(remainingCount);
      if (!remainingCount) {
        eventList.innerHTML = '<div class="state-card state-card-empty"><div><strong>No published clinics just yet.</strong>Check back soon for the next chance to level up your game.</div></div>';
      }
      showToast("Event deleted.");
    } catch (error) {
      console.error("Could not delete clinic event:", error);
      showToast(error?.message || "Could not delete the event. Please try again.");
    } finally {
      button.disabled = false;
    }
  }

  function getClinicDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  }

  async function getClinicVisitorContext() {
    try {
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) throw new Error("IP location lookup failed.");
      const data = await response.json();
      return { ip: data.ip || null, city: data.city || null, region: data.region || null, org: data.org || null };
    } catch (error) {
      console.warn("Could not load approximate clinic visitor location:", error);
      return {};
    }
  }

  async function trackClinicEventVisit(clinicEventId) {
    if (!clinicEventId || !supabaseClient) return;
    const visitor = {
      device_id: getClinicDeviceId(),
      ip: null,
      city: null,
      region: null,
      org: null,
      page: window.location.pathname || "unknown",
      full_url: window.location.href,
      query: window.location.search || null,
      mode: new URLSearchParams(window.location.search).get("p") || null,
      time: new Date().toISOString(),
      userAgent: navigator.userAgent,
      clinic_event_id: clinicEventId
    };

    Object.assign(visitor, await getClinicVisitorContext());
    try {
      const { error } = await supabaseClient.from("visitors").insert([visitor]);
      if (error) throw error;
    } catch (error) {
      console.warn("Could not record clinic event visit:", error?.message || error);
    }
  }

  function formatVisitorTime(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Unknown"
      : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function getCountRows(values, limit = 5) {
    const counts = new Map();
    values.forEach((value) => {
      const label = String(value || "Unknown").trim() || "Unknown";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return Array.from(counts, ([label, count]) => ({ label, count }))
      .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
      .slice(0, limit);
  }

  function renderCountList(rows) {
    if (!rows.length) return '<p class="analytics-empty-note">No data yet.</p>';
    const maximum = Math.max(...rows.map((row) => row.count), 1);
    return `<ul class="analytics-count-list">${rows.map((row) => `
      <li><span title="${escapeAttribute(row.label)}">${escapeHtml(row.label)}</span><strong>${row.count}</strong>
      <i style="--bar-width:${Math.round((row.count / maximum) * 100)}%"></i></li>`).join("")}</ul>`;
  }

  function renderVisitTimeline(visitors) {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return { date, key, count: 0 };
    });
    visitors.forEach((visitor) => {
      const date = new Date(visitor.time);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const day = days.find((item) => item.key === key);
      if (day) day.count += 1;
    });
    const maximum = Math.max(...days.map((day) => day.count), 1);
    return `<div class="analytics-bars" role="img" aria-label="Visits during the last seven days">${days.map((day) => `
      <div class="analytics-bar-day" title="${escapeAttribute(day.date.toLocaleDateString())}: ${day.count} visits">
        <span class="analytics-bar-value">${day.count || ""}</span><i style="--bar-height:${Math.max(day.count ? 10 : 3, Math.round((day.count / maximum) * 100))}%"></i>
        <small>${escapeHtml(new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day.date))}</small>
      </div>`).join("")}</div>`;
  }

  function renderVisitorRows(visitors) {
    if (!visitors.length) return '<div class="analytics-empty">No visits have been recorded for this clinic yet.</div>';
    return `<div class="visitor-list">${visitors.map((visitor) => {
      const cityRegion = [visitor.city, visitor.region].filter(Boolean).join(", ") || "Unavailable";
      const deviceId = String(visitor.device_id || "Unavailable");
      const shortDeviceId = deviceId.length > 18 ? `${deviceId.slice(0, 8)}…${deviceId.slice(-6)}` : deviceId;
      return `<article class="visitor-row">
        <div class="visitor-row-heading"><time>${escapeHtml(formatVisitorTime(visitor.time))}</time><span class="visitor-ip">${escapeHtml(visitor.ip || "IP unavailable")}</span></div>
        <div class="visitor-details">
          <div><span>Approx. IP location</span><strong>${escapeHtml(cityRegion)}</strong></div>
          <div><span>Organization / ISP</span><strong>${escapeHtml(visitor.org || "Unavailable")}</strong></div>
          <div><span>Device ID</span><button class="device-id-copy" type="button" data-copy-device="${escapeAttribute(deviceId)}" title="Full ID: ${escapeAttribute(deviceId)} — click to copy">${escapeHtml(shortDeviceId)} <span aria-hidden="true">⧉</span></button></div>
          <div><span>Browser / user-agent</span><strong class="visitor-user-agent" title="${escapeAttribute(visitor.userAgent || "Unavailable")}">${escapeHtml(visitor.userAgent || "Unavailable")}</strong></div>
          <div><span>Page visited</span><strong class="visitor-url">${escapeHtml(visitor.page || "Unavailable")}</strong></div>
          <div class="visitor-full-url"><span>Full URL</span><strong>${escapeHtml(visitor.full_url || "Unavailable")}</strong></div>
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function renderVisitorAnalytics(eventName, visitors) {
    const devices = new Map();
    visitors.forEach((visitor) => {
      const deviceId = visitor.device_id || "Unknown";
      devices.set(deviceId, (devices.get(deviceId) || 0) + 1);
    });
    const uniqueDevices = devices.size;
    const repeatDevices = Array.from(devices.values()).filter((count) => count > 1).length;
    const visits = visitors.slice().sort((first, second) => new Date(second.time) - new Date(first.time));
    const firstVisit = visits.length ? formatVisitorTime(visits[visits.length - 1].time) : "—";
    const lastVisit = visits.length ? formatVisitorTime(visits[0].time) : "—";
    const locations = getCountRows(visitors.map((visitor) => [visitor.city, visitor.region].filter(Boolean).join(", ") || "Unavailable"));
    const organizations = getCountRows(visitors.map((visitor) => visitor.org || "Unavailable"));

    analyticsContent.innerHTML = `
      <header class="analytics-header"><span class="eyebrow"><span class="eyebrow-dot"></span> PBTRKR CLINICS</span><h2 id="analytics-title">Visitor Analytics</h2><p>${escapeHtml(eventName)}</p></header>
      <div class="analytics-summary">
        <article><span>TOTAL VISITS</span><strong>${visitors.length}</strong></article>
        <article><span>UNIQUE DEVICES</span><strong>${uniqueDevices}</strong><small>${repeatDevices} repeat devices</small></article>
        <article><span>FIRST VISIT</span><strong>${escapeHtml(firstVisit)}</strong></article>
        <article><span>LAST VISIT</span><strong>${escapeHtml(lastVisit)}</strong></article>
      </div>
      <div class="analytics-insights">
        <section class="analytics-card"><h3>Visits over time</h3><p>Daily visits · last 7 days</p>${renderVisitTimeline(visitors)}</section>
        <section class="analytics-card"><h3>Top locations</h3><p>Approximate IP location</p>${renderCountList(locations)}</section>
        <section class="analytics-card"><h3>Top organizations</h3><p>Network / ISP</p>${renderCountList(organizations)}</section>
        <section class="analytics-card analytics-device-card"><h3>Device breakdown</h3><p>Repeat visits grouped by persistent device ID</p><div><strong>${uniqueDevices}</strong><span>unique devices</span><strong>${repeatDevices}</strong><span>repeat devices</span></div></section>
      </div>
      <section class="analytics-recent"><div class="analytics-section-heading"><div><span class="eyebrow">LATEST ACTIVITY</span><h3>Recent visitors</h3></div><span>${visitors.length} visits</span></div>${renderVisitorRows(visits)}</section>
      <p class="analytics-privacy-note">Location is approximate and based on IP address. No street or home address is collected.</p>`;
  }

  async function openVisitorAnalytics(button) {
    if (!supabaseClient || currentSession?.user?.app_metadata?.role !== "clinic_admin") {
      showToast("Visitor analytics are available to clinic administrators only.");
      return;
    }
    const eventId = button.dataset.trackVisitors;
    const eventName = button.dataset.eventName || "Clinic event";
    const requestId = ++analyticsRequestId;
    analyticsReturnFocus = button;
    analyticsModal.classList.remove("is-hidden");
    document.body.classList.add("analytics-open");
    analyticsContent.innerHTML = '<div class="analytics-loading"><span class="spinner" aria-hidden="true"></span>Loading visitor analytics…</div>';
    analyticsClose.focus();

    try {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (sessionData?.session?.user?.app_metadata?.role !== "clinic_admin") {
        closeAnalyticsModal();
        showToast("Visitor analytics are available to clinic administrators only.");
        return;
      }
      const { data, error } = await supabaseClient
        .from("visitors")
        .select("*")
        .eq("clinic_event_id", eventId)
        .order("time", { ascending: false });
      if (error) throw error;
      if (requestId !== analyticsRequestId || analyticsModal.classList.contains("is-hidden") || currentSession?.user?.app_metadata?.role !== "clinic_admin") return;
      renderVisitorAnalytics(eventName, data || []);
    } catch (error) {
      console.error("Could not load clinic visitor analytics:", error);
      if (requestId !== analyticsRequestId || analyticsModal.classList.contains("is-hidden") || currentSession?.user?.app_metadata?.role !== "clinic_admin") return;
      analyticsContent.innerHTML = `<div class="analytics-error"><strong>Analytics could not be loaded.</strong><span>${escapeHtml(error?.message || "Please check the visitor analytics migration and try again.")}</span></div>`;
    }
  }

  function closeAnalyticsModal() {
    if (!analyticsModal) return;
    analyticsRequestId += 1;
    analyticsModal.classList.add("is-hidden");
    document.body.classList.remove("analytics-open");
    analyticsContent.innerHTML = "";
    if (analyticsReturnFocus?.isConnected) analyticsReturnFocus.focus();
    analyticsReturnFocus = null;
  }

  analyticsClose.addEventListener("click", closeAnalyticsModal);
  analyticsModal.addEventListener("click", (event) => {
    if (event.target === analyticsModal) closeAnalyticsModal();
    const copyButton = event.target.closest("[data-copy-device]");
    if (copyButton) {
      const deviceId = copyButton.dataset.copyDevice || "";
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(deviceId)
          .then(() => showToast("Device ID copied."))
          .catch(() => showToast(deviceId));
      } else {
        showToast(deviceId);
      }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !analyticsModal.classList.contains("is-hidden")) closeAnalyticsModal();
  });

  loadEvents();
})();
