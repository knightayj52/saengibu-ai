const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ext=path.join(__dirname,'../neis-extension');
const sample=()=>({format:'saengibu-neis',version:1,context:{year:2026,grade:3,classNumber:1,semester:2,kind:'subject',group:'국어',label:'국어'},records:[{number:1,name:'가상학생',text:'관찰한 내용을 문장으로 씀.',limit:1500}]});
function setup(){
 let now=1000,id=0,data={},alarm=null;const cleared=[];
 const api={storage:{session:{get:async key=>structuredClone({[key]:data[key]}),set:async x=>Object.assign(data,structuredClone(x)),remove:async key=>{delete data[key]}}},alarms:{clear:async()=>{alarm=null;},create:async(n,opt)=>{alarm=opt.when;}},tabs:{sendMessage:async(tab,m,opt)=>{cleared.push({tab,...m,...opt});}}};
 const c=vm.createContext({module:{exports:{}},Date,crypto:require('node:crypto').webcrypto});
 vm.runInContext(fs.readFileSync(path.join(ext,'core.js'),'utf8')+'\n'+fs.readFileSync(path.join(ext,'session.js'),'utf8'),c);
 return {manager:c.module.exports.createNeisSession(api,()=>now,()=>String(++id)),api,cleared,advance:ms=>{now+=ms},data:()=>structuredClone(data),alarm:()=>alarm};
}
test('URL restrictions and imported metadata minimization',()=>{
 const {isNeisUrl,validatePackage}=require('../neis-extension/core.js');
 for(const u of ['http://jne.neis.go.kr','https://neis.go.kr.evil.test','https://neis.go.kr@evil.test','file:///neis.go.kr'])assert.equal(isNeisUrl(u),false);
 assert(isNeisUrl('https://jne.neis.go.kr/'));
 const p=sample();p.secret='not retained';p.records[0].extra='not retained';assert(!JSON.stringify(validatePackage(p)).includes('not retained'));
 p.records.push({...p.records[0]});assert.throws(()=>validatePackage(p));
});
test('expired package cannot be renewed and all tracked copies receive cleanup',async()=>{
 const t=setup(),r=await t.manager.act('import',{package:sample()}),id=r.entry.id;
 await t.manager.act('track',{id,targets:[{tabId:5,documentId:'frame-1'}]});
 t.advance(900001);await assert.rejects(t.manager.act('touch',{id}));
 assert.equal(t.data().recordSession,undefined);assert.equal(t.cleared[0].sessionId,id);assert.equal(t.alarm(),null);
});
test('activity extends expiry; browser sleep still enforces absolute deadline on next request',async()=>{
 const t=setup(),r=await t.manager.act('import',{package:sample()}),id=r.entry.id;
 t.advance(800000);const lease=await t.manager.act('touch',{id});assert.equal(lease.expiresAt,1701000);
 t.advance(200000);assert.equal((await t.manager.act('open')).entry.id,id);
 t.advance(900000);assert.equal((await t.manager.act('open')).entry,null);
});
test('new pending package does not replace running package; open retires previous engine copies',async()=>{
 const t=setup(),r=await t.manager.act('import',{package:sample()}),id=r.entry.id;
 await t.manager.act('track',{id,targets:[{tabId:5,documentId:'frame-1'}]});
 await t.manager.act('receive',{package:sample()});assert.equal(t.data().recordSession.current.id,id);
 const next=await t.manager.act('open');assert.notEqual(next.entry.id,id);assert.equal(t.cleared.length,1);
 await assert.rejects(t.manager.act('touch',{id}));
});
test('clear removes both pending and current records; failed page cleanup is reported',async()=>{
 const t=setup(),r=await t.manager.act('import',{package:sample()});
 await t.manager.act('track',{id:r.entry.id,targets:[{tabId:5,documentId:'gone'}]});await t.manager.act('receive',{package:sample()});
 t.api.tabs.sendMessage=async()=>{throw Error('detached')};const out=await t.manager.act('clear');assert.equal(out.cleanupFailures,1);assert.equal(t.data().recordSession,undefined);
});
test('alarm purge removes idle records and cancellation only retires page work',async()=>{
 const t=setup(),r=await t.manager.act('import',{package:sample()});await t.manager.act('track',{id:r.entry.id,targets:[{tabId:5,documentId:'frame-1'}]});
 await t.manager.act('cancel',{id:r.entry.id});assert.equal(t.cleared.length,1);assert(t.data().recordSession.current.package);
 t.advance(900001);await t.manager.act('purge');assert.equal(t.data().recordSession,undefined);
});
test('sender gate rejects outside sites, subframes and page commands',async()=>{
 let listener;const replies=[];const c=vm.createContext({URL,importScripts:()=>{},createNeisSession:()=>({act:async()=>({count:1}),alarmName:'x'}),chrome:{runtime:{id:'test-id',getURL:p=>'chrome-extension://test-id/'+p,getManifest:()=>({version:'0.4.0'}),onMessage:{addListener:f=>listener=f}},storage:{session:{setAccessLevel:async()=>{},remove:async()=>{}}},alarms:{onAlarm:{addListener:()=>{}}}}});
 vm.runInContext(fs.readFileSync(path.join(ext,'background.js'),'utf8'),c);
 for(const sender of [{id:'test-id',frameId:0,url:'https://evil.test/'},{id:'test-id',frameId:1,url:'https://knightayj52.github.io/saengibu-ai/'},{id:'other',frameId:0,url:'https://knightayj52.github.io/saengibu-ai/'}])assert.equal(listener({type:'YS_NEIS_SEND'},sender,r=>replies.push(r)),undefined);
 const app={id:'test-id',frameId:0,url:'https://knightayj52.github.io/saengibu-ai/'};assert.equal(listener({type:'YS_NEIS_SESSION',action:'open'},app,r=>replies.push(r)),undefined);assert.equal(replies.length,0);
 listener({type:'YS_NEIS_PING'},app,r=>replies.push(r));assert.equal(replies[0].version,'0.4.0');
});
test('manifest keeps narrow permissions and blocks extension network connections',()=>{
 const m=require('../neis-extension/manifest.json');assert.deepEqual(m.permissions,['activeTab','scripting','storage','alarms']);assert.equal(m.host_permissions,undefined);assert(m.content_security_policy.extension_pages.includes("connect-src 'none'"));
 for(const name of ['background.js','session.js','engine.js','popup.js','bridge.js','context.js'])assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(fs.readFileSync(path.join(ext,name),'utf8')));
});
