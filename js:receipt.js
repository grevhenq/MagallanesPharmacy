// ============================================================
// Receipt is rendered once, in one place. Preview, print and
// PDF all call receiptHTML() so they can never diverge.
// ============================================================
import { S } from './db.js';

export function receiptHTML(saleId){
  const s = (S.sales || []).find(x => x.id === saleId);
  if (!s) return '<p>Receipt not found.</p>';
  const items = (S.sale_items || []).filter(i => i.sale_id === saleId);
  const ph = S.settings.pharmacy;
  const vatRate = Number(S.settings.vat.rate) || 12;
  const vatInclusive = !!S.settings.vat.inclusive;

  const isSenior = s.customer_type === 'senior' || s.customer_type === 'pwd';
  const vatable = s.vatable_sales ?? 0;
  const vatExempt = s.vat_exempt_sales ?? 0;
  const vatAmt = s.vat ?? 0;
  const seniorDisc = s.senior_discount ?? s.discount ?? 0;

  const rxItems = items.filter(i => i.rx);
  const patientName = rxItems.find(i => i.rx?.patient_name)?.rx?.patient_name || '';

  const kv = (k, v) => v
    ? `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`
    : '';

  return `<div class="rcpt">
    <div class="ctr big">${esc(ph.name)}</div>
    <div class="ctr sub">${esc(ph.tagline || '')}</div>
    <div class="ctr sub">${esc(ph.address)}</div>
    <div class="ctr sub">${esc(ph.phone)}${ph.mobile ? ' · ' + esc(ph.mobile) : ''}</div>
    ${ph.tin ? `<div class="ctr sub">TIN ${esc(ph.tin)}</div>` : ''}
    ${ph.permit ? `<div class="ctr sub">${esc(ph.permit)}</div>` : ''}
    <hr>
    <div class="ctr bold" style="font-size:12px;letter-spacing:.05em">ACKNOWLEDGEMENT RECEIPT</div>
    ${s.status === 'voided' ? '<div class="ctr bold" style="color:#a00">*** VOIDED ***</div>' : ''}
    <hr>

    ${kv('Receipt No.', s.receipt_number)}
    ${kv('Txn No.', s.transaction_number)}
    ${kv('Date', fmtDate(s.transaction_date))}
    ${kv('Time', fmtTime(s.transaction_date))}
    ${kv('Cashier', s.cashier_name || '—')}
    ${s.customer_name ? kv('Customer', s.customer_name) : ''}
    ${s.customer_type === 'senior' ? kv('Customer type', 'Senior Citizen') : ''}
    ${s.customer_type === 'pwd' ? kv('Customer type', 'PWD') : ''}
    ${s.customer_id_type ? kv('ID type', s.customer_id_type) : ''}
    ${s.customer_id_number ? kv('ID number', s.customer_id_number) : ''}
    ${patientName ? kv('Patient', patientName) : ''}

    <hr>
    <table>
      ${items.map(i => `
        <tr><td colspan="2" class="item-name">${esc(i.name)}</td></tr>
        ${i.generic_name ? `<tr><td colspan="2" class="item-meta">${esc(i.generic_name)}</td></tr>` : ''}
        <tr>
          <td class="item-meta">${i.quantity} × ${peso(i.unit_price).replace('₱','')}</td>
          <td class="r">${peso(i.line_gross ?? i.subtotal).replace('₱','')}</td>
        </tr>
        ${i.senior_discount ? `<tr>
          <td class="item-meta">Senior/PWD disc.</td>
          <td class="r item-meta">-${peso(i.senior_discount).replace('₱','')}</td>
        </tr>` : ''}
      `).join('')}
    </table>
    <hr>

    ${isSenior ? `
      ${vatable ? `<div class="tot"><span>VATable Sales</span><span>${peso(vatable).replace('₱','')}</span></div>` : ''}
      ${vatAmt ? `<div class="tot"><span>VAT (${vatRate}%)</span><span>${peso(vatAmt).replace('₱','')}</span></div>` : ''}
      ${vatExempt ? `<div class="tot"><span>VAT-Exempt Sales</span><span>${peso(vatExempt).replace('₱','')}</span></div>` : ''}
      ${seniorDisc ? `<div class="tot"><span>${s.customer_type === 'pwd' ? 'PWD' : 'Senior'} Discount (20%)</span><span>-${peso(seniorDisc).replace('₱','')}</span></div>` : ''}
    ` : `
      <div class="tot"><span>Subtotal</span><span>${peso(s.subtotal).replace('₱','')}</span></div>
      ${Number(s.discount) ? `<div class="tot"><span>${esc(s.discount_type || 'Discount')}</span><span>-${peso(s.discount).replace('₱','')}</span></div>` : ''}
      ${S.settings.vat.show ? `<div class="tot"><span>VAT ${vatRate}% ${vatInclusive ? 'incl.' : 'added'}</span><span>${peso(vatAmt).replace('₱','')}</span></div>` : ''}
    `}

    <div class="tot g"><span>TOTAL</span><span>${peso(s.total).replace('₱','')}</span></div>
    <div class="tot"><span>${esc(s.payment_method)}${s.payment_ref ? ' ' + esc(s.payment_ref) : ''}</span><span>${peso(s.amount_paid).replace('₱','')}</span></div>
    ${Number(s.change) ? `<div class="tot"><span>Change</span><span>${peso(s.change).replace('₱','')}</span></div>` : ''}

    ${rxItems.length ? `
      <hr>
      <div class="item-meta"><b>Prescriptions dispensed</b></div>
      ${rxItems.map(i => `
        <div class="kv"><span>${esc(i.name)}</span><span></span></div>
        ${i.rx.patient_name ? `<div class="kv"><span>Patient</span><span>${esc(i.rx.patient_name)}</span></div>` : ''}
        ${i.rx.rx_number ? `<div class="kv"><span>Rx No.</span><span>${esc(i.rx.rx_number)}</span></div>` : ''}
        ${i.rx.rx_date ? `<div class="kv"><span>Rx date</span><span>${esc(i.rx.rx_date)}</span></div>` : ''}
        ${i.rx.doctor_name ? `<div class="kv"><span>Prescriber</span><span>${esc(i.rx.doctor_name)}</span></div>` : ''}
        ${i.rx.doctor_prc ? `<div class="kv"><span>PRC No.</span><span>${esc(i.rx.doctor_prc)}</span></div>` : ''}
      `).join('')}
    ` : ''}

    <hr>
    <div class="ctr sub">${esc(S.settings.receipt.footer)}</div>
    ${S.settings.receipt.note ? `<div class="ctr sub">${esc(S.settings.receipt.note)}</div>` : ''}
  </div>`;
}

