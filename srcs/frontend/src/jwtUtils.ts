/**
 * JWT Utility Functions
 * 
 * Provides safe JWT decoding with validation and error handling.
 * Note: This only decodes the payload - actual signature verification
 * should happen on the server side.
 */

export interface JWTPayload {
  uid: number;
  iat?: number;
  exp?: number;
}

/**
 * Safely decode a JWT token and extract the payload
 * @param token - The JWT token string
 * @returns The decoded payload or null if invalid
 */
export function decodeJWT(token: string): JWTPayload | null {
  if (!token || typeof token !== 'string') {
    console.warn('[JWT] Invalid token: not a string');
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    console.warn('[JWT] Invalid token: wrong number of parts');
    return null;
  }

  try {
    // Decode the payload (second part)
    const payloadBase64 = parts[1]!;
    // Handle URL-safe base64
    const payloadBase64Standard = payloadBase64
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const payloadJson = atob(payloadBase64Standard);
    const payload = JSON.parse(payloadJson);

    // Validate required fields
    if (typeof payload.uid !== 'number') {
      console.warn('[JWT] Invalid token: missing or invalid uid');
      return null;
    }

    // Check expiration if present
    if (payload.exp && typeof payload.exp === 'number') {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        console.warn('[JWT] Token has expired');
        return null;
      }
    }

    return payload as JWTPayload;
  } catch (error) {
    console.error('[JWT] Failed to decode token:', error);
    return null;
  }
}

/**
 * Get the current user ID from the stored JWT
 * @returns The user ID or null if not available
 */
export function getCurrentUserId(): number | null {
  const jwt = localStorage.getItem('jwt');
  if (!jwt) {
    return null;
  }

  const payload = decodeJWT(jwt);
  return payload?.uid ?? null;
}

/**
 * Check if the stored JWT is expired
 * @returns true if expired or invalid, false if valid
 */
export function isJWTExpired(): boolean {
  const jwt = localStorage.getItem('jwt');
  if (!jwt) {
    return true;
  }

  const payload = decodeJWT(jwt);
  if (!payload) {
    return true;
  }

  if (payload.exp && typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  }

  // No expiration means not expired
  return false;
}

/**
 * Extract tokens from URL hash (for OAuth callback)
 * Tokens in hash are not sent to server in logs
 * @returns Object with jwt and refresh tokens, or null if not present
 */
export function extractTokensFromHash(): { jwt: string; refresh: string } | null {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) {
    return null;
  }

  const params = new URLSearchParams(hash.substring(1));
  const jwt = params.get('jwt');
  const refresh = params.get('refresh');

  if (!jwt) {
    return null;
  }

  // Clear the hash from URL to prevent token exposure
  history.replaceState(null, '', window.location.pathname + window.location.search);

  return { jwt, refresh: refresh || '' };
}

export default {
  decodeJWT,
  getCurrentUserId,
  isJWTExpired,
  extractTokensFromHash,
};
