(function attachPbtrkrAuthorization(root) {
  const SUPERADMIN_USER_ID = "29184436-bd03-4239-8f8a-7f2afa10aeb6";
  const ADMIN_ROLES = new Set(["pbtrkr_admin", "clinic_admin", "pbtrkr_superadmin", "superadmin"]);

  function normalizeRole(role) {
    return typeof role === "string" ? role.trim().toLowerCase() : "";
  }

  function normalizeRoleList(value) {
    if (Array.isArray(value)) {
      return value.map(item => normalizeRole(item)).filter(Boolean);
    }
    return [normalizeRole(value)].filter(Boolean);
  }

  function hasAnyRole(roleSet, roleValue) {
    return normalizeRoleList(roleValue).some(normalizedRole => roleSet.has(normalizedRole));
  }

  function isAdminRole(role) {
    return hasAnyRole(ADMIN_ROLES, role);
  }

  function isPbtrkrEditorRole(role) {
    const roles = normalizeRoleList(role);
    return roles.some(normalizedRole => normalizedRole === "pbtrkr_editor" || ADMIN_ROLES.has(normalizedRole));
  }

  function userRoles(user) {
    const appMetadata = user?.app_metadata || {};
    const metadataRoles = Array.isArray(appMetadata.roles) ? appMetadata.roles : [];
    const userRoles = Array.isArray(user?.roles) ? user.roles : [];
    return [
      user?.role,
      appMetadata?.role,
      ...metadataRoles,
      ...userRoles
    ];
  }

  function isAdminUser(user) {
    return user?.id === SUPERADMIN_USER_ID || isAdminRole(userRoles(user));
  }

  function isPbtrkrEditorUser(user) {
    return user?.id === SUPERADMIN_USER_ID || isPbtrkrEditorRole(userRoles(user));
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
    SUPERADMIN_USER_ID,
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