// Replace this server-only adapter with verified session/JWT identity and
// per-user read/write authorization before selecting private mode.
// Never trust a user-controlled header, Origin, or a browser-held shared secret.
export async function denyAll() { return false; }
