// ============================================================
// Password prompt. Every privileged action calls askPassword()
// which returns the verified user object or null (cancelled).
// ============================================================
import { S } from './db.js';
import { verify, verifyRole, setLastActor } from './auth.js';

// Open the password prompt and resolve with the verified user, or null.
//
//   askPassword({ title, reason })
//     → any active user's password
//
//   askPassword({ title, reason, role: 'Administrator' })
//     → only a user with that exact role
//
export function askPassword({ title = 'Authorise action', reason = '', role = null } = {}){
  return new Promise(resolve => {

    const users = (S.users || []).filter(u => u.status === 'active');
    const roleNote = role ? `Only <b>${role}</b> can authorise this.` : 'Any active staff password works.';

    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal narrow">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="modal-close" data-close>×</button>
        </div>
        <div class="modal-body">
          ${reason ? `<p class="auth-reason">${reason}</p>` : ''}
          <p class="small muted" style="margin-top:0">${roleNote}</p>
          <label class="field">
            <span>Username</span>
            <select id="apUser">
              <option value="">— Select —</option>
              ${users.map(u => `<option value="${esc(u.username)}">${esc(u.name)} · ${esc(u.role)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Password</span>
            <input id="apPass" type="password" autocomplete="off" placeholder="Enter password">
          </label>
          <p id="apErr" class="error"></p>
        </div>
        <div class="modal-foot">
          <button class="btn" data-close>Cancel</button>
          <button class="btn btn-primary" id="apOk">Authorise</button>
        </div>
      </div>`;

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      bg.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);

    bg.addEventListener('mousedown', e => { if (e.target === bg) finish(null); });
    bg.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) finish(null);
    });

    const userEl = bg.querySelector('#apUser');
    const passEl = bg.querySelector('#apPass');
    const errEl = bg.querySelector('#apErr');

    const submit = async () => {
      errEl.textContent = '';
      const username = userEl.value;
      const password = passEl.value;
      if (!username){ errEl.textContent = 'Choose your name first.'; return; }
      if (!password){ errEl.textContent = 'Enter your password.'; passEl.focus(); return; }

      const user = role
        ? await verifyRole(username, password, role)
        : await verify(username, password);

      if (!user){
        errEl.textContent = role
          ? `Wrong password, or this account is not ${role}.`
          : 'Wrong username or password.';
        passEl.value = '';
        passEl.focus();
        return;
      }
      setLastActor(user);
      finish(user);
    };

    bg.querySelector('#apOk').onclick = submit;
    passEl.onkeydown = e => { if (e.key === 'Enter'){ e.preventDefault(); submit(); } };

    document.getElementById('modalRoot').appendChild(bg);
    setTimeout(() => userEl.focus(), 30);
  });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));