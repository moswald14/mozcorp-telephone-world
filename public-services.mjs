import { createBrowserWorkspace } from './public-workspace.mjs';
import { caseRules } from './public-rooms.mjs';

const databaseName = 'mozcorp-public-services-v1';
const storeName = 'workspace';
let database;
let workspace;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('This browser cannot keep savepoints or proposals.'));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error('Browser workspace storage could not open.'));
  });
  return database;
}

async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    let failure;
    const read = store.get('current');
    read.onsuccess = () => {
      try {
        result = action(read.result, next => store.put(next, 'current'));
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Browser storage could not save the workspace. It kept the last saved copy.'));
  });
}

export function requestPublicService(path, method, body) {
  const services = { cloud: 'cloud', hope: 'hope', upgrades: 'upgrade' };
  if (!Object.hasOwn(services, path) || !['GET', 'POST'].includes(method)) {
    throw new Error('This service is available on your own Keeper.');
  }
  workspace ??= createBrowserWorkspace({ transaction, getCaseRules: () => caseRules });
  const operation = services[path] + (method === 'GET' ? 'Read' : 'Write');
  return workspace[operation](body);
}
