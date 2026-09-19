// ============================================================
// Magallanes Pharmacy — main app. Coordinates POS, inventory,
// products, analytics, receipts and settings.
// ============================================================
import { S, Repo, loadAll, saveSettings, uid } from './db.js';
import { computeTotals, round2 } from './calc.js';
import { receiptHTML, printReceipt, printDocument } from './receipt.js';
import { currentUser, logout, can, audit, ROLE_PERMS } from './auth.js';

// --- boot ---
import { askPassword } from './prompt.js';
import { audit, can, setLastActor } from './auth.js';

await loadAll();

document.getElementById('app').hidden = false;
document.getElementById('lastUser').textContent = 'No action yet';
document.getElementById('lastRole').textContent = 'Actions will ask for a password';

// --- nav ---
const NAV = [
  { key:'pos',       label:'Point of Sale', ic:'🛒', perm:'pos' },
  { key:'products',  label:'Products',      ic:'📦', perm:'products.view' },
  { key:'inventory', label:'Inventory',     ic:'📋', perm:'inventory' },
  { key:'analytics', label:'Analytics',     ic:'📊', perm:'analytics' },
  { key:'receipts',  label:'Receipts',      ic:'🧾', perm:'receipts' },
  { key:'settings',  label:'Settings',      ic:'⚙',  perm:'*' }
];

const PAGE_TITLES = {
  pos:       ['Point of Sale', 'Scan, search, and ring up a sale'],
  products:  ['Products',      'Catalogue, pricing, shelf location'],
  inventory: ['Inventory',     'Stock levels and movements'],
  analytics: ['Sales Analytics','Trends across products and payments'],
  receipts:  ['Receipts',      'Every transaction on record'],
  settings:  ['Settings',      'Pharmacy details, staff, doctors, data']
};

const nav = document.getElementById('nav');
nav.innerHTML = NAV.filter(n => n.perm === '*' || can(ME, n.perm))
  .map(n => `<button data-page="${n.key}"><span>${n.ic}</span>${n.label}</button>`)
  .join('');

nav.querySelectorAll('button').forEach(b => {
  b.onclick = () => go(b.dataset.page);
});

document.getElementById('usersBtn').onclick = () => staffPanel();
document.getElementById('themeBtn').onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('mp_theme', next); } catch {}
};
try {
  const th = localStorage.getItem('mp_theme');
  if (th) document.documentElement.setAttribute('data-theme', th);
} catch {}

// --- view router ---
let CURRENT = null;

function go(key){
  CURRENT = key;
  document.querySelectorAll('.view').forEach(v => v.hidden = true);
  const view = document.getElementById('view-' + key);
  if (view) view.hidden = false;
  nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.page === key));
  const [t, s] = PAGE_TITLES[key] || [key, ''];
  document.getElementById('pageTitle').textContent = t;
  document.getElementById('pageSub').textContent = s;
  if (VIEWS[key]) VIEWS[key]();
  window.scrollTo(0,0);
}

// --- clock ---
setInterval(() => {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleDateString('en-PH', { weekday:'short', day:'2-digit', month:'short' }) +
    ' · ' +
    now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}, 1000);

// ============================================================
// POS
// ============================================================
const CART = {
  lines: [], payment:'Cash', ref:'', customer:'',
  customerType:'regular', idType:'', idNumber:'', tendered:''
};
let POS_FILTER = { q:'', cat:'' };

const VIEWS = {};

VIEWS.pos = () => {
  const cats = S.categories || [];
  document.getElementById('view-pos').innerHTML = `
    <div class="pos">
      <section>
        <div class="scan-bar">
          <span class="lbl">Barcode</span>
          <input id="posBarcode" placeholder="Scan or type a barcode, then Enter" autocomplete="off">
        </div>
        <div class="search-wrap">
          <span class="mag">⌕</span>
          <input id="posSearch" placeholder="Find by product, generic, brand or SKU" autocomplete="off">
          <div class="suggestions" id="posSugg" hidden></div>
        </div>
        <div class="cat-filter">
          <button data-cat="" class="${POS_FILTER.cat===''?'active':''}">All</button>
          ${cats.map(c => `<button data-cat="${c.id}" class="${POS_FILTER.cat===c.id?'active':''}">${esc(c.name)}</button>`).join('')}
        </div>
        <div class="product-grid" id="posGrid"></div>
      </section>
      <aside class="cart">
        <div class="cart-head">
          <h3>Current sale</h3>
          <span class="chip neutral" id="cartCount">0 items</span>
          <button class="btn btn-sm btn-ghost" id="cartClear">Clear</button>
        </div>
        <div class="cart-items" id="cartItems"></div>
        <div class="cart-totals" id="cartTotals"></div>
      </aside>
    </div>`;

  document.getElementById('posSearch').oninput = e => {
    POS_FILTER.q = e.target.value;
    drawSuggestions();
    drawGrid();
  };
  document.getElementById('posBarcode').onkeydown = e => {
    if (e.key === 'Enter'){
      e.preventDefault();
      handleBarcode(e.target.value);
      e.target.value = '';
    }
  };
  document.querySelectorAll('#view-pos [data-cat]').forEach(b => {
    b.onclick = () => { POS_FILTER.cat = b.dataset.cat; VIEWS.pos(); };
  });
  document.getElementById('cartClear').onclick = clearCart;
  drawGrid();
  drawCart();
  setTimeout(() => document.getElementById('posBarcode')?.focus(), 40);
};

