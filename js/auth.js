// ============================================================
// Challenge-based auth. No login page. Callers ask for a
// password at the moment of a privileged action.
// ============================================================
import { S, Repo, uid } from './db.js';

function sha256JS(str){
  function rr(n,s){ return (n>>>s)|(n<<(32-s)); }
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = [];
  for (let i = 0; i < str.length; i++){
    const c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048){ bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  const l = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(l / 0x20000000);
  const lo = (l << 3) >>> 0;
  bytes.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255,
             (lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255);
  for (let i = 0; i < bytes.length; i += 64){
    const w = new Array(64);
    for (let j = 0; j < 16; j++)
      w[j] = (bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3];
    for (let j = 16; j < 64; j++){
      const s0 = rr(w[j-15],7)^rr(w[j-15],18)^(w[j-15]>>>3);
      const s1 = rr(w[j-2],17)^rr(w[j-2],19)^(w[j-2]>>>10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let j = 0; j < 64; j++){
      const S1 = rr(e,6)^rr(e,11)^rr(e,25);
      const ch = (e&f)^(~e&g);
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rr(a,2)^rr(a,13)^rr(a,22);
      const mj = (a&b)^(a&c)^(b&c);
      const t2 = (S0 + mj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  return H.map(x => x.toString(16).padStart(8,'0')).join('');
}

let CRYPTO_OK = true;
export async function sha256(text){
  if (CRYPTO_OK && window.crypto?.subtle){
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch { CRYPTO_OK = false; }
  }
  return sha256JS(text);
}

export const hashPw = (pw, salt) => sha256(salt + '\u00A7' + pw);

export async function verify(username, password){
  const uname = String(username || '').trim().toLowerCase();
  if (!uname || !password) return null;
  const u = (S.users || []).find(x => x.username.toLowerCase() === uname && x.status === 'active');
  if (!u) return null;
  const h = await hashPw(password, u.pass_salt);
  return h === u.pass_hash ? u : null;
}

export async function verifyRole(username, password, role){
  const u = await verify(username, password);
  if (!u) return null;
  return u.role === role ? u : null;
}

export async function audit(action, detail, actor){
  const rec = {
    id: uid(),
    at: new Date().toISOString(),
    user_name: actor ? actor.name : 'Unknown',
    user_role: actor ? actor.role : '',
    action,
    detail: String(detail || '')
  };
  S.audit.push(rec);
  await Repo.put('audit', rec);
}
