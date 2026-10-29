'use strict';
const $=id=>document.getElementById(id);
let pack=null, plan=[], target=null, busy=false, stopped=false, lease=null, contextFrames=[], checks=[], manual=new Set(), expired=false, scanOK=false, localTimer;
const actionable=x=>['ready','pending'].includes(x.status);
const labels={pending:'순서대로 탐색·활성화 예정',activationFailed:'칸 활성화 실패 · 중지',locked:'읽기 전용 · 입력 불가',ready:'빈칸 · 입력 가능',missing:'번호·이름 일치 입력란 없음',ambiguous:'입력란 중복 · 차단',occupied:'기존 기록 있음 · 건너뜀',same:'같은 문장 있음 · 건너뜀',tooLong:'입력칸 길이 초과',filled:'문장 채움 · 저장 전',stale:'화면 변경 · 다시 대조 필요',unconfirmed:'입력 반영 확인 실패',expired:'임시 기록 만료 · 다시 불러오기'};
function status(s){$('status').textContent=s;}
async function request(action,args={}){const r=await chrome.runtime.sendMessage({type:'YS_NEIS_SESSION',action,...args});if(!r?.ok)throw Error(r?.error||'확장 프로그램 연결이 끊겼습니다. 다시 열어 주세요.');return r;}
function contextOK(){return scanOK&&checks.length===5&&checks.every(c=>c.status==='match'||(c.status==='unknown'&&manual.has(c.key)));}
function buttons(){
  $('scan').disabled=busy||!pack; $('file').disabled=busy; $('clear').disabled=busy; $('confirm').disabled=busy||!contextOK();
  const enabled=!busy&&!expired&&contextOK()&&$('confirm').checked&&plan.some(x=>actionable(x)&&x.checked);
  $('test').disabled=!enabled; $('fill').disabled=!enabled; $('stop').hidden=!busy;
}
function reset(){plan=[];target=null;contextFrames=[];checks=[];manual.clear();scanOK=false;$('list').replaceChildren();$('contextCheck').replaceChildren();$('confirm').checked=false;buttons();}
function showContext(){const c=pack?.context;$('context').textContent=c?`${c.year}학년도 · ${c.grade}학년 ${c.classNumber}반 · ${c.semester}학기 · ${c.label} · ${pack.records.length}명`:'생기부 앱에서 나이스로 보내기를 누르거나 JSON 파일을 선택해 주세요.';$('retention').textContent=lease?'임시 보관 중 · '+new Date(lease.expiresAt).toLocaleTimeString('ko-KR')+' 만료 예정 (대조·입력 시 15분 연장)':'보관된 임시 기록 없음';}
function forget(){clearTimeout(localTimer);expired=true;stopped=true;pack=null;lease=null;$('file').value='';reset();showContext();}
function arm(){clearTimeout(localTimer);localTimer=setTimeout(()=>{forget();status('임시 기록이 만료되었습니다. 다시 불러와 주세요.');},Math.max(0,lease.expiresAt-Date.now()));showContext();}
function accept(entry){pack=entry?validatePackage(entry.package):null;lease=entry?{id:entry.id,expiresAt:entry.expiresAt}:null;expired=false;if(lease)arm();showContext();buttons();}
async function touch(){if(!lease)throw Error('기록을 다시 불러와 주세요.');const r=await request('touch',{id:lease.id});lease={id:r.id,expiresAt:r.expiresAt};arm();return {...lease};}
function renderChecks(){
  $('contextCheck').replaceChildren();manual.clear();
  for(const c of checks){const row=document.createElement('p');
    row.textContent=`${c.label}: 파일 ${c.expected} / 화면 ${c.actual.length?c.actual.join(', '):'확인 불가'} — `;
    if(c.status==='unknown'){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.onchange=()=>{check.checked?manual.add(c.key):manual.delete(c.key);$('confirm').checked=false;buttons();};label.append(check,' 나이스 화면에서 이 항목이 일치함을 직접 확인했습니다.');row.append(label);}
    else row.append(c.status==='match'?'일치':c.status==='ambiguous'?'여러 값이 보여 입력 차단':'불일치 · 입력 차단');
    $('contextCheck').append(row);
  }
}
function render(){
  $('list').replaceChildren();
  if(pack)for(const item of plan){
    const r=pack.records.find(r=>r.number===item.number), div=document.createElement('div');div.className='record';
    const check=document.createElement('input');check.type='checkbox';check.checked=!!item.checked;check.disabled=busy||!actionable(item);check.onchange=()=>{item.checked=check.checked;buttons();};
    const label=document.createElement('label');label.append(check,` ${r.number}번 ${r.name}`);
    const small=document.createElement('small');small.textContent=labels[item.status]||item.status;
    const text=document.createElement('p');text.textContent=r.text;div.append(label,small,text);$('list').append(div);
  }buttons();
}
$('confirm').onchange=buttons;
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;busy=true;buttons();
  try{if(file.size>2000000)throw Error('파일이 너무 큽니다.');const p=validatePackage(JSON.parse(await file.text()));const r=await request('import',{package:p});reset();accept(r.entry);status('나이스에서 해당 학급·과목을 조회한 뒤 화면 대조를 눌러 주세요.'+(r.cleanupFailures?' 이전에 대조한 나이스 탭은 새로고침하여 작업용 사본을 정리해 주세요.':''));}
  catch(e){status(e.message);}finally{busy=false;buttons();}
};
$('clear').onclick=async()=>{busy=true;buttons();try{const r=await request('clear');forget();status('확장프로그램의 임시 기록과 연결된 작업을 종료했습니다. 나이스에 채운 문장은 그대로입니다. 다운로드 파일은 별도로 삭제해 주세요.'+(r.cleanupFailures?' 일부 탭의 정리를 확인하지 못했습니다. 해당 나이스 탭을 닫아 주세요.':''));}catch(e){forget();status('삭제 확인 실패: '+e.message+' 나이스 탭을 닫고 크롬을 완전히 종료해 주세요.');}finally{busy=false;buttons();}};
$('scan').onclick=async()=>{
  busy=true;buttons();
  try{
    const permit=await touch();await request('cancel',{id:permit.id});reset();
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab||!isNeisUrl(tab.url))throw Error('HTTPS 나이스 입력 화면에서 확장 프로그램을 열어 주세요.');
    target={id:tab.id,url:tab.url};
    const injected=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['context.js','engine.js']});
    await request('track',{id:permit.id,targets:injected.map(f=>({tabId:tab.id,documentId:f.documentId}))});
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,documentIds:injected.map(f=>f.documentId)},func:(records,lease)=>({scan:globalThis.__ysNeis.scan(records,lease),context:NeisContext.capture()}),args:[pack.records,permit]});
    if(expired||!lease)throw Error('기록이 만료되었습니다. 다시 불러와 주세요.');
    contextFrames=frames.map(f=>({documentId:f.documentId,signature:f.result.context.signature}));
    checks=NeisContext.compare(frames.map(f=>f.result.context),pack.context);scanOK=true;renderChecks();
    plan=[...pack.records].sort((a,b)=>a.number-b.number).map(r=>{
      const found=frames.flatMap(f=>(f.result?.scan?.rows||[]).filter(x=>x.number===r.number&&x.status!=='missing').map(x=>({...x,documentId:f.documentId})));
      return found.length===1?{...found[0],checked:actionable(found[0])}:{number:r.number,status:found.length?'ambiguous':'missing',checked:false};
    });
    const count=plan.filter(actionable).length;
    status(`입력 가능한 대상 ${count}/${plan.length}명. 학급·과목 대조 결과와 문장을 확인해 주세요.\n`+(count?'확인 불가 항목은 나이스 화면에서 직접 확인해야 합니다.':'학생 한 명의 입력칸을 클릭한 뒤 다시 대조해 주세요.'));
  }catch(e){scanOK=false;plan=[];status('대조 실패: '+e.message);}
  finally{busy=false;render();}
};
async function verifyScreen(){
  const [active]=await chrome.tabs.query({active:true,currentWindow:true});
  if(active?.id!==target.id||active.url!==target.url)throw Error('탭 또는 주소가 바뀌었습니다. 다시 대조해 주세요.');
  const frames=await chrome.scripting.executeScript({target:{tabId:target.id,documentIds:contextFrames.map(f=>f.documentId)},func:()=>NeisContext.capture().signature});
  if(frames.length!==contextFrames.length||frames.some(f=>contextFrames.find(x=>x.documentId===f.documentId)?.signature!==f.result))throw Error('학급·과목 또는 화면이 변경되었습니다. 다시 대조해 주세요.');
}
async function fill(firstOnly){
  if(busy||!target||!pack||!contextOK()||!$('confirm').checked)return;
  const selected=plan.filter(p=>actionable(p)&&p.checked).slice(0,firstOnly?1:plan.length);
  busy=true;stopped=false;render();let count=0;
  try{
    for(const item of selected){
      if(stopped)break;const permit=await touch();await verifyScreen();if(stopped)break;
      status(`${item.number}번 학생 입력 중… (${count}명 채움)`);
      const results=await chrome.scripting.executeScript({target:{tabId:target.id,documentIds:[item.documentId]},func:(token,lease)=>globalThis.__ysNeis?.fill(token,lease)||{status:'stale'},args:[item.token,permit]});
      item.status=results[0]?.result?.status||'unconfirmed';item.checked=false;if(item.status==='filled')count++;render();
      if(!['filled','same','occupied'].includes(item.status))throw Error(`${item.number}번: ${labels[item.status]||item.status}. 다시 대조해 주세요.`);
    }
    status(`${count}명 문장 채움${stopped?' · 중지됨':''}. 나이스의 학생·문장·바이트 표시를 확인하고 직접 저장해 주세요. 작업을 마치면 ‘작업 종료·기록 지우기’를 누르세요.`);
  }catch(e){scanOK=false;for(const p of plan)if(actionable(p)){p.status='stale';p.checked=false;}status(`${count}명 문장 채움 · ${e.message}`);}
  finally{busy=false;$('confirm').checked=false;render();}
}
$('test').onclick=()=>fill(true);$('fill').onclick=()=>fill(false);
$('stop').onclick=async()=>{stopped=true;scanOK=false;status('중지 요청 중…');try{if(lease)await request('cancel',{id:lease.id});}catch{}status('작업을 중지했습니다. 이미 채운 문장은 확인하고, 계속하려면 다시 대조해 주세요.');buttons();};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.recordSession&&lease){const current=changes.recordSession.newValue?.current;if(!current||current.id!==lease.id){forget();status('임시 기록이 삭제되었거나 교체되었습니다. 다시 불러와 주세요.');}}});
(async()=>{try{const r=await request('open');accept(r.entry);if(pack)status('임시 기록을 불러왔습니다. 학급·과목 대조부터 시작해 주세요.');}catch(e){forget();status(e.message);}})();