function drawGrid(){
  const grid = document.getElementById('posGrid');
  if (!grid) return;
  let list = searchProducts(POS_FILTER.q);
  if (POS_FILTER.cat) list = list.filter(p => p.category_id === POS_FILTER.cat);
  list = list.slice(0, 48);
  if (!list.length){
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">Nothing matches</div>Try a shorter term or scan the barcode.</div>`;
    return;
  }
  grid.innerHTML = list.map(p => {
    const stock = Number(p.current_stock) || 0;
    return `<button class="product-card" data-add="${p.id}" ${stock <= 0 ? 'disabled' : ''}>
      <div class="pc-name">${esc(p.name)}</div>
      <div class="pc-generic">${esc(p.generic_name || '')}</div>
      <div class="pc-foot">
        <span class="pc-price">${peso(p.selling_price)}</span>
        <span class="chip ${stock <= 0 ? 'bad' : stock <= (p.reorder_point||0) ? 'warn' : 'ok'}" style="margin-left:auto">
          ${stock} ${esc(p.unit)}
        </span>
      </div>
      ${p.rx_required ? '<div style="margin-top:5px"><span class="chip rx">Rx</span></div>' : ''}
    </button>`;
  }).join('');
  grid.querySelectorAll('[data-add]').forEach(b => {
    b.onclick = () => addToCart(b.dataset.add, 1);
  });
}

function searchProducts(q){
  const term = q.trim().toLowerCase();
  let list = (S.products || []).filter(p => p.status === 'active');
  if (!term) return list.slice(0, 60);
  return list.filter(p => {
    const hay = `${p.name} ${p.generic_name} ${p.brand} ${p.sku} ${p.barcode}`.toLowerCase();
    return term.split(/\s+/).every(w => hay.includes(w));
  }).slice(0, 60);
}

function drawSuggestions(){
  const box = document.getElementById('posSugg');
  if (!box) return;
  const q = POS_FILTER.q.trim();
  if (q.length < 2){ box.hidden = true; return; }
  const list = searchProducts(q).slice(0, 8);
  if (!list.length){ box.hidden = true; return; }
  box.innerHTML = list.map(p => `
    <div class="suggestion" data-pick="${p.id}">
      <div style="flex:1;min-width:0">
        <div class="nm">${esc(p.name)}</div>
        <div class="meta">${esc(p.generic_name||'')} · ${esc(p.sku)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:600">${peso(p.selling_price)}</div>
        <div class="meta">${p.current_stock} ${esc(p.unit)}</div>
      </div>
    </div>`).join('');
  box.hidden = false;
  box.querySelectorAll('[data-pick]').forEach(el => {
    el.onmousedown = e => { e.preventDefault(); addToCart(el.dataset.pick, 1); };
  });
}

function handleBarcode(raw){
  const code = String(raw || '').trim();
  if (!code) return;
  const p = (S.products || []).find(x => x.barcode === code && x.status === 'active')
         || (S.products || []).find(x => x.sku.toLowerCase() === code.toLowerCase() && x.status === 'active');
  if (!p){ toast(`No product carries the code ${code}`, 'bad'); return; }
  addToCart(p.id, 1, { flash: true });
}

