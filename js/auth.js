// /auth (auth.html): where Google and Microsoft send the fan back after signing in, with the
// ID token in the address's fragment, which never reaches a server. It hands the answer to
// the page that asked (js/sso.js) and closes. The token leaves the address bar at once.
const CHANNEL = 'atvents-sign-in';
const f = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);
const token = f.get('id_token') || '';
const msg = { type: CHANNEL, state: f.get('state') || '', token, error: token ? '' : (f.get('error') || 'failed') };
try { const ch = new BroadcastChannel(CHANNEL); ch.postMessage(msg); ch.close(); } catch { /* an old browser: the opener below */ }
try { if (window.opener) window.opener.postMessage(msg, location.origin); } catch { /* opener on another site */ }
const done = document.getElementById('auth-msg');
if (done && msg.error) done.textContent = 'Signing in did not finish. Close this window and try again, or type your name and email.';
// A window the page opened closes itself; if the browser keeps it open, the text says what to do.
setTimeout(() => window.close(), 200);
