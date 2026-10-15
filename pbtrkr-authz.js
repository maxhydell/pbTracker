(function attachPbtrkrAuthorization(root) {
  const SUPERADMIN_USER_ID = "29184436-bd03-4239-8f8a-7f2afa10aeb6";
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

  function isAdminUser(user) {
    return user?.id === SUPERADMIN_USER_ID || isAdminRole(user?.app_metadata?.role);
  }

  function isPbtrkrEditorUser(user) {
    return user?.id === SUPERADMIN_USER_ID || isPbtrkrEditorRole(user?.app_metadata?.role);
  }

  const api = {
    SUPERADMIN_USER_ID,
    normalizeRole,
    isAdminRole,
    isPbtrkrEditorRole,
    isAdminUser,
    isPbtrkrEditorUser
  };
  root.PBTRKRAuthorization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);