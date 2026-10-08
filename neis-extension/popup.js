'use strict';
const $=id=>document.getElementById(id);
let pack=null, plan=[], target=null, busy=false, stopped=false;
const labels={ready:'빈칸 · 입력 가능',missing:'번호·이름 일치 입력란 없음',ambiguous:'입력란 중복 · 차단',occupied:'기존 기록 있음 · 건너뜀',same:'같은 문장 있음 · 건너뜀',tooLong:'입력칸 길이 초과',filled:'문장 채움 · 저장 전',stale:'화면 변경 · 다시 대조 필요',unconfirmed:'입력 반영 확인 실패'};
function status(s){$('status').textContent=s;}
function buttons(){
  $('scan').disabled=busy||!pack; $('file').disabled=busy; $('clear').disabled=busy; $('confirm').disabled=busy;
  const enabled=!busy&&$('confirm').checked&&plan.some(x=>x.status==='ready'&&x.checked);
  $('test').disabled=!enabled; $('fill').disabled=!enabled; $('stop').hidden=!busy;
}
function reset(){plan=[];target=null;$('list').replaceChildren();$('confirm').checked=false;buttons();}
function showContext(){const c=pack?.context;$('context').textContent=c?`${c.year}학년도 · ${c.grade}학년 ${c.classNumber}반 · ${c.semester}학기 · ${c.label} · ${pack.records.length}명`:'자동 입력 파일을 선택해 주세요.';}
function render(){
  $('list').replaceChildren();
  for(const item of plan){
    const r=pack.records.find(r=>r.number===item.number), div=document.createElement('div');div.className='record';
    const check=document.createElement('input');check.type='checkbox';check.checked=!!item.checked;check.disabled=busy||item.status!=='ready';check.onchange=()=>{item.checked=check.checked;buttons();};
    const label=document.createElement('label');label.append(check,` ${r.number}번 ${r.name}`);
    const small=document.createElement('small');small.textContent=labels[item.status]||item.status;
    const text=document.createElement('p');text.textContent=r.text;
    div.append(label,small,text);$('list').append(div);
  } buttons();
}
$('confirm').onchange=buttons;
$('file').onchange=async()=>{
  reset();pack=null;await chrome.storage.session.remove('package');showContext();
  try{const file=$('file').files[0];if(!file)return;if(file.size>2000000)throw Error('파일이 너무 큽니다. 앱에서 다시 내보내 주세요.');
    pack=validatePackage(JSON.parse(await file.text()));await chrome.storage.session.set({package:pack});showContext();status('나이스에서 해당 학급·과목을 조회한 뒤 화면 대조를 눌러 주세요.');
  }catch(e){pack=null;status(e.message);}buttons();
};
$('clear').onclick=async()=>{pack=null;reset();await chrome.storage.session.remove('package');$('file').value='';showContext();status('세션에서 기록을 지웠습니다. 다운로드한 파일은 별도로 삭제해 주세요.');};
$('scan').onclick=async()=>{
  reset();busy=true;buttons();
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab||!isNeisUrl(tab.url))throw Error('https://…neis.go.kr 나이스 입력 화면에서 확장 프로그램을 열어 주세요.');
    target={id:tab.id,url:tab.url};
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['engine.js']});
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:records=>globalThis.__ysNeis.scan(records),args:[pack.records]});
    let inputs=0;for(const f of frames)inputs+=f.result?.diagnostic?.editableTextareas||0;
    plan=pack.records.map(r=>{
      const found=frames.flatMap(f=>(f.result?.rows||[]).filter(x=>x.number===r.number&&x.status!=='missing').map(x=>({...x,documentId:f.documentId,frameId:f.frameId})));
      return found.length===1?{...found[0],checked:found[0].status==='ready'}:{number:r.number,status:found.length?'ambiguous':'missing',checked:false};
    });
    const ready=plan.filter(p=>p.status==='ready').length;
    status(`입력 가능 ${ready}명 / 전체 ${plan.length}명\n인식 가능한 입력칸 ${inputs}개. 기존 기록과 중복은 제외했습니다.\n`+(ready?'처음에는 1명만 채워 보고 나이스 바이트 표시와 문장을 확인해 주세요.':'일치하는 칸이 없으면 스크롤 후 다시 대조해 주세요. 계속 0명이면 이 화면 구조는 현재 버전에서 지원하지 않습니다. 좌표로 추측하여 입력하지 않습니다.'));
  }catch(e){plan=[];target=null;status('대조 실패: '+e.message+'\n다른 출처의 프레임이나 특수 입력 표는 지원되지 않을 수 있습니다.');}
  finally{busy=false;render();}
};
async function fill(firstOnly){
  if(busy||!target||!$('confirm').checked)return;
  const selected=plan.filter(p=>p.status==='ready'&&p.checked).slice(0,firstOnly?1:plan.length);
  busy=true;stopped=false;render();let count=0;
  try{
    for(const item of selected){
      if(stopped)break;
      const [active]=await chrome.tabs.query({active:true,currentWindow:true});
      if(active?.id!==target.id||active.url!==target.url)throw Error('탭 또는 주소가 변경되어 중지했습니다.');
      const results=await chrome.scripting.executeScript({target:{tabId:target.id,documentIds:[item.documentId]},func:token=>globalThis.__ysNeis?.fill(token)||{status:'stale'},args:[item.token]});
      item.status=results[0]?.result?.status||'unconfirmed';item.checked=false;
      if(item.status==='filled')count++;
      render();status(`${count}명 문장 채움 · 나이스 저장 전`);
      if(item.status!=='filled')throw Error('화면이 바뀌었거나 입력 반영을 확인하지 못해 중지했습니다. 나이스 내용을 확인하고 다시 대조해 주세요.');
    }
    status(`${count}명 문장 채움${stopped?' · 중지됨':''}. 나이스에 저장한 상태는 아닙니다.\n나이스의 문장·학생·바이트 표시를 확인하고 직접 저장해 주세요. 다음 화면은 스크롤 후 다시 대조해 주세요.`);
  }catch(e){status(`${count}명 문장 채움 · 저장 전\n${e.message}`);for(const p of plan)if(p.status==='ready'){p.status='stale';p.checked=false;}}
  finally{busy=false;$('confirm').checked=false;render();}
}
$('test').onclick=()=>fill(true);$('fill').onclick=()=>fill(false);$('stop').onclick=()=>{stopped=true;status('현재 학생 확인을 마친 뒤 멈춥니다.');};
(async()=>{try{const saved=await chrome.storage.session.get('package');if(saved.package)pack=validatePackage(saved.package);showContext();buttons();}catch{await chrome.storage.session.remove('package');}})();
