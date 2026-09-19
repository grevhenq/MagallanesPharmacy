// ============================================================
// First-run seeding. Users, categories, doctors and a demo
// catalogue are created if the database is empty. Everything
// is tagged demo:true so Settings can remove it later.
// ============================================================
import { S, Repo, loadAll, saveSettings, uid } from './db.js';
import { hashPw } from './auth.js';

export const DEFAULT_SETTINGS = () => ({
  pharmacy: {
    name: 'MAGALLANES PHARMACY',
    tagline: 'Your Health, Our Priority.',
    address: 'Magallanes St., Poblacion, San Pedro, Laguna',
    phone: '(049) 000-0000',
    mobile: '0917 000 0000',
    email: 'magallanespharmacy@example.com',
    tin: '000-000-000-000',
    permit: 'FDA LTO No. —'
  },
  vat: { rate: 12, inclusive: true, show: true },
  receipt: {
    width: '57',
    footer: 'Thank you for choosing Magallanes Pharmacy.',
    note: 'This acknowledgement receipt is not a BIR-registered Official Receipt.'
  },
  counters: { txn:0, receipt:0, po:0, adj:0, rx:0 },
  seeded: false
});

const USERS = [
  ['Ana Magallanes', 'admin',     'admin123',     'Administrator'],
  ['Rina Bautista',  'cashier',   'cashier123',   'Cashier'],
  ['Marco Aguilar',  'inventory', 'inventory123', 'Inventory Staff'],
  ['Elena Reyes',    'manager',   'manager123',   'Manager']
];

const CATEGORIES = [
  ['Prescription Drugs',     'Requires a valid prescription', true],
  ['OTC Medicines',          'Over-the-counter remedies',     true],
  ['Vitamins & Supplements', 'Multivitamins, minerals',       true],
  ['Personal Care',          'Hygiene and everyday care',     false],
  ['Medical Supplies',       'Consumables and devices',       false],
  ['First Aid',              'Wound care',                    false],
  ['Baby Care',              'Infant and child products',     false]
];

const LOCATIONS = [
  ['A1','Shelf A1 — Analgesics'], ['A2','Shelf A2 — Cough & Colds'],
  ['A3','Shelf A3 — Antibiotics'], ['A4','Shelf A4 — Gastro'],
  ['B1','Shelf B1 — Maintenance'], ['B2','Shelf B2 — Vitamins'],
  ['C1','Shelf C1 — Personal Care'], ['REF1','Refrigerator 1'],
  ['CTR','Counter'], ['CAB','Medicine Cabinet'], ['STR','Storage Room']
];

const SUPPLIERS = [
  ['Medisource Distribution Inc.', 'Ana Villanueva', '(02) 8555-0142'],
  ['Luzon Pharma Supply',          'Ramon Dela Cruz','(049) 502-7781'],
  ['Wellcare Generics Corp.',      'Joy Santiago',   '(02) 8721-0055'],
  ['Southgate Medical Trading',    'Eric Lim',       '0918 445 2210']
];

const DOCTORS = [
  ['Dr. Juan Santos',  '0123456', 'Internal Medicine'],
  ['Dr. Maria Reyes',  '0234567', 'Pediatrics'],
  ['Dr. Antonio Lim',  '0345678', 'Cardiology'],
  ['Dr. Carmen Dizon', '0456789', 'Family Medicine']
];

