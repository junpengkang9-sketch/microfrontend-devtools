import { loadMicroApp } from 'qiankun';
// This host's existing public API pattern; no extension-specific resolver.
window.qiankun = { loadMicroApp };
const apps = ['alpha','beta'].map(name => window.qiankun.loadMicroApp({
  name:`app-${name}`, entry:new URL(`/app-${name}/`,location.origin).href,
  container:`#${name}`,
}, { sandbox:{experimentalStyleIsolation:true} }));
Promise.all(apps.map(app=>app.mountPromise)).then(()=>{document.querySelector('#status').textContent='Both mounted';}).catch(error=>{document.querySelector('#status').textContent=error.message;});
