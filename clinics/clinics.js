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
  let currentSession = null;
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
        <div class="event-actions">
          <a class="button button-primary" href="${escapeHtml(url)}">Visit <span aria-hidden="true">→</span></a>
          <button class="button button-secondary" type="button" data-copy-url="${escapeHtml(url)}">Copy 🔗</button>
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
      eventCount.textContent = String(events.length);

      if (!events.length) {
        console.info("[PBTRKR Clinics] No published events matched the dashboard filters.", filters);
      }

      if (!events.length) {
        eventList.innerHTML = '<div class="state-card state-card-empty"><div><strong>No published clinics just yet.</strong>Check back soon for the next chance to level up your game.</div></div>';
        return;
      }

      eventList.innerHTML = events.map(renderEvent).join("");
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

  loadEvents();
})();
