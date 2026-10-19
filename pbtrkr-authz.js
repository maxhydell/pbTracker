(function attachPbtrkrAuthorization(root) {
  const ADMIN_ROLE = "clinic_admin";
  const ADMIN_ROLES = new Set([ADMIN_ROLE]);

  function normalizeRole(role) {
    return typeof role === "string" ? role.trim().toLowerCase() : "";
  }

  function normalizeRoleList(value) {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) {
      return value.flatMap(item => normalizeRoleList(item));
    }
    if (typeof value === "string") {
      return value.split(",").map(part => normalizeRole(part)).filter(Boolean);
    }
    return [];
  }

  function hasAnyRole(roleSet, roleValue) {
    return normalizeRoleList(roleValue).some(normalizedRole => roleSet.has(normalizedRole));
  }

  function isAdminRole(role) {
    return hasAnyRole(ADMIN_ROLES, role);
  }

  function isPbtrkrEditorRole(role) {
    return isAdminRole(role);
  }

  function userRoles(user) {
    const appMetadata = user?.app_metadata || {};
    return normalizeRoleList([appMetadata?.role, appMetadata?.roles]);
  }

  function isAdminUser(user) {
    return isAdminRole(userRoles(user));
  }

  function isPbtrkrEditorUser(user) {
    return isAdminUser(user);
  }

  function getDeviceStorageContext() {
    const storage = root.localStorage;
    const query = new URLSearchParams(root.location?.search || "");
    const player = (query.get("p")
      || storage?.getItem("pbTracker_playerPref_v1")
      || storage?.getItem("player")
      || "").trim().toLowerCase();
    return {
      storage,
      key: player ? `pbTracker_deviceId_v1_${player}` : "pbTracker_deviceId_v1"
    };
  }

  function getDeviceId() {
    const { storage, key } = getDeviceStorageContext();
    if (!storage) return "";
    return storage.getItem(key) || storage.getItem("pbTracker_deviceId_v1") || "";
  }

  function getOrCreateDeviceId() {
    const { storage, key } = getDeviceStorageContext();
    if (!storage) return "";
    const existing = storage.getItem(key) || storage.getItem("pbTracker_deviceId_v1");
    if (existing) return existing;
    const id = root.crypto.randomUUID();
    storage.setItem(key, id);
    return id;
  }

  const api = {
    ADMIN_ROLE,
    normalizeRole,
    isAdminRole,
    isPbtrkrEditorRole,
    isAdminUser,
    isPbtrkrEditorUser,
    getDeviceId,
    getOrCreateDeviceId
  };
  root.PBTRKRAuthorization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