// name, generic, brand, catIdx, unit, cost, price, rx, locIdx, supIdx, min, reorder, max
const PRODUCTS = [
  ['Biogesic 500mg Tablet','Paracetamol','Biogesic',1,'tablet',2.40,4.00,0,0,0,40,120,600],
  ['Alaxan FR Capsule','Ibuprofen + Paracetamol','Alaxan',1,'capsule',5.10,8.00,0,0,0,30,80,400],
  ['Neozep Forte Tablet','Phenylephrine + Chlorphenamine','Neozep',1,'tablet',5.00,7.50,0,1,0,40,100,500],
  ['Bioflu Tablet','Phenylephrine + Chlorphenamine','Bioflu',1,'tablet',6.20,9.00,0,1,0,40,100,500],
  ['Solmux 500mg Capsule','Carbocisteine','Solmux',1,'capsule',7.40,11.00,0,1,0,30,80,400],
  ['Cetirizine 10mg Tablet','Cetirizine','Virlix',1,'tablet',9.00,14.00,0,1,2,20,60,300],
  ['Amoxicillin 500mg Capsule','Amoxicillin','Amoxil',0,'capsule',6.80,10.50,1,2,2,50,150,700],
  ['Co-Amoxiclav 625mg Tablet','Amoxicillin + Clavulanic Acid','Augmentin',0,'tablet',48.00,66.00,1,2,0,20,50,200],
  ['Cefalexin 500mg Capsule','Cefalexin','Ceporex',0,'capsule',12.50,18.00,1,2,2,30,80,300],
  ['Azithromycin 500mg Tablet','Azithromycin','Zithromax',0,'tablet',85.00,118.00,1,9,0,9,24,80],
  ['Losartan 50mg Tablet','Losartan Potassium','Lifezar',0,'tablet',9.20,14.00,1,4,2,40,120,600],
  ['Amlodipine 5mg Tablet','Amlodipine Besilate','Norvasc',0,'tablet',10.40,15.50,1,4,2,40,120,600],
  ['Metformin 500mg Tablet','Metformin HCl','Glucophage',0,'tablet',5.60,8.50,1,4,0,50,150,700],
  ['Atorvastatin 20mg Tablet','Atorvastatin Calcium','Lipitor',0,'tablet',18.00,26.00,1,4,0,30,80,300],
  ['Omeprazole 20mg Capsule','Omeprazole','Losec',0,'capsule',11.00,16.50,1,3,2,25,70,300],
  ['Kremil-S Advance Tablet','Aluminium + Magnesium','Kremil-S',1,'tablet',7.80,11.50,0,3,0,30,80,400],
  ['Diatabs Capsule','Loperamide HCl','Diatabs',1,'capsule',7.00,10.00,0,3,0,20,60,300],
  ['Hydrite Oral Rehydration','Oral Rehydration Salts','Hydrite',1,'sachet',9.50,14.00,0,3,1,20,50,200],
  ['Salbutamol Nebule 2.5mg','Salbutamol Sulfate','Ventolin',0,'nebule',18.50,26.00,1,9,0,20,50,200],
  ['Enervon Multivitamins Tablet','Multivitamins + Vitamin C','Enervon',2,'tablet',7.20,10.50,0,5,1,40,120,600],
  ['Poten-Cee 500mg Capsule','Ascorbic Acid','Poten-Cee',2,'capsule',5.40,8.00,0,5,1,50,140,700],
  ['Ferrous Sulfate + Folic Acid','Ferrous Sulfate + Folic Acid','Hemarate',2,'tablet',6.00,9.00,0,5,2,30,90,400],
  ['Calcium + Vitamin D3 Tablet','Calcium Carbonate','Caltrate',2,'tablet',14.00,20.00,0,5,1,20,60,250],
  ['Human Insulin 100IU/ml Vial','Insulin Human','Humulin N',0,'vial',480.00,625.00,1,7,0,3,8,25],
  ['Isopropyl Alcohol 70% 500ml','Isopropyl Alcohol','Green Cross',3,'bottle',62.00,89.00,0,6,3,10,25,100],
  ['Povidone-Iodine 10% 60ml','Povidone-Iodine','Betadine',5,'bottle',98.00,135.00,0,6,3,6,15,60],
  ['Adhesive Bandage Strips (100s)','Adhesive Bandage','Band-Aid',5,'box',140.00,195.00,0,6,3,4,10,40],
  ['Sterile Gauze Pad 4x4 (10s)','Gauze Pad','Medisafe',4,'pack',38.00,55.00,0,6,3,8,20,80],
  ['Disposable Face Mask (50s)','Surgical Face Mask','Medisafe',4,'box',95.00,140.00,0,8,3,6,15,60],
  ['Digital Thermometer','Digital Thermometer','Omron',4,'piece',210.00,299.00,0,8,3,3,8,25],
  ['Disposable Syringe 3cc (100s)','Syringe','Terumo',4,'box',320.00,430.00,0,10,3,2,6,20],
  ['Efficascent Oil 100ml','Methyl Salicylate','Efficascent',1,'bottle',88.00,122.00,0,8,1,6,15,60]
];

