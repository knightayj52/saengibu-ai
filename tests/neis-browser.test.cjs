const {chromium}=require('playwright');
const args=JSON.parse(process.env.CHROMIUM_ARGS_JSON||'[]'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..','neis-extension');
const rec=Array.from({length:24},(_,i)=>({number:i+1,name:i===2||i===3?'가상동명이인':'가상학생'+(i+1),text:'관찰한 내용을 글로 씀. '+(i+1)+'번 문장',limit:1500}));
const pack={format:'saengibu-neis',version:1,context:{year:2026,grade:3,classNumber:1,semester:2,kind:'subject',group:'국어',label:'국어'},records:rec.filter(r=>r.number!==8)};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args,headless:true});const context=await browser.newContext();const errors=[],external=[];
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname==='extension.test'){const f=path.join(root,path.basename(u.pathname));return r.fulfill({path:f});}if(u.hostname==='test.neis.go.kr')return r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'});external.push(u.href);await r.abort();});
 const neis=await context.newPage();neis.on('pageerror',e=>errors.push(e.message));await neis.goto('https://test.neis.go.kr/');await neis.clock.install();
 async function fixture(){await neis.evaluate(records=>{
  document.body.innerHTML='<h1>교과 평가</h1><label>학년도 <input id="year" value="2026"></label><label>학년 <input id="grade" value="3"></label><label>반 <input id="cls" value="1"></label><label>학기 <input id="semester" value="2"></label><label>과목 <select id="subject"><option>국어</option><option>수학</option></select></label><table><tbody id="rows"></tbody></table>';
  for(const r of records){const tr=document.createElement('tr');tr.dataset.number=r.number;for(const t of [r.number,r.name+(r.number===24?' (전입학)':''),r.number===23?'기존 기록':'']){const td=document.createElement('td');td.textContent=t;tr.append(td);}tr.lastElementChild.onclick=()=>{if(tr.querySelector('textarea'))return;const e=document.createElement('textarea');e.value=tr.lastElementChild.textContent;tr.lastElementChild.replaceChildren(e);e.onblur=()=>{tr.lastElementChild.textContent=e.value;};};document.getElementById('rows').append(tr);}document.querySelector('tr td:last-child').click();
  window.chrome={runtime:{id:'test',onMessage:{addListener:fn=>{window.clearListener=fn;}}}};
 },rec);}
 await fixture();
 let data={},alarm;let popup;
 const api={storage:{session:{get:async k=>structuredClone({[k]:data[k]}),set:async x=>Object.assign(data,structuredClone(x)),remove:async k=>{delete data[k]}}},alarms:{create:async(n,o)=>{alarm=o.when;},clear:async()=>{alarm=null;}},tabs:{sendMessage:async(id,m)=>neis.evaluate(m=>new Promise(resolve=>clearListener(m,{id:'test'},resolve)),m)}};
 const c=vm.createContext({module:{exports:{}},Date,crypto:require('node:crypto').webcrypto});vm.runInContext(fs.readFileSync(root+'/core.js','utf8')+'\n'+fs.readFileSync(root+'/session.js','utf8'),c);const manager=c.module.exports.createNeisSession(api);
 popup=await context.newPage();popup.on('pageerror',e=>errors.push(e.message));
 await popup.exposeBinding('chromeCall',async(source,call)=>{
  if(call.kind==='message')return {ok:true,...await manager.act(call.message.action,call.message)};
  if(call.kind==='tabs')return [{id:1,url:'https://test.neis.go.kr/'}];
  if(call.kind==='script'){
   if(call.files)for(const f of call.files)await neis.evaluate(fs.readFileSync(root+'/'+f,'utf8'));
   const value=call.fn?await neis.evaluate(({fn,args})=>(0,eval)('('+fn+')')(...args),{fn:call.fn,args:call.args||[]}):null;
   return [{documentId:'doc1',frameId:0,result:value}];
  }
 });
 await popup.addInitScript(()=>{window.chrome={runtime:{sendMessage:message=>chromeCall({kind:'message',message})},tabs:{query:()=>chromeCall({kind:'tabs'})},scripting:{executeScript:o=>chromeCall({kind:'script',files:o.files,fn:o.func?.toString(),args:o.args})},storage:{onChanged:{addListener:fn=>{window.storageChanged=fn;}}}};});
 await popup.goto('https://extension.test/popup.html');await popup.clock.install();
 async function importPack(p=pack){await popup.locator('#file').setInputFiles({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await popup.waitForFunction(()=>!!pack&&!busy);}
 async function scan(){await popup.locator('#scan').click();await popup.waitForFunction(()=>!busy);}
 async function drain(){for(let i=0;i<80;i++){await neis.clock.runFor(400);if(!await popup.evaluate(()=>busy))return;}throw Error('fill stuck');}
 await importPack();await scan();assert.equal(await popup.locator('#contextCheck input').count(),0);assert((await popup.locator('#contextCheck').innerText()).includes('일치'));
 await popup.locator('#confirm').check();await popup.locator('#test').click();await drain();assert.equal(await neis.locator('tr[data-number="1"] td:last-child').innerText(),rec[0].text);
 await popup.locator('#confirm').check();await popup.locator('#fill').click();await drain();
 for(const r of rec){const actual=await neis.locator(`tr[data-number="${r.number}"] td:last-child`).innerText();assert.equal(actual,r.number===8?'':r.number===23?'기존 기록':r.text);}
 console.log('PASS popup/real DOM: 24 students, skip 8, preserve 23, transfer24, same-name students matched by number, first-one then batch');
 await popup.locator('#clear').click();await popup.waitForFunction(()=>!busy);assert.equal(data.recordSession,undefined);assert.equal(await neis.locator('tr[data-number="1"] td:last-child').innerText(),rec[0].text);
 await fixture();await importPack();await scan();await neis.locator('#subject').selectOption('수학');await popup.locator('#confirm').check();await popup.locator('#fill').click();await drain();assert((await popup.locator('#status').innerText()).includes('변경'));assert.equal(await neis.locator('textarea').inputValue(),'');
 await scan();assert((await popup.locator('#contextCheck').innerText()).includes('불일치'));assert(await popup.locator('#fill').isDisabled());
 console.log('PASS wrong subject blocks initial input; changed subject after scan blocks input');
 await fixture();await neis.locator('label').evaluateAll(es=>es.forEach(e=>{while(e.firstChild)e.parentNode.insertBefore(e.firstChild,e);e.remove();}));await scan();assert.equal(await popup.locator('#contextCheck input').count(),5);assert(await popup.locator('#confirm').isDisabled());
 for(const cb of await popup.locator('#contextCheck input').all())await cb.check();await popup.locator('#confirm').check();assert(await popup.locator('#fill').isEnabled());
 console.log('PASS unreadable context requires explicit per-field confirmation');
 if(process.env.NEIS_TEST_SCREENSHOT)await popup.screenshot({path:process.env.NEIS_TEST_SCREENSHOT,fullPage:true});
 // Clear invalidates old engine tokens without deleting the NEIS draft.
 const old=await popup.evaluate(()=>({token:plan[0].token,lease}));await popup.locator('#clear').click();await popup.waitForFunction(()=>!busy);
 const result=await neis.evaluate(x=>__ysNeis.fill(x.token,x.lease),old);assert.notEqual(result.status,'filled');
 console.log('PASS delete invalidates unconsumed page tokens');
 // Stop while cell activation is waiting, before the value setter.
 await fixture();await importPack();await scan();await popup.locator('#confirm').check();await popup.locator('#fill').click();await popup.waitForFunction(()=>busy);await popup.locator('#stop').click();await drain();assert.equal(await neis.locator('textarea').inputValue(),'');assert(await popup.locator('#fill').isDisabled());
 console.log('PASS stop cancels in-flight activation before text mutation');
 // Duplicated identity blocks the row, regardless of the teacher checkbox.
 await fixture();await neis.evaluate(()=>document.querySelector('tbody').append(document.querySelector('tr').cloneNode(true)));await scan();assert((await popup.locator('#list').innerText()).includes('입력란 중복'));
 // Expiry while browser timers are advancing independently.
 await fixture();await scan();await neis.clock.runFor(901000);const exp=await neis.evaluate(()=>__ysNeis.fill('old',{id:'irrelevant',expiresAt:Date.now()+1000}));assert.equal(exp.status,'expired');await popup.clock.runFor(901000);assert((await popup.locator('#retention').innerText()).includes('없음'));assert(await popup.locator('#fill').isDisabled());
 console.log('PASS duplicate identity block and engine/popup expiry');
 // Same-origin parent context changes are rechecked during an iframe activation.
 await neis.clock.resume();await neis.evaluate(()=>{document.body.innerHTML='<label>과목 <select id="outer"><option>국어</option><option>수학</option></select></label><iframe src="about:blank"></iframe>';});
 const frame=neis.frames()[1];await frame.setContent('<table><tr><td>1</td><td>가상학생1</td><td><textarea></textarea></td></tr></table>');await frame.evaluate(fs.readFileSync(root+'/context.js','utf8'));await frame.evaluate(fs.readFileSync(root+'/engine.js','utf8'));
 const task=frame.evaluate(async r=>{const lease={id:'iframe-test',expiresAt:Date.now()+900000};const row=__ysNeis.scan([r],lease).rows[0];setTimeout(()=>parent.document.getElementById('outer').value='수학',30);return __ysNeis.fill(row.token,lease);},rec[0]);assert.notEqual((await task).status,'filled');assert.equal(await frame.locator('textarea').inputValue(),'');
 console.log('PASS same-origin parent context change during iframe activation prevents write');
 const demo=await context.newPage();demo.on('pageerror',e=>errors.push(e.message));await demo.goto('https://extension.test/demo.html');await demo.locator('#scan').click();await demo.locator('#fill').click();await demo.waitForFunction(()=>document.getElementById('result').textContent.includes('연습 완료'));
 for(const n of [7,9,24])assert((await demo.locator('#result').innerText()).includes(n+'번: 입력 확인'));
 assert.equal(await demo.locator('#students tr').nth(1).locator('td').last().innerText(),'');assert.equal(await demo.locator('#students tr').nth(3).locator('td').last().innerText(),'이미 작성된 문장입니다.');console.log('PASS bundled fictional demo');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS no browser errors or external network requests in mocked integration');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
