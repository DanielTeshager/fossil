// --- Export & Import Functions ---

import { getDayKey } from './helpers.js';

/**
 * Export full vault data as JSON
 */
export const exportVaultJSON = (data) => {
  const exportData = {
    version: '2.2.0',
    exportedAt: new Date().toISOString(),
    ...data
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fossil-vault-${getDayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Validate imported data structure
 */
export const validateImportData = (data) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON structure' };
  }
  if (!Array.isArray(data.fossils)) {
    return { valid: false, error: 'Missing fossils array' };
  }
  if (!Array.isArray(data.kernels)) {
    return { valid: false, error: 'Missing kernels array' };
  }

  // Basic fossil validation
  for (const fossil of data.fossils) {
    if (!fossil.id || !fossil.invariant) {
      return { valid: false, error: 'Invalid fossil structure (missing id or invariant)' };
    }
  }

  return { valid: true };
};