async function addToCart(pid, qty, opts = {}){
  const p = (S.products || []).find(x => x.id === pid);
  if (!p) return;
  if (Number(p.current_stock) <= 0){ toast(`${p.name} is out of stock.`, 'bad'); return; }
  const existing = CART.lines.find(l => l.product_id === pid);
  const wanted = (existing ? existing.qty : 0) + qty;
  if (wanted > Number(p.current_stock)){
    toast(`Only ${p.current_stock} ${p.unit} on hand.`, 'warn');
    return;
  }

  if (p.rx_required && !existing){
    const rx = await rxPrompt(p);
    if (!rx) return;
    CART.lines.push({ ...makeLine(p, qty), rx });
  } else if (existing){
    existing.qty = wanted;
  } else {
    CART.lines.push(makeLine(p, qty));
  }

  POS_FILTER.q = '';
  document.getElementById('posSearch').value = '';
  document.getElementById('posSugg').hidden = true;
  drawGrid();
  drawCart(opts.flash ? pid : null);
}

async function voidTransaction(saleId){
  const actor = await askPassword({
    title: 'Void transaction',
    role: 'Administrator',   // ← only admins can void
    reason: `Voiding <b>${saleId}</b> returns all items to stock. Administrator only.`
  });
  if (!actor) return;

const actor = await askPassword({
  title: 'Adjust stock',
  reason: `Change stock for <b>${product.name}</b>.`
});

const actor = await askPassword({
  title: 'Create purchase order',
  reason: `New order for <b>${supplierName}</b>.`
});

const actor = await askPassword({
  title: 'Wipe all data',
  role: 'Administrator',
  reason: 'This erases every product, sale, receipt and setting. Administrator only.'
});

  // ...do the void...
  audit('Voided transaction', saleId, actor);
}

function makeLine(p, qty){
  return {
    product_id: p.id, name: p.name, generic_name: p.generic_name,
    sku: p.sku, unit: p.unit, unit_price: Number(p.selling_price),
    qty, discount: 0, rx_required: !!p.rx_required,
    seniorOverride: undefined
  };
}

async function rxPrompt(p){
  return new Promise(resolve => {
    const m = modal({
      title: 'Prescription details required',
      body: `
        <div class="chip warn" style="display:block;padding:10px 14px;margin-bottom:14px">
          <b>${esc(p.name)}</b> may not be dispensed without a valid prescription.
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          <label class="field"><span>Patient name *</span><input id="rxPatient" placeholder="Full name"></label>
          <label class="field"><span>Rx number *</span><input id="rxNo" class="mono" value="RX-${String((S.settings.counters.rx||0)+1).padStart(6,'0')}"></label>
          <label class="field"><span>Prescription date</span><input id="rxDate" type="date" value="${today()}"></label>
          <label class="field"><span>Doctor's name *</span><input id="rxDoc" list="rxDocList" placeholder="Dr. Juan Santos"></label>
          <label class="field"><span>PRC licence *</span><input id="rxLic" class="mono" list="rxLicList" placeholder="0123456"></label>
          <label class="field"><span>Specialty</span><input id="rxSpec" placeholder="Optional"></label>
        </div>
        <datalist id="rxDocList">${(S.doctors||[]).map(d => `<option value="${esc(d.full_name)}">`).join('')}</datalist>
        <datalist id="rxLicList">${(S.doctors||[]).map(d => `<option value="${esc(d.prc)}">`).join('')}</datalist>
        <p id="rxErr" class="error"></p>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rxOk">Record and add</button>`,
      onClose: () => resolve(null),
      onOpen: (root, close) => {
        const g = id => root.querySelector('#' + id);
        g('rxDoc').oninput = () => {
          const d = (S.doctors||[]).find(x => x.full_name.toLowerCase() === g('rxDoc').value.trim().toLowerCase());
          if (d){ g('rxLic').value = d.prc || ''; g('rxSpec').value = d.specialty || ''; }
        };
        g('rxLic').oninput = () => {
          const d = (S.doctors||[]).find(x => String(x.prc) === g('rxLic').value.trim());
          if (d){ g('rxDoc').value = d.full_name; g('rxSpec').value = d.specialty || ''; }
        };
        g('rxOk').onclick = async () => {
          const patient = g('rxPatient').value.trim();
          const rxNo = g('rxNo').value.trim();
          const doc = g('rxDoc').value.trim();
          const lic = g('rxLic').value.trim();
          const spec = g('rxSpec').value.trim();
          const date = g('rxDate').value || today();
          const errs = [];
          if (!patient) errs.push('Patient name is required.');
          if (!rxNo) errs.push('Rx number is required.');
          if (!doc) errs.push('Doctor name is required.');
          if (!lic) errs.push('PRC licence is required.');
          if (errs.length){ g('rxErr').textContent = errs.join(' '); return; }

          let doctorId = null;
          const existing = (S.doctors||[]).find(x => String(x.prc) === lic)
                        || (S.doctors||[]).find(x => x.full_name.toLowerCase() === doc.toLowerCase());
          if (existing){
            doctorId = existing.id;
            const up = { ...existing, full_name: doc, prc: lic };
            if (spec) up.specialty = spec;
            await Repo.put('doctors', up);
            S.doctors[S.doctors.findIndex(x => x.id === up.id)] = up;
          } else {
            const newDoc = { id: uid(), full_name: doc, prc: lic, specialty: spec,
              phone:'', email:'', clinic:'', created_at: new Date().toISOString(), demo:false };
            await Repo.put('doctors', newDoc);
            S.doctors.push(newDoc);
            doctorId = newDoc.id;
          }
          S.settings.counters.rx = (S.settings.counters.rx || 0) + 1;
          await saveSettings();

          close();
          resolve({
            patient_name: patient,
            rx_number: rxNo,
            rx_date: date,
            doctor_id: doctorId,
            doctor_name: doc,
            doctor_prc: lic,
            doctor_specialty: spec
          });
        };
      }
    });
  });
}

