// Run with: ego-browser nodejs < tests/ego-lite/acceptance.js
// The actual unpacked extension must be loaded and the demo configured.
const fs = await import('node:fs/promises');
const assert = (await import('node:assert/strict')).default;
const ROOT=globalThis.MF_PROJECT_ROOT || `${(await import('node:os')).homedir()}/Desktop/microfrontend-devtools`;
const EXTENSION_ID=globalThis.MF_EXTENSION_ID || 'bccbkpkokjhihlliaomfilcbdkgcfeip';
const task=await taskSpace(globalThis.MF_TASK_SPACE || 'MF DevTools acceptance');
let host=globalThis.MF_HOST_LABEL ? task.page(globalThis.MF_HOST_LABEL) : task.page('p1');
if(!globalThis.MF_HOST_LABEL) await host.goto('http://127.0.0.1:18085/#/both');
let options;
for(const p of await task.pages()) if((await p.url()).includes('/options/options.html')) options=p;
if(!options){options=await task.newPage();await options.goto(`chrome-extension://${EXTENSION_ID}/options/options.html`);}
await options.snapshot();
const results=[];
function pass(name,detail={}){results.push({name,status:'PASS',...detail});console.log('PASS',name);}
// `value` is a DOM property, not necessarily an attribute: use stable row index
// after inspecting the rendered inputs rather than relying on value attributes.
const rows=await options.evaluate(()=>[...document.querySelectorAll('[data-rule-row]')].map((r,i)=>({app:r.querySelector('.rule-app-identifier').value,i})));
const ruleSelector=(app,cls)=>`[data-rule-row]:nth-child(${rows.find(r=>r.app===app).i+1}) ${cls}`;
async function ensureChecked(css,checked){if(await options.evaluate(s=>document.querySelector(s).checked,css)!==checked) await options.click(css);}
async function reload(){await options.click('#reload-host-btn');await host.reload();await host.waitForFunction(()=>document.querySelector('#login-box') || document.querySelector('header'));if(await host.evaluate(()=>!!document.querySelector('#login-box'))){await host.snapshot();await host.fill('input[placeholder="username"]','demo-user');await host.fill('input[placeholder="password"]','demo-pass');await host.click('text="Sign in"');}await host.waitForFunction(()=>document.querySelector('[data-testid="alpha-api-result"]')?.dataset.status==='ok'&&document.querySelector('[data-testid="beta-api-result"]')?.dataset.status==='ok',undefined,{timeout:15000});}
async function origins(a,b){await host.waitForFunction(({a,b})=>document.querySelector('[data-testid="alpha-module-origin"]')?.textContent.endsWith(a)&&document.querySelector('[data-testid="beta-module-origin"]')?.textContent.endsWith(b),{a,b},{timeout:15000});}
async function setLocal(app,url){await options.fill(ruleSelector(app,'.rule-local-url'),url);await options.press(ruleSelector(app,'.rule-local-url'),'Tab');}
try {
 await ensureChecked('#global-enabled',true);await ensureChecked(ruleSelector('app-alpha','.rule-enabled'),true);await ensureChecked(ruleSelector('app-beta','.rule-enabled'),true);
 await setLocal('app-alpha','http://127.0.0.1:18001');await setLocal('app-beta','http://127.0.0.1:18002');
 await reload();await origins('http://127.0.0.1:18001','http://127.0.0.1:18002');pass('both local, same page, direct deep link');
 const hostSource=await host.evaluate(async()=>await (await fetch(document.querySelector('script[type="module"]').src)).text());
 assert(!hostSource.includes('__MF_DEVTOOLS__'));assert(!hostSource.includes('resolveEntry'));pass('host has no extension integration seam');
 const auth=await host.evaluate(async()=>({without:(await fetch('/api/alpha/data',{credentials:'omit'})).status,alpha:(await fetch('/api/alpha/data')).status,beta:(await fetch('/api/beta/data')).status,hidden:!document.cookie.includes('mf_session')}));
 assert.equal(auth.without,401);assert.equal(auth.alpha,200);assert.equal(auth.beta,200);assert(auth.hidden);pass('cookie enforced by server',auth);
 await host.snapshot();await host.click('text="alpha increment"');await host.click('text="beta increment"');await host.click('text="beta increment"');
 await host.evaluate(()=>{window.__mfAcceptanceSentinel='stable';});
 for(const app of ['alpha','beta']){
  const path=`${ROOT}/app-${app}/src/main.js`;const source=await fs.readFile(path,'utf8');
  try{for(const n of [1,2]){
   const marker=`${app}-acceptance-${n}`;
   await fs.writeFile(path,source.replace(`${app}-edit-marker-v1`,marker));
   await host.waitForFunction(({app,marker})=>document.querySelector(`[data-testid="${app}-edit-marker"]`)?.textContent===marker,{app,marker},{timeout:15000});
   const state=await host.evaluate(()=>({sentinel:window.__mfAcceptanceSentinel,a:document.querySelector('#alpha-counter-val').textContent,b:document.querySelector('#beta-counter-val').textContent}));
   assert.equal(state.sentinel,'stable');assert.equal(state.a,'1');assert.equal(state.b,'2');pass(`${app} HMR edit ${n}, host and peer preserved`,state);
  }}finally{await fs.writeFile(path,source);}
  await host.waitForFunction(app=>document.querySelector(`[data-testid="${app}-edit-marker"]`)?.textContent===`${app}-edit-marker-v1`,app,{timeout:15000});
 }
 await setLocal('app-alpha','http://127.0.0.1:18001/app-alpha/?layout=main');await reload();await origins('http://127.0.0.1:18001','http://127.0.0.1:18002');
 assert.equal(await host.evaluate(()=>window.APP.router.currentRoute.value.matched[0].props.default.first.entry),'http://127.0.0.1:18001/app-alpha/?layout=main');pass('configured path and query preserved');
 await setLocal('app-alpha','http://127.0.0.1:18999');await reload();await origins('http://127.0.0.1:18085','http://127.0.0.1:18002');
 assert(await host.evaluate(()=>Object.values(window.__MF_DEVTOOLS_RUNTIME__._state.rules).some(r=>r.available===false)));pass('unavailable local service falls back with status');
 await setLocal('app-alpha','http://127.0.0.1:18001');await ensureChecked(ruleSelector('app-beta','.rule-enabled'),false);await reload();await origins('http://127.0.0.1:18001','http://127.0.0.1:18085');pass('per-app override off');
 await ensureChecked('#global-enabled',false);await reload();await origins('http://127.0.0.1:18085','http://127.0.0.1:18085');pass('global off restores online production apps');
 await ensureChecked('#global-enabled',true);await ensureChecked(ruleSelector('app-beta','.rule-enabled'),true);await reload();await origins('http://127.0.0.1:18001','http://127.0.0.1:18002');
 for(let n=0;n<3;n++){await host.click('loc=href:/#/alpha');await host.waitForFunction(()=>!document.querySelector('[data-testid="beta-card"]'));await host.click('loc=href:/#/both');await host.waitForFunction(()=>document.querySelector('[data-testid="alpha-card"]')&&document.querySelector('[data-testid="beta-card"]'));}pass('three unmount/remount cycles');
 await host.reload();await origins('http://127.0.0.1:18001','http://127.0.0.1:18002');pass('refresh preserves mapping');
 console.log(await options.screenshot({path:`${ROOT}/evidence/v2/options-desktop.png`}));
 console.log(await host.screenshot({path:`${ROOT}/evidence/v2/both-local.png`}));
} catch(error){results.push({status:'FAIL',error:error.message});throw error;}
finally{await fs.writeFile(`${ROOT}/evidence/v2/acceptance-results.json`,JSON.stringify({time:new Date().toISOString(),browser:'Ego Lite',results},null,2));}
if(!globalThis.MF_TASK_SPACE) await task.finish({keep:[host.label,options.label]});
