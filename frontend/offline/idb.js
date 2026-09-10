(function attachOfflineDatabase(scope) {
  const DB_NAME = 'lmpc-offline';
  const DB_VERSION = 1;
  const STORE_NAME = 'pending_scans';
  const UNSYNCED_STATUSES = new Set(['pending', 'syncing', 'failed']);
  const CLAIMABLE_STATUSES = new Set(['pending', 'failed']);
  let databasePromise;

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error('IndexedDB transaction failed.'));
      transaction.onabort = () =>
        reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    });
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    if (!('indexedDB' in scope)) {
      return Promise.reject(new Error('IndexedDB is not supported in this browser.'));
    }

    databasePromise = new Promise((resolve, reject) => {
      const request = scope.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'local_id' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error || new Error('Unable to open the offline scan database.'));
      };
      request.onblocked = () => {
        databasePromise = undefined;
        reject(new Error('Offline scan database upgrade is blocked by another tab.'));
      };
    });
    return databasePromise;
  }

  async function putRecord(record) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
    return record;
  }

  async function getAllRecords() {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    await transactionDone(transaction);
    return records;
  }

  async function countUnsyncedRecords() {
    const records = await getAllRecords();
    return records.filter((record) => UNSYNCED_STATUSES.has(record.sync_status)).length;
  }

  async function requeueSyncingRecords() {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.value.sync_status === 'syncing') {
        cursor.update({ ...cursor.value, sync_status: 'pending' });
      }
      cursor.continue();
    };
    await transactionDone(transaction);
  }

  async function claimNextRecord(excludedLocalIds = []) {
    const excluded = new Set(excludedLocalIds);
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let claimed = null;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || claimed) return;
      const record = cursor.value;
      if (CLAIMABLE_STATUSES.has(record.sync_status) && !excluded.has(record.local_id)) {
        claimed = {
          ...record,
          sync_status: 'syncing',
          sync_attempts: Number(record.sync_attempts || 0) + 1,
        };
        cursor.update(claimed);
        return;
      }
      cursor.continue();
    };
    await transactionDone(transaction);
    return claimed;
  }

  async function setRecordStatus(localId, syncStatus) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record = await requestResult(store.get(localId));
    if (!record) {
      transaction.abort();
      throw new Error(`Pending scan ${localId} no longer exists.`);
    }
    store.put({ ...record, sync_status: syncStatus });
    await transactionDone(transaction);
  }

  scope.LMPCOfflineDb = Object.freeze({
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    openDatabase,
    putRecord,
    getAllRecords,
    countUnsyncedRecords,
    requeueSyncingRecords,
    claimNextRecord,
    setRecordStatus,
  });
})(globalThis);
