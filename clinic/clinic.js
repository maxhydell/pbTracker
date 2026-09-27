(() => {
  "use strict";

  const SUPABASE_URL = "https://qyhzxfserrvsgutfhyel.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aHp4ZnNlcnJ2c2d1dGZoeWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDQ4MDIsImV4cCI6MjA5MjM4MDgwMn0.5guDdk5wnohJw_czrfH4WxUZpZvi6l_0W9jGDmZ4jY4";
  const PONTE_VEDRA_YMCA = "Ponte Vedra YMCA";
  const PONTE_VEDRA_ADDRESS = "170 Landrum Ln, 32082, FL";
  const app = document.getElementById("app");
  const toast = document.getElementById("toast");
  let toastTimeout;
  let isFull = true;
  let descriptions = [];
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
    const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(dateValue, includeWeekday = true) {
    const date = parseDate(dateValue);
    if (!date) return "Date to be announced";
    const options = includeWeekday
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }

  function formatTime(timeValue) {
    if (!timeValue) return "Time to be announced";
    const match = String(timeValue).match(/^(\d{1,2}):(\d{2})/);
    if (!match) return String(timeValue);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
      .format(new Date(2000, 0, 1, Number(match[1]), Number(match[2])));
  }

  function formatTimeRange(event) {
    if (!event.start_time && !event.end_time) return "Time to be announced";
    if (!event.start_time) return `Until ${formatTime(event.end_time)}`;
    if (!event.end_time) return `From ${formatTime(event.start_time)}`;
    return `${formatTime(event.start_time)} – ${formatTime(event.end_time)}`;
  }

  function displayMessage(message, isError = false) {
    const box = document.getElementById("form-message");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("is-visible", Boolean(message));
    box.classList.toggle("is-error", isError);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function setButtonState(buttons, disabled, busyButton, busyLabel) {
    buttons.forEach((button) => {
      button.disabled = disabled;
      button.setAttribute("aria-busy", disabled ? "true" : "false");
    });
    if (busyButton) busyButton.textContent = busyLabel;
  }

  function renderAdminGate() {
    app.innerHTML = `
      <section class="clinic-card">
        <header class="clinic-header">
          <span class="eyebrow"><span class="eyebrow-dot"></span> PBTRKR CLINICS</span>
          <h1 class="clinic-title">Create an event</h1>
          <p class="clinic-subtitle">Sign in with an authorized clinic administrator account to manage events.</p>
        </header>
        <div class="clinic-body">
          <div class="state-panel" role="status">Event creation is available to authorized administrators only.</div>
        </div>
      </section>`;
  }

  function renderCreateForm() {
    app.innerHTML = `
      <section class="clinic-card">
        <header class="clinic-header">
          <span class="eyebrow"><span class="eyebrow-dot"></span> PBTRKR CLINICS</span>
          <h1 class="clinic-title">Create an event</h1>
          <p class="clinic-subtitle">Set the details, make room for good reps, and share your next clinic.</p>
        </header>
        <div class="clinic-body">
          <form id="clinic-form" novalidate>
            <div class="form-grid">
              <div class="field field-wide">
                <label class="field-label" for="event-name">Event Name</label>
                <input class="input" id="event-name" name="event_name" maxlength="120" required placeholder="Max's 3rd Shot Clinic">
              </div>
              <div class="field">
                <label class="field-label" for="event-date">Date</label>
                <input class="input" id="event-date" name="event_date" type="date" required>
              </div>
              <div class="field">
                <label class="field-label" for="player-capacity">Amount of Players</label>
                <input class="input" id="player-capacity" name="player_capacity" type="number" min="1" max="500" step="1" required placeholder="16">
              </div>
              <div class="field">
                <label class="field-label" for="start-time">Start Time</label>
                <input class="input" id="start-time" name="start_time" type="time" required>
              </div>
              <div class="field">
                <label class="field-label" for="end-time">End Time</label>
                <input class="input" id="end-time" name="end_time" type="time" required>
              </div>
              <div class="field field-wide">
                <label class="field-label" for="description">Description</label>
                <p class="field-hint">Add a few details about the skills, format, or players the clinic is for.</p>
                <div class="suggestions-wrap">
                  <textarea class="textarea" id="description" name="description" maxlength="5000" placeholder="Join us for a focused clinic…"></textarea>
                  <div class="suggestions" id="description-suggestions" role="listbox" aria-label="Recent descriptions"></div>
                </div>
              </div>
              <div class="field field-wide">
                <label class="field-label" for="location">Location</label>
                <div class="suggestions-wrap">
                  <input class="input" id="location" name="location" maxlength="160" autocomplete="off" required placeholder="Start typing a location">
                  <div class="location-options" id="location-options">
                    <button class="location-option" type="button" data-location="Ponte Vedra YMCA">Ponte Vedra YMCA <span class="field-hint">170 Landrum Ln, 32082, FL</span></button>
                  </div>
                </div>
                <input id="address" name="address" type="hidden" value="">
              </div>
              <div class="field field-wide">
                <span class="field-label">Availability</span>
                <div class="toggle-row">
                  <div class="toggle-copy"><strong id="full-label">Full</strong><span id="full-description">The clinic is at capacity.</span></div>
                  <button class="toggle" id="full-toggle" type="button" role="switch" aria-checked="true" aria-label="Toggle event availability"></button>
                </div>
              </div>
            </div>
            <div class="form-message" id="form-message" role="alert"></div>
            <div class="form-actions">
              <button class="button button-secondary" type="button" id="save-draft">Save Draft</button>
              <button class="button button-primary" type="button" id="publish-event">Publish Event <span aria-hidden="true">→</span></button>
            </div>
          </form>
          <div class="security-note"><span class="security-note-icon" aria-hidden="true">●</span><span>Events are protected by Supabase row-level security. Only authorized clinic administrators can create or publish events.</span></div>
        </div>
      </section>`;

    bindFormEvents();
    loadRecentDescriptions();
  }

  function bindFormEvents() {
    const form = document.getElementById("clinic-form");
    const textarea = document.getElementById("description");
    const suggestions = document.getElementById("description-suggestions");
    const locationInput = document.getElementById("location");
    const locationOptions = document.getElementById("location-options");
    const toggle = document.getElementById("full-toggle");
    const saveButton = document.getElementById("save-draft");
    const publishButton = document.getElementById("publish-event");

    const updateSuggestions = () => {
      const currentValue = textarea.value.trim();
      const matches = descriptions
        .filter((description) => description.toLocaleLowerCase() !== currentValue.toLocaleLowerCase())
        .slice(0, 3);
      if (!matches.length) {
        suggestions.innerHTML = "";
        suggestions.classList.remove("is-open");
        return;
      }
      suggestions.innerHTML = `<div class="suggestions-heading">Recent descriptions</div>${matches.map((description, index) =>
        `<button type="button" class="suggestion" role="option" data-description-index="${index}" title="${escapeHtml(description)}">${escapeHtml(description)}</button>`
      ).join("")}`;
      suggestions.classList.add("is-open");
    };

    textarea.addEventListener("focus", updateSuggestions);
    textarea.addEventListener("click", updateSuggestions);
    textarea.addEventListener("input", updateSuggestions);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") suggestions.classList.remove("is-open");
    });
    suggestions.addEventListener("click", (event) => {
      const option = event.target.closest("[data-description-index]");
      if (!option) return;
      const description = descriptions
        .filter((item) => item.toLocaleLowerCase() !== textarea.value.trim().toLocaleLowerCase())
        .slice(0, 3)[Number(option.dataset.descriptionIndex)];
      if (description !== undefined) textarea.value = description;
      suggestions.classList.remove("is-open");
      textarea.focus();
    });
    document.addEventListener("click", (event) => {
      if (!suggestions.contains(event.target) && event.target !== textarea) suggestions.classList.remove("is-open");
      if (!locationOptions.contains(event.target) && event.target !== locationInput) locationOptions.classList.remove("is-open");
    });

    locationInput.addEventListener("focus", () => locationOptions.classList.add("is-open"));
    locationInput.addEventListener("input", () => {
      locationOptions.classList.toggle("is-open", PONTE_VEDRA_YMCA.toLocaleLowerCase().includes(locationInput.value.trim().toLocaleLowerCase()));
      if (locationInput.value.trim() !== PONTE_VEDRA_YMCA) document.getElementById("address").value = "";
    });
    locationOptions.addEventListener("click", (event) => {
      const option = event.target.closest("[data-location]");
      if (!option) return;
      locationInput.value = PONTE_VEDRA_YMCA;
      document.getElementById("address").value = PONTE_VEDRA_ADDRESS;
      locationOptions.classList.remove("is-open");
    });

    toggle.addEventListener("click", () => {
      isFull = !isFull;
      toggle.setAttribute("aria-checked", String(isFull));
      document.getElementById("full-label").textContent = isFull ? "Full" : "Not Full";
      document.getElementById("full-description").textContent = isFull
        ? "The clinic is at capacity."
        : "Spots are currently available.";
    });

    saveButton.addEventListener("click", () => saveEvent("draft", form, saveButton, publishButton));
    publishButton.addEventListener("click", () => saveEvent("published", form, saveButton, publishButton));
  }

  async function loadRecentDescriptions() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from("clinic_events")
        .select("description")
        .not("description", "is", null)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;

      const seen = new Set();
      descriptions = (data || []).reduce((unique, row) => {
        const description = String(row.description || "").trim();
        const key = description.toLocaleLowerCase();
        if (description && !seen.has(key)) {
          seen.add(key);
          unique.push(description);
        }
        return unique;
      }, []).slice(0, 3);
    } catch (error) {
      console.error("Could not load recent clinic descriptions:", error);
    }
  }

  async function saveEvent(status, form, saveButton, publishButton) {
    const message = document.getElementById("form-message");
    message.classList.remove("is-visible");
    if (!form.reportValidity()) return;

    const startTime = form.elements.start_time.value;
    const endTime = form.elements.end_time.value;
    if (endTime <= startTime) {
      displayMessage("End time must be later than start time.", true);
      form.elements.end_time.focus();
      return;
    }

    const location = form.elements.location.value.trim();
    if (location.toLocaleLowerCase() === PONTE_VEDRA_YMCA.toLocaleLowerCase()) {
      form.elements.location.value = PONTE_VEDRA_YMCA;
      form.elements.address.value = PONTE_VEDRA_ADDRESS;
    }

    if (!supabaseClient) {
      displayMessage("Event storage is unavailable right now. Please try again later.", true);
      return;
    }

    const originalSaveText = "Save Draft";
    const originalPublishText = "Publish Event →";
    const busyButton = status === "draft" ? saveButton : publishButton;
    setButtonState([saveButton, publishButton], true, busyButton, status === "draft" ? "Saving…" : "Publishing…");

    try {
      const sessionResult = await supabaseClient.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data?.session;
      if (!session) {
        renderAdminGate();
        return;
      }

      const now = new Date().toISOString();
      const payload = {
        event_name: form.elements.event_name.value.trim(),
        event_date: form.elements.event_date.value,
        start_time: startTime,
        end_time: endTime,
        description: form.elements.description.value.trim(),
        player_capacity: Number(form.elements.player_capacity.value),
        location: form.elements.location.value.trim(),
        address: form.elements.address.value.trim() || null,
        is_full: isFull,
        status,
        updated_at: now,
        ...(status === "published" ? { published_at: now } : {})
      };

      const { data, error } = await supabaseClient
        .from("clinic_events")
        .insert(payload)
        .select("id,status")
        .single();
      if (error) throw error;
      if (!data?.id) throw new Error("The database did not return an event ID.");

      if (status === "published") {
        window.location.assign(`/clinic/${encodeURIComponent(data.id)}`);
        return;
      }

      showToast("Draft saved.");
      displayMessage(`Draft saved. Event ID: ${data.id}. It will remain private until published.`);
      setButtonState([saveButton, publishButton], false, null, "");
      saveButton.textContent = "Save Draft";
      publishButton.innerHTML = 'Publish Event <span aria-hidden="true">→</span>';
    } catch (error) {
      console.error(`Could not ${status === "draft" ? "save draft" : "publish clinic"}:`, error);
      const description = error?.message || "Please check your details and try again.";
      displayMessage(description.includes("clinic_events") || description.includes("permission")
        ? "The event could not be saved. Confirm the clinic_events table and administrator write policy are set up."
        : description, true);
      setButtonState([saveButton, publishButton], false, null, "");
      saveButton.textContent = originalSaveText;
      publishButton.innerHTML = `${originalPublishText.replace(" →", "")} <span aria-hidden="true">→</span>`;
    }
  }

  function renderEvent(event) {
    const badge = event.is_full === true
      ? '<span class="full-badge">FULL</span>'
      : "";
    const location = event.location || "Location to be announced";
    const address = event.address || "";
    const description = event.description
      ? `<p>${escapeHtml(event.description)}</p>`
      : "<p>More information about this clinic will be added soon.</p>";

    document.title = `${event.event_name || "Clinic"} | PBTRKR Clinics`;
    app.innerHTML = `
      <article class="clinic-card">
        <header class="event-hero clinic-header">
          <span class="eyebrow"><span class="eyebrow-dot"></span> PICKLEBALL CLINIC</span>
          <h1 class="clinic-title">${escapeHtml(event.event_name || "Pickleball Clinic")}</h1>
          ${badge}
          <div class="event-meta">
            <div class="meta-item"><span class="meta-icon" aria-hidden="true">◷</span><div><span class="meta-label">Date &amp; time</span><span class="meta-value">${escapeHtml(formatDate(event.event_date))}</span><span class="meta-value">${escapeHtml(formatTimeRange(event))}</span></div></div>
            <div class="meta-item"><span class="meta-icon" aria-hidden="true">⌖</span><div><span class="meta-label">Location</span><span class="meta-value">${escapeHtml(location)}</span>${address ? `<span class="meta-value">${escapeHtml(address)}</span>` : ""}</div></div>
          </div>
        </header>
        <section class="event-description" aria-labelledby="description-title">
          <h2 id="description-title">About this clinic</h2>
          <div class="description-copy">${description}</div>
        </section>
      </article>`;
  }

  function showNotFound() {
    document.title = "Event not found | PBTRKR Clinics";
    app.innerHTML = `
      <section class="state-panel error-state">
        <h1>Event not found</h1>
        <p>This clinic link may be incorrect, or the event is no longer available.</p>
        <a class="button button-primary" href="/clinics">Back to clinics</a>
      </section>`;
  }

  async function loadEvent(eventId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
      showNotFound();
      return;
    }
    if (!supabaseClient) {
      app.innerHTML = '<section class="state-panel">The clinic service is unavailable right now. Please try again later.</section>';
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("clinic_events")
        .select("id,event_name,event_date,start_time,end_time,description,player_capacity,location,address,is_full,status")
        .eq("id", eventId)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        showNotFound();
        return;
      }
      renderEvent(data);
    } catch (error) {
      console.error("Could not load clinic event:", error);
      app.innerHTML = '<section class="state-panel">This event could not be loaded right now. Please try again later.</section>';
    }
  }

  async function initialize() {
    const parameters = new URLSearchParams(window.location.search);
    const createRequested = parameters.get("p") === "create";
    const eventId = parameters.get("c") || window.location.pathname.match(/^\/clinic\/([^/]+)\/?$/i)?.[1];

    if (createRequested) {
      if (!supabaseClient) {
        app.innerHTML = '<section class="state-panel">The clinic service is unavailable right now. Please try again later.</section>';
        return;
      }
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (!data?.session) {
          renderAdminGate();
          return;
        }
        renderCreateForm();
      } catch (error) {
        console.error("Could not check clinic administrator session:", error);
        renderAdminGate();
      }
      return;
    }

    if (!eventId) {
      showNotFound();
      return;
    }
    await loadEvent(decodeURIComponent(eventId));
  }

  initialize();
})();