export async function seedIfEmpty(){
  await loadAll();

  if (!S.settings){
    S.settings = DEFAULT_SETTINGS();
    await saveSettings();
  }
  if (!S.users?.length){
    await seedUsers();
    await loadAll();
  }
  if (!S.settings.seeded && !S.products?.length){
    await seedDemo();
    await loadAll();
  }
}

async function seedUsers(){
  const users = [];
  for (const [name, username, pw, role] of USERS){
    const salt = uid().slice(0,12);
    users.push({
      id: uid(), name, username,
      pass_salt: salt,
      pass_hash: await hashPw(pw, salt),
      role, status:'active',
      created_at: new Date().toISOString(),
      demo:true
    });
  }
  await Repo.putMany('users', users);
}

async function seedDemo(){
  const now = new Date();
  const cats = CATEGORIES.map(([name, description, seniorEligible]) => ({
    id: uid(), name, description, senior_eligible: seniorEligible, demo:true
  }));
  const locs = LOCATIONS.map(([code, label]) => ({
    id: uid(), location_code: code, location_name: label, description:'', demo:true
  }));
  const sups = SUPPLIERS.map(([name, contact, phone]) => ({
    id: uid(), name, contact_person: contact, phone, email:'',
    address:'', payment_terms:'', tax_info:'', notes:'', demo:true
  }));
  const docs = DOCTORS.map(([full_name, prc, specialty]) => ({
    id: uid(), full_name, prc, specialty,
    phone:'', email:'', clinic:'', demo:true
  }));

  const products = [], batches = [];
  PRODUCTS.forEach((r, i) => {
    const [name, generic, brand, ci, unit, cost, price, rx, li, si, min, reorder, max] = r;
    const id = uid();
    let stock;
    if (i % 11 === 3) stock = 0;
    else if (i % 11 === 5) stock = Math.max(1, Math.floor(min * 0.6));
    else if (i % 7 === 2) stock = Math.floor(reorder * 0.8);
    else stock = Math.floor(reorder * (1.6 + (i % 5) * 0.4));

    products.push({
      id,
      barcode: '480' + String(1234000 + i * 137).padStart(7,'0'),
      sku: name.slice(0,6).toUpperCase().replace(/[^A-Z0-9]/g,'') + '-' + String(i+1).padStart(3,'0'),
      name, generic_name: generic, brand,
      category_id: cats[ci].id, supplier_id: sups[si].id, location_id: locs[li].id,
      unit, cost_price: cost, selling_price: price, discount_price: 0,
      minimum_stock: min, reorder_point: reorder, maximum_stock: max,
      current_stock: stock, rx_required: !!rx, temp_sensitive: false,
      senior_eligible: !!cats[ci].senior_eligible,
      storage_req: 'Store below 30°C, away from sunlight.',
      description: '', status: 'active',
      created_at: now.toISOString(), updated_at: now.toISOString(), demo: true
    });

    if (stock > 0){
      const expDays = 300 + (i % 6) * 40;
      batches.push({
        id: uid(), product_id: id,
        lot_no: 'L' + String(2400 + i).padStart(4,'0'),
        expiry: new Date(now.getTime() + expDays * 86400000).toISOString().slice(0,10),
        qty: stock, cost_price: cost,
        received_at: new Date(now.getTime() - 600000000).toISOString(),
        po_id: null, demo: true
      });
    }
  });

  await Repo.putMany('categories', cats);
  await Repo.putMany('locations', locs);
  await Repo.putMany('suppliers', sups);
  await Repo.putMany('doctors', docs);
  await Repo.putMany('products', products);
  await Repo.putMany('batches', batches);

  S.settings.seeded = true;
  await saveSettings();
}
