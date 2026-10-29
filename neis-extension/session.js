'use strict';
// All student records stay in session storage; only the popup can read them.
const NEIS_TTL = 15 * 60 * 1000;
function createNeisSession(api, now=()=>Date.now(), uuid=()=>crypto.randomUUID()) {
  const KEY='recordSession', ALARM='neis-record-expiry';
  let queue=Promise.resolve();
  async function cleanup(entry) {
    let failed=0;
    for(const ref of entry?.targets||[]) {
      try { await api.tabs.sendMessage(ref.tabId,{type:'YS_NEIS_CLEAR',sessionId:entry.id},{documentId:ref.documentId}); }
      catch { failed++; } // Detached pages are gone; otherwise the engine also enforces its own expiry.
    }
    return failed;
  }
  async function save(s) {
    if(s.current||s.pending)await api.storage.session.set({[KEY]:s});
    else await api.storage.session.remove(KEY);
    await api.alarms.clear(ALARM);
    const times=[s.current?.expiresAt,s.pending?.expiresAt].filter(Number.isFinite);
    if(times.length)await api.alarms.create(ALARM,{when:Math.min(...times)});
  }
  async function read() {
    const raw=await api.storage.session.get(KEY), s=raw[KEY]||{};
    const expired=[];
    for(const k of ['current','pending'])if(s[k]&&(!Number.isFinite(s[k].expiresAt)||s[k].expiresAt<=now())){expired.push(s[k]);delete s[k];}
    if(expired.length){await save(s);for(const entry of expired)await cleanup(entry);}
    return s;
  }
  const publicEntry=e=>e?{id:e.id,package:e.package,expiresAt:e.expiresAt}:null;
  const requireCurrent=(s,id)=>{if(!s.current||s.current.id!==id)throw Error('기록이 삭제되었거나 만료되었습니다. 다시 불러와 주세요.');return s.current;};
  const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  return {
    alarmName:ALARM,
    act(type,arg={}) {return serial(async()=>{
      const s=await read();let failures=0;
      if(type==='receive'||type==='import') {
        if(JSON.stringify(arg.package)?.length>2000000)throw Error('기록이 너무 큽니다.');
        const p=validatePackage(arg.package), entry={id:uuid(),package:p,expiresAt:now()+NEIS_TTL,targets:[]};
        if(type==='receive'){s.pending=entry;await save(s);return {count:p.records.length};}
        const old=s.current;s.current=entry;delete s.pending;await save(s);failures=await cleanup(old);
        return {entry:publicEntry(entry),cleanupFailures:failures};
      }
      if(type==='open') {
        if(s.pending){const old=s.current;s.current=s.pending;delete s.pending;await save(s);failures=await cleanup(old);}
        return {entry:publicEntry(s.current),cleanupFailures:failures};
      }
      if(type==='clear') {
        const old=s.current;delete s.current;delete s.pending;await save(s);failures=await cleanup(old);
        return {cleanupFailures:failures};
      }
      if(type==='purge'){await save(s);return {};}
      const e=requireCurrent(s,arg.id);
      if(type==='touch'){e.expiresAt=now()+NEIS_TTL;await save(s);return {id:e.id,expiresAt:e.expiresAt};}
      if(type==='track') {
        if(!Array.isArray(arg.targets)||arg.targets.length>40)throw Error('대조 대상 화면이 너무 많습니다.');
        for(const r of arg.targets){
          if(!Number.isInteger(r.tabId)||r.tabId<0||typeof r.documentId!=='string'||r.documentId.length>100)throw Error('대조 대상 화면이 올바르지 않습니다.');
          if(!e.targets.some(x=>x.tabId===r.tabId&&x.documentId===r.documentId))e.targets.push({tabId:r.tabId,documentId:r.documentId});
        }
        if(e.targets.length>40)throw Error('다시 기록을 불러온 뒤 대조해 주세요.');
        await save(s);return {};
      }
      if(type==='cancel'){failures=await cleanup(e);e.targets=[];await save(s);return {cleanupFailures:failures};}
      throw Error('지원하지 않는 작업입니다.');
    });}
  };
}
if(typeof module!=='undefined')module.exports={createNeisSession,NEIS_TTL};