const PAGE_RULES = {
  '57': '@page{size:57mm auto;margin:0}',
  '80': '@page{size:80mm auto;margin:0}',
  'A4': '@page{size:A4 portrait;margin:14mm}',
  'A4L':'@page{size:A4 landscape;margin:12mm}'
};

async function waitForFonts(){
  try { if (document.fonts?.ready) await document.fonts.ready; }
  catch {}
  await new Promise(r => setTimeout(r, 40));
}

export async function printReceipt(saleId){
  await waitForFonts();
  const html = receiptHTML(saleId);
  const rule = document.getElementById('pageRule');
  if (rule) rule.textContent = PAGE_RULES['57'];
  const area = document.getElementById('printArea');
  area.innerHTML = `<div class="preview-paper thermal">${html}</div>`;
  await new Promise(r => setTimeout(r, 60));
  window.print();
}

export async function printDocument(html, page = 'A4'){
  await waitForFonts();
  const rule = document.getElementById('pageRule');
  if (rule) rule.textContent = PAGE_RULES[page] || PAGE_RULES.A4;
  const area = document.getElementById('printArea');
  area.innerHTML = `<div class="preview-paper">${html}</div>`;
  await new Promise(r => setTimeout(r, 60));
  window.print();
}

// --- helpers ---
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function peso(n){
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function fmtDate(s){
  return s ? new Date(s).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'2-digit' }) : '—';
}
function fmtTime(s){
  return s ? new Date(s).toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' }) : '—';
}