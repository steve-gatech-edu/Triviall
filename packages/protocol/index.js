// Triviall protocol constants and light validation. Versioned so clients and games can refuse mismatches.
export const PROTOCOL_VERSION = 1;
export const SDK_VERSION = 1;
export const CLIENT_ROLES = Object.freeze(['host', 'display', 'player']);

/** Returns an error code string, or null when the message is acceptable. */
export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'bad_input';
  if (typeof input.type !== 'string' || input.type.length === 0 || input.type.length > 32) return 'bad_input';
  if (JSON.stringify(input).length > 4096) return 'too_large';
  return null;
}

/** Wraps a role-specific view in a versioned envelope. */
export function envelope({ roomId, revision, role, payload, at = Date.now() }) {
  return { v: PROTOCOL_VERSION, roomId, revision, role, at, payload };
}
