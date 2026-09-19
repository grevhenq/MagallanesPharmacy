// ============================================================
// IndexedDB repository. Single entry point for all persistence.
// ============================================================
const DB_NAME = 'magallanes_pharmacy';
const DB_VER  = 1;

const SCHEMA = {
  meta:            { kp:'key', idx:[] },
  users:           { kp:'id',  idx:['username'] },
  doctors:         { kp:'id',  idx:['prc'] },
  categories:      { kp:'id',  idx:[] },
  suppliers:       { kp:'id',  idx:[] },
  locations:       { kp:'id',  idx:[] },
  products:        { kp:'id',  idx:['barcode','sku','category_id','supplier_id','location_id','status'] },
  batches:         { kp:'id',  idx:['product_id','expiry'] },
  sales:           { kp:'id',  idx:['transaction_number','receipt_number','transaction_date','status'] },
  sale_items:      { kp:'id',  idx:['sale_id','product_id'] },
  receipts:        { kp:'id',  idx:['receipt_number','sale_id'] },
  movements:       { kp:'id',  idx:['product_id','created_at','movement_type'] },
  purchase_orders: { kp:'id',  idx:['po_number','supplier_id','status'] },
  po_items:        { kp:'id',  idx:['purchase_order_id','product_id'] },
  audit:           { kp:'id',  idx:['at'] }
};

export const TABLES = Object.keys(SCHEMA);

let _db = null;

export function initDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, def] of Object.entries(SCHEMA)){
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: def.kp });
        def.idx.forEach(f => os.createIndex(f, f, { unique:false }));
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

function tx(stores, mode){
  return _db.transaction(Array.isArray(stores) ? stores : [stores], mode);
}
function promisify(req){
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

export const Repo = {
  all:    (store) => promisify(tx(store,'readonly').objectStore(store).getAll()),
  get:    (store, key) => promisify(tx(store,'readonly').objectStore(store).get(key)),
  put:    async (store, obj) => { await promisify(tx(store,'readwrite').objectStore(store).put(obj)); return obj; },
  del:    async (store, key) => { await promisify(tx(store,'readwrite').objectStore(store).delete(key)); },
  clear:  async (store) => { await promisify(tx(store,'readwrite').objectStore(store).clear()); },
  putMany: (store, arr) => {
    const t = tx(store,'readwrite');
    const os = t.objectStore(store);
    arr.forEach(o => os.put(o));
    return new Promise((res, rej) => {
      t.oncomplete = () => res(arr);
      t.onerror = () => rej(t.error);
    });
  },
  batch: (stores, fn) => {
    const t = tx(stores, 'readwrite');
    const map = {};
    stores.forEach(s => map[s] = t.objectStore(s));
    fn(map);
    return new Promise((res, rej) => {
      t.oncomplete = () => res(true);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('aborted'));
    });
  }
};

// In-memory mirror of all tables. Dataset is small enough to hold
// entirely, which keeps search and analytics instant.
export const S = {};

export async function loadAll(){
  for (const t of TABLES) S[t] = await Repo.all(t);
  S.settings = (await Repo.get('meta','settings'))?.value || null;
}

export async function saveSettings(){
  await Repo.put('meta', { key:'settings', value: S.settings });
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2,10));