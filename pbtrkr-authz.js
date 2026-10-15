(function attachPbtrkrAuthorization(root) {
  const ADMIN_ROLES = new Set(["pbtrkr_admin", "clinic_admin"]);

  function isAdminRole(role) {
    return ADMIN_ROLES.has(role);
  }

  function isPbtrkrEditorRole(role) {
    return role === "pbtrkr_editor" || isAdminRole(role);
  }

  const api = { isAdminRole, isPbtrkrEditorRole };
  root.PBTRKRAuthorization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);