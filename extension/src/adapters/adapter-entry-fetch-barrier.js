// Vite/qiankun 2 dev compatibility: hold delivery of a second configured
// HTML entry until the previous plugin lifecycle has registered. Modules,
// APIs and HMR are never redirected or queued. This supports the known
// vite-plugin-qiankun registry convention; a timeout is surfaced explicitly.
(() => {
  const runtime=window.__MF_DEVTOOLS_RUNTIME__, matching=window.__MF_DEVTOOLS_MATCHING__;
  if (!runtime || !matching) return;
  const ID='entry-fetch-barrier', nativeFetch=window.fetch.bind(window);
  let tail=Promise.resolve();
  const normalize = input => { try { const u=new URL(input,location.href);return u.origin+u.pathname.replace(/\/$/,'')+u.search; } catch { return ''; } };
  function abortError(signal) { return signal.reason || new DOMException('The operation was aborted','AbortError'); }
  function waitTurn(turn,signal) {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    return new Promise((resolve,reject)=>{
      const onAbort=()=>{signal.removeEventListener('abort',onAbort);reject(abortError(signal));};
      signal?.addEventListener('abort',onAbort,{once:true});
      turn.then(()=>{signal?.removeEventListener('abort',onAbort);resolve();});
    });
  }
  window.fetch=function barrieredFetch(input,init) {
    const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
    const method=String(init?.method || input?.method || 'GET').toUpperCase();
    const env=matching.findEnvironmentForOrigin(runtime.getConfig(),location.href);
    const rule=method==='GET'&&env?.rules?.find(r=> {
      const original=runtime._state.entries[r.appIdentifier];
      return normalize(original)===normalize(url) || r.enabled&&!r.unavailable&&normalize(runtime._state.resolvedEntries[r.appIdentifier] || r.localEntryUrl)===normalize(url);
    });
    if (!rule) return nativeFetch(input,init);
    const isLocal = rule.enabled && !rule.unavailable && normalize(runtime._state.resolvedEntries[rule.appIdentifier] || rule.localEntryUrl) === normalize(url);
    const signal=init?.signal || input?.signal;
    const before=tail;
    let release; tail=new Promise(resolve=>{release=resolve;});
    let released=false;
    const done=()=>{if(!released){released=true;release();}};
    const timeout=setTimeout(()=>{
      runtime.log({level:'warn',adapterId:ID,message:`${rule.appIdentifier} 初始化超过 8 秒，已释放等待队列；请检查控制台`});
      done();
    },8000);
    return waitTurn(before,signal).then(()=>nativeFetch(input,init)).then(response=>{
      if(!response.ok){clearTimeout(timeout);done();return response;}
      const poll=()=>{
        if(released) return;
        if(isLocal ? !!window.moudleQiankunAppLifeCycles?.[rule.appIdentifier] : typeof window.proxy?.[rule.appIdentifier]?.mount === 'function') {
          clearTimeout(timeout);
          setTimeout(done,0); // let dynamic-import finally callbacks wire this sandbox first
          return;
        }
        setTimeout(poll,25);
      };
      poll();
      return response;
    },err=>{clearTimeout(timeout);done();throw err;});
  };
  runtime.reportAdapterStatus(ID,{supported:true,reason:'Vite 开发入口加载协调已启用'});
})();
