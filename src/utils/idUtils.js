// src/utils/idUtils.js

/**
 * Generiert eine eindeutige ID mit gegebenem Prefix.
 * Beispiel: generateId("goal") → "goal_1730000000000_a1b2c3"
 * @param {string} prefix - Prefix der ID (z.B. "goal", "rec", "pot")
 * @returns {string}
 */
export function generateId(prefix = "id") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}
