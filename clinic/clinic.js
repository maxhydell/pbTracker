(() => {
  "use strict";

  const SUPABASE_URL = "https://qyhzxfserrvsgutfhyel.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5aHp4ZnNlcnJ2c2d1dGZoeWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDQ4MDIsImV4cCI6MjA5MjM4MDgwMn0.5guDdk5wnohJw_czrfH4WxUZpZvi6l_0W9jGDmZ4jY4";
  const AUTH_REDIRECT_URL = "https://pbtrkr.app/clinic/?p=auth";
  const PONTE_VEDRA_YMCA = "Ponte Vedra YMCA";
  const PONTE_VEDRA_ADDRESS = "170 Landrum Ln, 32082, FL";
  const PARTICIPANT_NAME_SOURCE = [
    "Aaron Weinberg",
    "Abby Meyer",
    "Adam Fannin",
    "Adam Frantz",
    "Allie Perkner",
    "Amal Rangachari",
    "Amy Wessels",
    "Andrea Vander Kooi",
    "Angel Matias Lopez",
    "Christian Rambler",
    "Christine (Tina) Ford",
    "Chuck Smith",
    "Cleigh Carson",
    "Cleigh Carson",
    "Cole Rambler",
    "Colleen Conklin",
    "Collier Miller",
    "Rosemary Kennedy",
    "Ryan Dellacrosse",
    "Sairam Rangachari",
    "Samir Rangachari",
    "Sammie Graham",
    "Sandra Ortega",
    "Sarah Henshaw",
    "Scott Wolter",
    "Scott Shirley",
    "Kimberly Shine",
    "Lam La",
    "Larry Blake",
    "Laura Gainor",
    "Laura West",
    "Laura Davis",
    "Laura Cowie",
    "Leslie Simpkins",
    "Liliana (Lili) Potenza"
  ];
  const app = document.getElementById("app");
  const toast = document.getElementById("toast");
  let toastTimeout;
  let isFull = true;
  let descriptions = [];
  let currentRoute = "";
  let authSubscription;
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

  function normalizeParticipantName(name) {
    return String(name || "")
      .normalize("NFKC")
      .replace(/[().,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  function getFirstAndLastName(name) {
    const cleanName = String(name || "")
      .normalize("NFKC")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = cleanName.split(" ").filter(Boolean);
    if (parts.length < 2) return "";
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  function getUniqueParticipantNames() {
    const uniqueSourceNames = new Map();
    PARTICIPANT_NAME_SOURCE.forEach((name) => {
      const normalizedName = normalizeParticipantName(name);
      if (normalizedName && !uniqueSourceNames.has(normalizedName)) {
        uniqueSourceNames.set(normalizedName, name);
      }
    });

    const seenDisplayNames = new Set();
    return Array.from(uniqueSourceNames.values()).reduce((names, sourceName) => {
      const displayName = getFirstAndLastName(sourceName);
      const normalizedDisplayName = normalizeParticipantName(displayName);
      if (displayName && !seenDisplayNames.has(normalizedDisplayName)) {
        seenDisplayNames.add(normalizedDisplayName);
        names.push(displayName);
      }
      return names;
    }, []);
  }

  function createSeededRandom(seed) {
    let state = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
    }

    return () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getParticipants(event) {
    const capacity = Number(event.player_capacity);
    const availableNames = getUniqueParticipantNames();
    if (!Number.isSafeInteger(capacity) || capacity < 1 || !event.id) return [];

    const random = createSeededRandom(String(event.id));
    const shuffledNames = availableNames.slice();
    for (let index = shuffledNames.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffledNames[index], shuffledNames[swapIndex]] = [shuffledNames[swapIndex], shuffledNames[index]];
    }

    return shuffledNames.slice(0, Math.min(capacity, shuffledNames.length));
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

  function renderUnauthorized(user) {
    const account = user?.email || "your account";
    document.title = "Permission required | PBTRKR Clinics";
    app.innerHTML = `
      <section class="auth-card auth-card-compact" aria-labelledby="auth-title">
        <a class="auth-brand" href="/clinics" aria-label="PBTRKR Clinics"><img src="/logo.png" alt=""><span>PBTRKR</span><i></i><span class="auth-brand-section">Clinics</span></a>
        <div class="auth-state-icon" aria-hidden="true">!</div>
        <h1 id="auth-title">Permission required</h1>
        <p class="auth-description">You’re signed in, but you don’t have permission to create clinic events.</p>
        <p class="auth-account">Signed in as ${escapeHtml(account)}</p>
        <div class="auth-state-actions">
          <a class="auth-button auth-button-primary" href="/clinics">Back to Clinics</a>
          <button class="auth-button auth-button-secondary" id="unauthorized-sign-out" type="button">Sign Out</button>
        </div>
      </section>`;
    document.getElementById("unauthorized-sign-out").addEventListener("click", signOut);
  }

  function renderAuthPage() {
    document.title = "Sign in | PBTRKR Clinics";
    app.innerHTML = `
      <section class="auth-card" aria-labelledby="auth-title">
        <a class="auth-brand" href="/clinics" aria-label="PBTRKR Clinics"><img src="/logo.png" alt=""><span>PBTRKR</span><i></i><span class="auth-brand-section">Clinics</span></a>
        <div class="auth-heading">
          <span class="eyebrow"><span class="eyebrow-dot"></span> YOUR NEXT POINT STARTS HERE</span>
          <h1 id="auth-title">Welcome to the club.</h1>
          <p class="auth-description">Sign in or create your account</p>
        </div>
        <div class="auth-account-state" id="auth-account-state" aria-live="polite"></div>
        <div class="auth-methods" id="auth-methods">
          <button class="auth-button auth-provider-button" id="google-sign-in" type="button"><span class="provider-icon google-icon" aria-hidden="true">G</span>Continue with Google</button>
          <div class="auth-divider"><span>OR CONTINUE WITH</span></div>
          <button class="auth-button auth-method-button" id="show-email" type="button"><span class="method-icon" aria-hidden="true">✉</span><span><strong>Email</strong><small>Get a sign-in link in your inbox</small></span><span class="method-arrow" aria-hidden="true">→</span></button>
        </div>
        <form class="auth-form is-hidden" id="email-form" novalidate>
          <label for="auth-email">Email address</label>
          <input class="auth-input" id="auth-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com">
          <button class="auth-button auth-button-primary" id="send-magic-link" type="submit">Send Magic Link <span aria-hidden="true">→</span></button>
          <button class="auth-back-button" type="button" data-back-to-methods>← All sign-in methods</button>
        </form>
        <section class="auth-confirmation is-hidden" id="email-confirmation" aria-live="polite">
          <div class="auth-state-icon" aria-hidden="true">✉</div>
          <h2>Check your email</h2>
          <p id="email-confirmation-copy"></p>
          <p class="auth-form-hint">Use the link in the email to continue.</p>
          <button class="auth-back-button" type="button" data-back-to-methods>← Back to sign-in methods</button>
        </section>
        <div class="auth-feedback" id="auth-feedback" role="alert" aria-live="polite"></div>
        <p class="auth-legal">By continuing, you agree to use PBTRKR Clinics responsibly.</p>
      </section>`;

    document.getElementById("google-sign-in").addEventListener("click", () => signInWithOAuth("google"));
    document.getElementById("show-email").addEventListener("click", showEmailForm);
    document.getElementById("email-form").addEventListener("submit", sendMagicLink);
    document.querySelectorAll("[data-back-to-methods]").forEach((button) => button.addEventListener("click", showAuthMethods));
  }

  function showAuthMethods() {
    document.getElementById("auth-methods")?.classList.remove("is-hidden");
    document.getElementById("email-form")?.classList.add("is-hidden");
    document.getElementById("email-confirmation")?.classList.add("is-hidden");
    setAuthFeedback("");
  }

  function showEmailForm() {
    document.getElementById("auth-methods").classList.add("is-hidden");
    document.getElementById("email-form").classList.remove("is-hidden");
    document.getElementById("auth-email").focus();
    setAuthFeedback("");
  }

  function setAuthFeedback(message, isError = true) {
    const feedback = document.getElementById("auth-feedback");
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-visible", Boolean(message));
    feedback.classList.toggle("is-error", isError);
  }

  function setAuthBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = busyText;
    } else {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function showEmailConfirmation(email) {
    document.getElementById("auth-methods").classList.add("is-hidden");
    document.getElementById("email-form").classList.add("is-hidden");
    document.getElementById("email-confirmation-copy").textContent = `Your sign-in link has been sent to ${email}.`;
    document.getElementById("email-confirmation").classList.remove("is-hidden");
    setAuthFeedback("", false);
  }

  async function signInWithOAuth(provider) {
    const button = document.getElementById(`${provider}-sign-in`);
    setAuthBusy(button, true, "Connecting…");
    setAuthFeedback("");
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: getAuthRedirectUrl() }
      });
      if (error) throw error;
    } catch (error) {
      console.error(`${provider} authentication failed:`, error);
      setAuthFeedback(error.message || `Could not start ${provider} sign-in. Please try again.`);
      setAuthBusy(button, false);
    }
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    if (!form.reportValidity()) return;
    const button = document.getElementById("send-magic-link");
    setAuthBusy(button, true, "Sending link…");
    setAuthFeedback("");
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getAuthRedirectUrl() }
      });
      if (error) throw error;
      showEmailConfirmation(email);
    } catch (error) {
      console.error("Email magic link could not be sent:", error);
      setAuthFeedback(error.message || "Could not send the sign-in link. Please try again.");
    } finally {
      setAuthBusy(button, false);
    }
  }

  function getAuthRedirectUrl() {
    const redirectUrl = new URL(AUTH_REDIRECT_URL);
    if (new URLSearchParams(window.location.search).get("next") === "create") {
      redirectUrl.searchParams.set("next", "create");
    }
    return redirectUrl.href;
  }

  async function signOut() {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      if (currentRoute === "create") {
        window.location.replace("/clinic/?p=auth");
      } else {
        renderAuthMethodsAfterSignOut();
      }
    } catch (error) {
      console.error("Could not sign out:", error);
      setAuthFeedback(error.message || "Could not sign out. Please try again.");
    }
  }

  function renderAuthMethodsAfterSignOut() {
    renderAuthPage();
    showAuthMethods();
    syncAuthState(null);
  }

  function isClinicAdmin(user) {
    return user?.app_metadata?.role === "clinic_admin";
  }

  function handleAuthSession(session, authEvent = "INITIAL_SESSION") {
    if (currentRoute === "auth") {
      syncAuthState(session);
      const next = new URLSearchParams(window.location.search).get("next");
      if (next === "create" && isClinicAdmin(session?.user)) {
        window.location.replace("/clinic/?p=create");
      } else if (session?.user && authEvent === "SIGNED_IN" && next !== "create") {
        window.location.replace("/clinics/");
      }
      return;
    }
    if (currentRoute === "create") {
      if (!session?.user) {
        window.location.replace("/clinic/?p=auth&next=create");
      } else if (!isClinicAdmin(session.user)) {
        renderUnauthorized(session.user);
      }
    }
  }

  function syncAuthState(session) {
    const methods = document.getElementById("auth-methods");
    if (!methods) return;
    const accountState = document.getElementById("auth-account-state");
    const user = session?.user;
    if (!user) {
      accountState?.classList.add("is-hidden");
      methods.classList.remove("is-hidden");
      return;
    }

    methods.classList.add("is-hidden");
    document.getElementById("email-form")?.classList.add("is-hidden");
    document.getElementById("email-confirmation")?.classList.add("is-hidden");
    const identity = user.email || "Your account";
    if (accountState) {
      accountState.innerHTML = `
        <span class="auth-state-icon" aria-hidden="true">✓</span>
        <span class="auth-signed-in-label">You’re signed in</span>
        <strong>${escapeHtml(identity)}</strong>
        <span class="auth-role-label">${isClinicAdmin(user) ? "Clinic administrator" : "PBTRKR Clinics account"}</span>
        <button class="auth-button auth-button-secondary" id="auth-sign-out" type="button">Sign Out</button>`;
      accountState.classList.remove("is-hidden");
      document.getElementById("auth-sign-out").addEventListener("click", signOut);
    }
  }

  function renderAdminGate(user) {
    if (!user) {
      window.location.replace("/clinic/?p=auth&next=create");
      return;
    }
    renderUnauthorized(user);
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
    const participants = getParticipants(event);
    const participantsMarkup = participants.length
      ? `<ol class="participants-grid">${participants.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ol>`
      : '<p class="participants-empty">Participant names are not available for this event.</p>';

    document.title = `${event.event_name || "Clinic"} | PBTRKR Clinics`;
    app.innerHTML = `
      <article class="clinic-card">
        <header class="event-hero clinic-header">
          <div class="event-hero-topline">
            <span class="eyebrow"><span class="eyebrow-dot"></span> PICKLEBALL CLINIC</span>
            <span class="pro-eyebrow"><strong>MAX HYDELL</strong><span>PICKLEBALL PRO</span></span>
          </div>
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
        <section class="participants-section" aria-labelledby="participants-title">
          <div class="participants-heading">
            <div><span class="eyebrow">CLINIC ROSTER</span><h2 id="participants-title">Participants</h2></div>
            ${participants.length ? `<span class="participants-count">${participants.length} ${participants.length === 1 ? "player" : "players"}</span>` : ""}
          </div>
          ${participantsMarkup}
        </section>
        <div class="registration-closed-wrap">
          <button class="registration-closed-button" type="button" disabled aria-disabled="true">🔒 Registration Closed</button>
        </div>
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
    const authRequested = parameters.get("p") === "auth";
    const createRequested = parameters.get("p") === "create";
    const eventId = parameters.get("c") || window.location.pathname.match(/^\/clinic\/([^/]+)\/?$/i)?.[1];

    if (authRequested) {
      currentRoute = "auth";
      renderAuthPage();
      if (!supabaseClient) {
        setAuthFeedback("The sign-in service is unavailable right now. Please try again later.");
        return;
      }
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        handleAuthSession(data?.session || null);
      } catch (error) {
        console.error("Could not load clinic auth session:", error);
        setAuthFeedback(error.message || "Could not load your account. Please refresh and try again.");
      }
      return;
    }

    if (createRequested) {
      currentRoute = "create";
      if (!supabaseClient) {
        app.innerHTML = '<section class="state-panel">The clinic service is unavailable right now. Please try again later.</section>';
        return;
      }
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        const user = data?.session?.user;
        if (!user) {
          renderAdminGate(null);
          return;
        }
        if (!isClinicAdmin(user)) {
          renderAdminGate(user);
          return;
        }
        renderCreateForm();
      } catch (error) {
        console.error("Could not check clinic administrator session:", error);
        app.innerHTML = '<section class="state-panel">Could not verify clinic permissions. Please refresh and try again.</section>';
      }
      return;
    }

    currentRoute = "event";
    if (!eventId) {
      showNotFound();
      return;
    }
    await loadEvent(decodeURIComponent(eventId));
  }

  if (supabaseClient) {
    authSubscription = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
        handleAuthSession(session, event);
      }
    }).data.subscription;
  }

  initialize();
})();
