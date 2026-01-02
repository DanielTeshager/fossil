// --- IndexedDB Storage Service ---
// Provides unlimited storage with localStorage fallback

const DB_NAME = 'fossil-vault';
const DB_VERSION = 1;
const STORE_NAME = 'data';

let db = null;

/**
 * Initialize IndexedDB
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported, falling back to localStorage');
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      resolve(null); // Fall back to localStorage
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

/**
 * Save data to IndexedDB
 */
export const saveToIDB = async (key, data) => {
  if (!db) {
    // Fall back to localStorage
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('localStorage save failed:', e);
      return false;
    }
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id: key, data, updatedAt: Date.now() });

      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        console.error('IDB save error:', request.error);
        // Fall back to localStorage
        try {
          localStorage.setItem(key, JSON.stringify(data));
          resolve(true);
        } catch (e) {
          resolve(false);
        }
      };
    } catch (e) {
      console.error('IDB transaction error:', e);
      resolve(false);
    }
  });
};

/**
 * Load data from IndexedDB
 */
export const loadFromIDB = async (key) => {
  if (!db) {
    // Fall back to localStorage
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('localStorage load failed:', e);
      return null;
    }
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.data || null);
      };
      request.onerror = () => {
        console.error('IDB load error:', request.error);
        // Fall back to localStorage
        try {
          const data = localStorage.getItem(key);
          resolve(data ? JSON.parse(data) : null);
        } catch (e) {
          resolve(null);
        }
      };
    } catch (e) {
      console.error('IDB transaction error:', e);
      resolve(null);
    }
  });
};

/**
 * Migrate data from localStorage to IndexedDB
 */
export const migrateToIDB = async (key) => {
  if (!db) return false;

  try {
    const localData = localStorage.getItem(key);
    if (localData) {
      const parsed = JSON.parse(localData);
      await saveToIDB(key, parsed);
      // Keep localStorage as backup for now
      console.log('Migrated data to IndexedDB');
      return true;
    }
  } catch (e) {
    console.error('Migration failed:', e);
  }
  return false;
};

/**
 * Get storage info
 */
export const getStorageInfo = async () => {
  const info = {
    indexedDB: !!db,
    localStorageUsed: 0,
    localStorageQuota: 5 * 1024 * 1024, // ~5MB
  };

  try {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length * 2; // UTF-16
      }
    }
    info.localStorageUsed = total;
  } catch (e) {
    // Ignore
  }

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      info.indexedDBQuota = estimate.quota;
      info.indexedDBUsed = estimate.usage;
    } catch (e) {
      // Ignore
    }
  }

  return info;
};