function drawCart(flashId){
  const box = document.getElementById('cartItems');
  if (!box) return;
  const totalQty = CART.lines.reduce((a,l) => a + l.qty, 0);
  document.getElementById('cartCount').textContent = `${totalQty} item${totalQty===1?'':'s'}`;

  if (!CART.lines.length){
    box.innerHTML = `<div class="empty"><div class="big">Cart is empty</div>Scan or search to begin.</div>`;
    drawTotals();
    return;
  }

  const t = cartTotals();
  const eligible = t.customer_type === 'senior' || t.customer_type === 'pwd';

  box.innerHTML = CART.lines.map((l, i) => {
    const row = t.items[i] || {};
    const isElig = eligible && row.senior_eligible;
    return `<div class="cart-line ${flashId===l.product_id?'flash':''}">
      <div class="cl-top">
        <div class="cl-name">${esc(l.name)}${l.rx_required?' <span class="chip rx">Rx</span>':''}
          <div class="cl-meta">${peso(l.unit_price)} / ${esc(l.unit)}</div>
        </div>
        <button class="modal-close" data-rm="${i}">×</button>
      </div>
      <div class="cl-bottom">
        <div class="qty">
          <button data-dec="${i}">−</button>
          <input type="number" min="1" value="${l.qty}" data-q="${i}">
          <button data-inc="${i}">+</button>
        </div>
        <span class="cl-amt">${peso(l.qty * l.unit_price)}</span>
      </div>
      ${eligible ? `<div class="cl-eligible">
        <label class="row" style="gap:6px;cursor:pointer">
          <input type="checkbox" data-sel="${i}" ${isElig?'checked':''}>
          <span>${isElig ? 'Senior/PWD discount applied' : 'Not eligible'}</span>
        </label>
        ${row.senior_discount ? `<span style="margin-left:auto;font-weight:600;color:var(--leaf)">−${peso(row.senior_discount)}</span>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    CART.lines.splice(+b.dataset.rm, 1); drawCart(); drawGrid();
  });
  box.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => setQty(+b.dataset.inc, CART.lines[+b.dataset.inc].qty + 1));
  box.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => setQty(+b.dataset.dec, CART.lines[+b.dataset.dec].qty - 1));
  box.querySelectorAll('[data-q]').forEach(inp => inp.onchange = () => setQty(+inp.dataset.q, Math.floor(Number(inp.value) || 1)));
  box.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => {
    CART.lines[+cb.dataset.sel].seniorOverride = cb.checked;
    drawCart();
  });

  drawTotals();
}

function setQty(i, q){
  const l = CART.lines[i];
  if (!l) return;
  const p = (S.products||[]).find(x => x.id === l.product_id);
  if (q <= 0){ CART.lines.splice(i, 1); drawCart(); drawGrid(); return; }
  if (p && q > Number(p.current_stock)){
    toast(`Only ${p.current_stock} on hand.`, 'warn');
    q = Number(p.current_stock);
  }
  l.qty = q;
  drawCart();
}

function clearCart(){
  if (!CART.lines.length) return;
  CART.lines = [];
  CART.customerType = 'regular';
  CART.idType = '';
  CART.idNumber = '';
  CART.tendered = '';
  CART.ref = '';
  CART.customer = '';
  drawCart();
  drawGrid();
}

function cartTotals(){
  const t = computeTotals(CART.lines, CART.customerType, S.settings.vat.rate, S.settings.vat.inclusive);
  const tendered = Number(CART.tendered) || 0;
  return { ...t, tendered, change: round2(Math.max(0, tendered - t.total)) };
}

function drawTotals(){
  const box = document.getElementById('cartTotals');
  if (!box) return;
  const t = cartTotals();
  const methods = ['Cash','GCash','Maya','Bank Transfer','Other'];
  const eligible = t.customer_type === 'senior' || t.customer_type === 'pwd';

  box.innerHTML = `
    <div class="customer-type">
      <button data-ct="regular" class="${CART.customerType==='regular'?'active':''}">
        <span class="k">Regular</span><span class="d">No discount</span></button>
      <button data-ct="senior" class="${CART.customerType==='senior'?'active':''}">
        <span class="k">Senior</span><span class="d">20% + VAT exempt</span></button>
      <button data-ct="pwd" class="${CART.customerType==='pwd'?'active':''}">
        <span class="k">PWD</span><span class="d">20% + VAT exempt</span></button>
    </div>

    ${eligible ? `
      <div class="id-capture">
        <div class="hd">ID details for discount</div>
        <label class="field"><span>ID type</span>
          <select id="idType">
            <option value="">Select</option>
            ${(CART.customerType === 'senior'
              ? ['Senior Citizen ID','OSCA ID','Philippine Passport','Driver\'s License','Other']
              : ['PWD ID','Philippine Passport','Driver\'s License','Other'])
              .map(o => `<option${CART.idType===o?' selected':''}>${esc(o)}</option>`).join('')}
          </select>
        </label>
        <label class="field" style="margin-bottom:0"><span>ID number</span>
          <input id="idNumber" class="mono" value="${esc(CART.idNumber)}" placeholder="Enter ID number">
        </label>
      </div>
    ` : ''}

    <div class="trow"><span>Subtotal (gross)</span><span>${peso(t.gross_subtotal)}</span></div>
    ${eligible ? `
      ${t.vat_exempt_sales ? `<div class="trow"><span>VAT-Exempt Sales</span><span>${peso(t.vat_exempt_sales)}</span></div>` : ''}
      ${t.vatable_sales ? `<div class="trow"><span>VATable Sales</span><span>${peso(t.vatable_sales)}</span></div>` : ''}
      ${t.vat ? `<div class="trow small"><span>VAT (${S.settings.vat.rate}%)</span><span>${peso(t.vat)}</span></div>` : ''}
      ${t.senior_discount ? `<div class="trow discount"><span>${CART.customerType === 'pwd' ? 'PWD' : 'Senior'} Discount</span><span>−${peso(t.senior_discount)}</span></div>` : ''}
    ` : S.settings.vat.show ? `<div class="trow small"><span>VAT ${S.settings.vat.rate}% included</span><span>${peso(t.vat)}</span></div>` : ''}

    <div class="trow grand"><span>Total</span><span>${peso(t.total)}</span></div>

    <div class="pay-methods">
      ${methods.map(m => `<button data-pay="${m}" class="${CART.payment===m?'active':''}">${esc(m)}</button>`).join('')}
    </div>

    ${CART.payment === 'Cash' ? `
      <label class="field"><span>Amount tendered</span>
        <input id="tend" type="number" min="0" step="0.01" value="${CART.tendered}" placeholder="0.00" style="font-size:17px;font-weight:600">
      </label>
      <div class="trow"><span>Change</span><span id="changeVal">${peso(t.change)}</span></div>
    ` : `
      <label class="field"><span>Reference number</span>
        <input id="payRef" value="${esc(CART.ref)}" placeholder="e.g. GCash ref">
      </label>
    `}

    <label class="field" style="margin-top:8px"><span>Customer name (optional)</span>
      <input id="custName" value="${esc(CART.customer)}" placeholder="Walk-in">
    </label>

    <button class="btn btn-primary btn-block btn-lg" id="payBtn" ${CART.lines.length?'':'disabled'} style="margin-top:4px">
      Complete sale
    </button>`;

  box.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => {
    CART.customerType = b.dataset.ct;
    if (CART.customerType === 'regular'){ CART.idType = ''; CART.idNumber = ''; }
    CART.lines.forEach(l => { l.seniorOverride = undefined; });
    drawCart();
  });
  const it = box.querySelector('#idType');
  if (it) it.onchange = e => CART.idType = e.target.value;
  const inn = box.querySelector('#idNumber');
  if (inn) inn.oninput = e => CART.idNumber = e.target.value;
  box.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
    CART.payment = b.dataset.pay; drawTotals();
  });
  const te = box.querySelector('#tend');
  if (te){
    te.oninput = e => {
      CART.tendered = e.target.value;
      const ch = box.querySelector('#changeVal');
      if (ch) ch.textContent = peso(cartTotals().change);
    };
    te.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); completeSale(); } };
  }
  const pr = box.querySelector('#payRef');
  if (pr) pr.oninput = e => CART.ref = e.target.value;
  const cn = box.querySelector('#custName');
  if (cn) cn.oninput = e => CART.customer = e.target.value;
  box.querySelector('#payBtn').onclick = completeSale;
}

async function completeSale(){
  if (!CART.lines.length) return;

  const actor = await askPassword({
    title: 'Complete sale',
    reason: `Total <b>${peso(cartTotals().total)}</b> — your name will be recorded as the cashier on this receipt.`
  });
  if (!actor) return;

  const t = cartTotals();

  // FEFO allocation check
  for (const l of CART.lines){
    const p = (S.products||[]).find(x => x.id === l.product_id);
    if (!p){ toast(`${l.name} is no longer available.`, 'bad'); return; }
    if (l.qty > Number(p.current_stock)){ toast(`Not enough stock.`, 'bad'); return; }
  }
  if (CART.payment === 'Cash' && t.tendered < t.total){
    toast('Amount tendered is less than the total.', 'bad');
    return;
  }

  const now = new Date().toISOString();
  const txnNo = nextNumber('txn');
  const orNo = nextNumber('receipt');
  const saleId = uid();

  const sale = {
    id: saleId, transaction_number: txnNo, receipt_number: orNo,
    transaction_date: now,
    subtotal: t.gross_subtotal,
    discount: t.senior_discount,
    discount_type: t.customer_type === 'senior' ? 'Senior Citizen 20%'
      : t.customer_type === 'pwd' ? 'PWD 20%' : '',
    total: t.total,
    vatable_sales: t.vatable_sales,
    vat_exempt_sales: t.vat_exempt_sales,
    vat: t.vat,
    senior_discount: t.senior_discount,
    customer_type: t.customer_type,
    customer_id_type: CART.idType,
    customer_id_number: CART.idNumber,
    amount_paid: CART.payment === 'Cash' ? round2(t.tendered) : t.total,
    change: CART.payment === 'Cash' ? t.change : 0,
    payment_method: CART.payment,
    payment_ref: CART.ref,
    cashier_id: ME.id, cashier_name: ME.name,
    customer_name: CART.customer.trim(),
    status: 'completed', demo: false
  };

  const items = t.items.map((l, idx) => {
    const src = CART.lines[idx];
    return {
      id: uid(), sale_id: saleId, product_id: l.product_id,
      name: l.name, generic_name: l.generic_name, sku: l.sku, unit: l.unit,
      quantity: l.qty, unit_price: l.unit_price,
      discount: l.senior_discount || 0,
      subtotal: l.line_total,
      line_gross: l.line_gross,
      line_vatable: l.vatable_sales,
      line_vat_exempt: l.vat_exempt_sales,
      line_vat: l.vat,
      senior_eligible: !!l.senior_eligible,
      senior_discount: l.senior_discount || 0,
      rx: src.rx || null,
      transaction_date: now
    };
  });

  const receipt = { id: uid(), receipt_number: orNo, sale_id: saleId, printed_at: now, print_count: 0 };

  // Build stock movement patches
  const productPatches = [], movements = [];
  CART.lines.forEach(l => {
    const p = (S.products||[]).find(x => x.id === l.product_id);
    const prev = Number(p.current_stock), next = prev - l.qty;
    productPatches.push({ ...p, current_stock: next, updated_at: now });
    movements.push({
      id: uid(), product_id: p.id, movement_type: 'Sale',
      quantity: -l.qty, previous_stock: prev, new_stock: next,
      reference_number: txnNo, reason: `Sold on ${orNo}`,
      user_id: ME.id, user_name: ME.name, created_at: now
    });
  });

  try {
    await Repo.batch(['sales','sale_items','receipts','products','movements','meta'], st => {
      st.sales.put(sale);
      items.forEach(i => st.sale_items.put(i));
      st.receipts.put(receipt);
      productPatches.forEach(p => st.products.put(p));
      movements.forEach(m => st.movements.put(m));
      st.meta.put({ key:'settings', value: S.settings });
    });
  } catch (err){
    console.error(err);
    S.settings.counters.txn--;
    S.settings.counters.receipt--;
    toast('Sale could not be saved. Try again.', 'bad');
    return;
  }

  S.sales.push(sale);
  S.sale_items.push(...items);
  S.receipts.push(receipt);
  S.movements.push(...movements);
  productPatches.forEach(p => {
    const i = S.products.findIndex(x => x.id === p.id);
    if (i > -1) S.products[i] = p;
  });

  audit('Completed sale', `${orNo} · ${peso(t.total)}`);
  CART.lines = [];
  CART.customerType = 'regular';
  CART.idType = '';
  CART.idNumber = '';
  CART.tendered = '';
  CART.ref = '';
  CART.customer = '';
  drawCart();
  drawGrid();
  showReceipt(saleId, true);
}

  setLastActor(actor);
  document.getElementById('lastUser').textContent = actor.name;
  document.getElementById('lastRole').textContent = `Last action · ${actor.role}`;
  audit('Completed sale', `${orNo} · ${peso(t.total)}`, actor);

function nextNumber(kind){
  S.settings.counters[kind] = (S.settings.counters[kind] || 0) + 1;
  const n = S.settings.counters[kind];
  const y = new Date().getFullYear();
  if (kind === 'txn') return `TXN-${today().replace(/-/g,'')}-${String(n).padStart(4,'0')}`;
  if (kind === 'receipt') return `AR-${String(n).padStart(6,'0')}`;
  if (kind === 'po') return `PO-${y}-${String(n).padStart(4,'0')}`;
  if (kind === 'adj') return `ADJ-${String(n).padStart(5,'0')}`;
  return String(n);
}

// ============================================================
// Receipt modal
// ============================================================
function showReceipt(saleId, justSold){
  const s = (S.sales||[]).find(x => x.id === saleId);
  if (!s) return;
  modal({
    title: justSold ? `Sale complete — ${s.receipt_number}` : `Receipt ${s.receipt_number}`,
    body: `
      <div class="row" style="margin-bottom:12px">
        <span class="chip neutral">57 mm · auto height</span>
        <div class="spacer"></div>
        <span class="small muted">Printed ${((S.receipts||[]).find(r => r.sale_id === saleId)||{}).print_count || 0}×</span>
      </div>
      <div class="preview-paper thermal">${receiptHTML(saleId)}</div>`,
    footer: `
      <button class="btn" data-close>Close</button>
      ${justSold ? '<button class="btn" id="rNext">Next customer</button>' : ''}
      <button class="btn btn-primary" id="rPrint">Print receipt</button>`,
    onOpen: (root, close) => {
      root.querySelector('#rPrint').onclick = async () => {
        await printReceipt(saleId);
        const r = (S.receipts||[]).find(x => x.sale_id === saleId);
        if (r){ r.print_count = (r.print_count || 0) + 1; r.printed_at = new Date().toISOString(); await Repo.put('receipts', r); }
      };
      const nx = root.querySelector('#rNext');
      if (nx) nx.onclick = () => { close(); document.getElementById('posBarcode')?.focus(); };
    }
  });
}

// ============================================================
// Receipts view
// ============================================================
VIEWS.receipts = () => {
  const list = (S.sales||[]).slice().sort((a,b) => b.transaction_date.localeCompare(a.transaction_date));
  document.getElementById('view-receipts').innerHTML = `
    <div class="card">
      <div class="card-head"><h3>${list.length} receipt${list.length===1?'':'s'}</h3></div>
      <table class="tbl">
        <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Cashier</th><th>Payment</th><th class="num">Total</th></tr></thead>
        <tbody>${list.length ? list.slice(0, 100).map(s => `
          <tr class="clickable" data-open="${s.id}">
            <td class="mono">${esc(s.receipt_number)}</td>
            <td>${fmtDT(s.transaction_date)}</td>
            <td>${esc(s.customer_name || 'Walk-in')}${s.customer_type==='senior'?' <span class="chip neutral">Senior</span>':s.customer_type==='pwd'?' <span class="chip neutral">PWD</span>':''}</td>
            <td>${esc(s.cashier_name || '—')}</td>
            <td>${esc(s.payment_method)}</td>
            <td class="num">${peso(s.total)}</td>
          </tr>`).join('')
          : '<tr><td colspan="6"><div class="empty"><div class="big">No receipts yet</div>Complete a sale to see it here.</div></td></tr>'}
        </tbody>
      </table>
    </div>`;
  document.querySelectorAll('#view-receipts [data-open]').forEach(r => {
    r.onclick = () => showReceipt(r.dataset.open, false);
  });
};

// ============================================================
// Products view
// ============================================================
VIEWS.products = () => {
  const list = (S.products||[]).filter(p => p.status === 'active');
  document.getElementById('view-products').innerHTML = `
    <div class="card">
      <div class="card-head"><h3>${list.length} products</h3></div>
      <table class="tbl">
        <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th class="num">Stock</th><th class="num">Price</th><th>Status</th></tr></thead>
        <tbody>${list.map(p => {
          const stock = Number(p.current_stock);
          const cls = stock <= 0 ? 'bad' : stock <= (p.reorder_point||0) ? 'warn' : 'ok';
          const cat = (S.categories||[]).find(c => c.id === p.category_id);
          return `<tr>
            <td>${esc(p.name)}${p.rx_required?' <span class="chip rx">Rx</span>':''}${p.senior_eligible?' <span class="chip ok">SP</span>':''}</td>
            <td class="mono tiny">${esc(p.sku)}</td>
            <td>${esc(cat?.name || '—')}</td>
            <td class="num">${stock}</td>
            <td class="num">${peso(p.selling_price)}</td>
            <td><span class="chip ${cls}">${stock <= 0 ? 'Out' : stock <= (p.reorder_point||0) ? 'Low' : 'OK'}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
};

VIEWS.inventory = () => {
  document.getElementById('view-inventory').innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:16px">
      <div class="stat hi"><div class="stat-k">Stock value</div><div class="stat-v">${peso((S.products||[]).reduce((a,p) => a + Number(p.current_stock) * Number(p.cost_price), 0))}</div></div>
      <div class="stat"><div class="stat-k">Active products</div><div class="stat-v">${(S.products||[]).filter(p => p.status === 'active').length}</div></div>
      <div class="stat warn"><div class="stat-k">Low stock</div><div class="stat-v">${(S.products||[]).filter(p => p.current_stock <= (p.reorder_point||0) && p.current_stock > 0).length}</div></div>
      <div class="stat bad"><div class="stat-k">Out of stock</div><div class="stat-v">${(S.products||[]).filter(p => p.current_stock <= 0).length}</div></div>
    </div>
    <div class="card"><div class="card-body"><p class="muted small" style="margin:0">Stock movements are logged automatically when sales and adjustments happen.</p></div></div>`;
};

VIEWS.analytics = () => {
  const sales = (S.sales||[]).filter(s => s.status === 'completed');
  const total = sales.reduce((a,s) => a + Number(s.total), 0);
  const today = sales.filter(s => s.transaction_date.slice(0,10) === today());
  const todayTotal = today.reduce((a,s) => a + Number(s.total), 0);
  document.getElementById('view-analytics').innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:16px">
      <div class="stat hi"><div class="stat-k">All-time sales</div><div class="stat-v">${peso(total)}</div><div class="stat-d">${sales.length} transactions</div></div>
      <div class="stat"><div class="stat-k">Today</div><div class="stat-v">${peso(todayTotal)}</div><div class="stat-d">${today.length} transactions</div></div>
      <div class="stat"><div class="stat-k">Average sale</div><div class="stat-v">${peso(sales.length ? total/sales.length : 0)}</div></div>
    </div>`;
};

VIEWS.settings = () => {
  document.getElementById('view-settings').innerHTML = `
    <div class="card"><div class="card-head"><h3>Pharmacy details</h3></div><div class="card-body">
      <p class="muted small">Settings management is available in the full build. This reduced version focuses on POS.</p>
    </div></div>`;
};

// ============================================================
// Helpers
// ============================================================
function modal({ title, body, footer = '', width = '', onOpen, onClose }){
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal ${width}">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  bg.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.getElementById('modalRoot').appendChild(bg);
  onOpen && onOpen(bg, close);
  return { root: bg, close };
}

function toast(msg, kind){
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function peso(n){
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function today(){
  const d = new Date();
  const o = d.getTimezoneOffset();
  return new Date(d.getTime() - o*60000).toISOString().slice(0,10);
}

function fmtDT(s){
  return s ? new Date(s).toLocaleString('en-PH', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
}

// --- start ---
go('pos');
