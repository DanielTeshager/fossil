// --- Basic Helper Functions ---

/**
 * Generate a unique ID using crypto.randomUUID or fallback
 */
export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
};

/**
 * Get ISO date string for a given date (YYYY-MM-DD)
 */
export const getDayKey = (d = new Date()) => {
  try {
    return d.toISOString().split('T')[0];
  } catch (e) {
    return "0000-00-00";
  }
};

/**
 * Validate if a string is a valid URL
 */
export const isValidUrl = (s) => {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

/**
 * Simple string hash for cache keys
 */
export const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};
