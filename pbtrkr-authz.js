(function attachPbtrkrAuthorization(root) {
  const ADMIN_ROLES = new Set(["pbtrkr_admin", "clinic_admin"]);

  function normalizeRole(role) {
    return typeof role === "string" ? role.trim().toLowerCase() : "";
  }

  function isAdminRole(role) {
    return ADMIN_ROLES.has(normalizeRole(role));
  }

  function isPbtrkrEditorRole(role) {
    const normalizedRole = normalizeRole(role);
    return normalizedRole === "pbtrkr_editor" || ADMIN_ROLES.has(normalizedRole);
  }

  const api = { normalizeRole, isAdminRole, isPbtrkrEditorRole };
  root.PBTRKRAuthorization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);