import{d as w,e as k}from"../../storage-CypgN6sh.js";const E="privatefox-lock-host";function C(t){return browser.runtime.sendMessage(t)}const S=`
  :host { all: initial; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #1c1b22; color: #fbfbfe;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Segoe UI", sans-serif;
  }
  .panel { max-width: 26rem; width: 90%; text-align: center; }
  h1 { font-size: 1.4rem; font-weight: 600; margin: 0 0 0.75rem; }
  p.message { font-size: 1rem; opacity: 0.85; margin: 0 0 1.5rem; white-space: pre-wrap; }
  form { display: flex; gap: 0.5rem; justify-content: center; }
  input {
    flex: 1; padding: 0.6rem 0.8rem; font-size: 1rem;
    border-radius: 6px; border: 1px solid #5b5b66;
    background: #2b2a33; color: #fbfbfe;
  }
  input:focus { outline: 2px solid #00ddff; border-color: transparent; }
  button {
    padding: 0.6rem 1.2rem; font-size: 1rem; border-radius: 6px;
    border: none; background: #00ddff; color: #15141a;
    font-weight: 600; cursor: pointer;
  }
  .error { color: #ff9aa2; min-height: 1.25rem; margin-top: 0.75rem; font-size: 0.9rem; }
  .alt { margin-top: 1.25rem; font-size: 0.85rem; }
  .alt a { color: #00ddff; cursor: pointer; text-decoration: underline; }
`;class z{host=null;isShown(){return this.host!==null}show(r){if(this.host)return;const o=document.createElement("div");o.id=E;const i=o.attachShadow({mode:"closed"}),v=document.createElement("style");v.textContent=S;const d=document.createElement("div");d.className="backdrop";const l=document.createElement("div");l.className="panel";const b=document.createElement("h1");b.textContent="Privatefox is locked";const m=document.createElement("p");m.className="message",m.textContent=r;const p=document.createElement("form"),e=document.createElement("input");e.type="password",e.placeholder="Password",e.autocomplete="off";const u=document.createElement("button");u.type="submit",u.textContent="Unlock",p.append(e,u);const a=document.createElement("div");a.className="error";const f=document.createElement("div");f.className="alt";const s=document.createElement("a");s.textContent="Forgot password? Open a new tab for recovery options.",f.append(s);let n="unlock-attempt";s.addEventListener("click",()=>{n=n==="unlock-attempt"?"recovery-attempt":"unlock-attempt",e.type=n==="unlock-attempt"?"password":"text",e.placeholder=n==="unlock-attempt"?"Password":"Recovery code",s.textContent=n==="unlock-attempt"?"Forgot password? Open a new tab for recovery options.":"Back to password unlock.",a.textContent="",e.value="",e.focus()}),p.addEventListener("submit",x=>{x.preventDefault();const h=e.value;h&&C(n==="unlock-attempt"?{kind:"unlock-attempt",password:h}:{kind:"recovery-attempt",code:h}).then(c=>{c.ok?("recoveryCode"in c&&alert(`Unlocked via recovery. Your NEW recovery code is:

`+c.recoveryCode+`

Save it now — it will not be shown again. Set a new password from the extension options page.`),this.hide()):(a.textContent=c.error,e.value="",e.focus())})}),l.append(b,m,p,a,f),d.append(l),i.append(v,d),document.documentElement.appendChild(o),this.host=o,e.focus()}hide(){this.host?.remove(),this.host=null}}const g=new z;function y(t){t.setupComplete&&t.locked?g.show(t.welcomeMessage):g.hide()}browser.storage.local.get(w).then(t=>{const r=t[w];y({...k,...r})});browser.storage.onChanged.addListener((t,r)=>{if(r!=="local")return;const o=t[w];if(!o)return;const i=o.newValue;y({...k,...i})});
