'use strict';
const $=id=>document.getElementById(id);
let pack=null, plan=[], target=null, busy=false, stopped=false;
const actionable=x=>['ready','pending'].includes(x.status);
const labels={pending:'순서대로 탐색·활성화 예정',activationFailed:'칸 활성화 실패 · 중지',locked:'읽기 전용 · 입력 불가',ready:'빈칸 · 입력 가능',missing:'번호·이름 일치 입력란 없음',ambiguous:'입력란 중복 · 차단',occupied:'기존 기록 있음 · 건너뜀',same:'같은 문장 있음 · 건너뜀',tooLong:'입력칸 길이 초과',filled:'문장 채움 · 저장 전',stale:'화면 변경 · 다시 대조 필요',unconfirmed:'입력 반영 확인 실패'};
function status(s){$('status').textContent=s;}
function buttons(){
  $('scan').disabled=busy||!pack; $('file').disabled=busy; $('clear').disabled=busy; $('confirm').disabled=busy;
  const enabled=!busy&&$('confirm').checked&&plan.some(x=>actionable(x)&&x.checked);
  $('test').disabled=!enabled; $('fill').disabled=!enabled; $('stop').hidden=!busy;
}
function reset(){plan=[];target=null;$('list').replaceChildren();$('confirm').checked=false;buttons();}
function showContext(){const c=pack?.context;$('context').textContent=c?`${c.year}학년도 · ${c.grade}학년 ${c.classNumber}반 · ${c.semester}학기 · ${c.label} · ${pack.records.length}명`:'생기부 앱에서 나이스로 보내기를 누르거나 JSON 파일을 선택해 주세요.';}
function render(){
  $('list').replaceChildren();
  for(const item of plan){
    const r=pack.records.find(r=>r.number===item.number), div=document.createElement('div');div.className='record';
    const check=document.createElement('input');check.type='checkbox';check.checked=!!item.checked;check.disabled=busy||!actionable(item);check.onchange=()=>{item.checked=check.checked;buttons();};
    const label=document.createElement('label');label.append(check,` ${r.number}번 ${r.name}`);
    const small=document.createElement('small');small.textContent=labels[item.status]||item.status;
    const text=document.createElement('p');text.textContent=r.text;
    div.append(label,small,text);$('list').append(div);
  } buttons();
}
$('confirm').onchange=buttons;
$('file').onchange=async()=>{
  reset();pack=null;await chrome.storage.session.remove(['package','pendingPackage']);showContext();
  try{const file=$('file').files[0];if(!file)return;if(file.size>2000000)throw Error('파일이 너무 큽니다. 앱에서 다시 내보내 주세요.');
    pack=validatePackage(JSON.parse(await file.text()));await chrome.storage.session.set({package:pack});showContext();status('나이스에서 해당 학급·과목을 조회한 뒤 화면 대조를 눌러 주세요.');
  }catch(e){pack=null;status(e.message);}buttons();
};
$('clear').onclick=async()=>{pack=null;reset();await chrome.storage.session.remove(['package','pendingPackage']);$('file').value='';showContext();status('세션에서 기록을 지웠습니다. 다운로드한 파일은 별도로 삭제해 주세요.');};
$('scan').onclick=async()=>{
  reset();busy=true;buttons();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab||!isNeisUrl(tab.url))throw Error('https://…neis.go.kr 나이스 입력 화면에서 확장 프로그램을 열어 주세요.');
    target={id:tab.id,url:tab.url};
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['engine.js']});
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:records=>globalThis.__ysNeis.scan(records),args:[pack.records]});
    let inputs=0;for(const f of frames)inputs+=f.result?.diagnostic?.editableTextareas||0;
    plan=[...pack.records].sort((a,b)=>a.number-b.number).map(r=>{
      const found=frames.flatMap(f=>(f.result?.rows||[]).filter(x=>x.number===r.number&&x.status!=='missing').map(x=>({...x,documentId:f.documentId,frameId:f.frameId})));
      return found.length===1?{...found[0],checked:actionable(found[0])}:{number:r.number,status:found.length?'ambiguous':'missing',checked:false};
    });
    const ready=plan.filter(p=>p.status==='ready').length; const pending=plan.filter(p=>p.status==='pending').length;
    status(`현재 확인된 빈칸 ${ready}명 · 이동 후 탐색 ${pending}명 / 전체 ${plan.length}명\n활성화된 입력란 ${inputs}개.\n`+((ready+pending)?'번호순으로 같은 열의 칸을 활성화합니다. 이동 후 번호·이름이 일치하는 경우에만 입력하며, 찾지 못하면 중지합니다. 기존 기록은 보존합니다.':'학생 한 명의 나이스 입력칸을 클릭한 후 다시 대조해 주세요. 번호·이름과 입력 열을 함께 확인할 수 없는 구조는 지원하지 않습니다.'));
  }catch(e){plan=[];target=null;status('대조 실패: '+e.message+'\n다른 출처의 프레임이나 특수 입력 표는 지원되지 않을 수 있습니다.');}
  finally{busy=false;render();}
};
async function fill(firstOnly){
  if(busy||!target||!$('confirm').checked)return;
  const selected=plan.filter(p=>actionable(p)&&p.checked).slice(0,firstOnly?1:plan.length);
  busy=true;stopped=false;render();let count=0;
  try{
    for(const item of selected){
      if(stopped)break;
      const [active]=await chrome.tabs.query({active:true,currentWindow:true});
      if(active?.id!==target.id||active.url!==target.url)throw Error('탭 또는 주소가 변경되어 중지했습니다.');
      status(`${item.number}번 학생 입력칸을 찾고 활성화하는 중… (${count}명 채움)`);
      const results=await chrome.scripting.executeScript({target:{tabId:target.id,documentIds:[item.documentId]},func:token=>globalThis.__ysNeis?.fill(token)||{status:'stale'},args:[item.token]});
      item.status=results[0]?.result?.status||'unconfirmed';item.checked=false;
      if(item.status==='filled')count++;
      render();status(`${count}명 문장 채움 · 나이스 저장 전`);
      if(!['filled','same','occupied'].includes(item.status))throw Error(`${item.number}번: ${labels[item.status]||item.status}. 이 학생에서 중지했습니다. 나이스 내용을 확인하고 다시 대조해 주세요.`);
    }
    status(`${count}명 문장 채움${stopped?' · 중지됨':''}. 나이스에 저장한 상태는 아닙니다.\n나이스의 문장·학생·바이트 표시를 확인하고 직접 저장해 주세요. 기존 문장이 있는 칸은 그대로 두었습니다.`);
  }catch(e){status(`${count}명 문장 채움 · 저장 전\n${e.message}`);for(const p of plan)if(actionable(p)){p.status='stale';p.checked=false;}}
  finally{busy=false;$('confirm').checked=false;render();}
}
$('test').onclick=()=>fill(true);$('fill').onclick=()=>fill(false);$('stop').onclick=()=>{stopped=true;status('현재 학생의 탐색·입력 처리를 마친 뒤 멈춥니다. 최대 약 12초 걸릴 수 있습니다.');};
(async()=>{try{const saved=await chrome.storage.session.get(['package','pendingPackage']);if(saved.pendingPackage){pack=validatePackage(saved.pendingPackage);await chrome.storage.session.set({package:pack});await chrome.storage.session.remove('pendingPackage');status('생기부 앱에서 보낸 '+pack.records.length+'명 기록을 불러왔습니다. 학급·과목을 확인하고 화면 대조를 눌러 주세요.');}else if(saved.package)pack=validatePackage(saved.package);showContext();buttons();}catch{await chrome.storage.session.remove(['package','pendingPackage']);}})();

