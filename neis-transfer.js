/* Local communication only: no student records are sent to a server. */
function neisExtensionRequest(type, data) {
  return new Promise((resolve,reject)=>{
    const requestId=crypto.randomUUID();
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
    const receive=e=>{
      if(e.source!==window||e.origin!==location.origin||e.data?.source!=='ys-neis-extension'||e.data.requestId!==requestId)return;
      cleanup(); const result=e.data.result;
      if(result?.ok)resolve(result);else reject(Error(result?.error||'확장프로그램 응답을 확인하지 못했습니다.'));
    };
    const timer=setTimeout(()=>{cleanup();reject(Error('연결을 확인하지 못했습니다. Chrome 웹 스토어에서 입력 도우미를 설치하고 같은 크롬 프로필에서 생기부 앱을 새로고침해 주세요. JSON 파일 방식도 사용할 수 있습니다.'));},2500);
    window.addEventListener('message',receive);
    window.postMessage({source:'ys-neis-app',requestId,type,package:data},location.origin);
  });
}
/* 학급 설정만 브라우저 세션에 유지. 학생 이름·문장은 저장하지 않음. */
function neisTransferDefaults(now = new Date()) {
  const month = now.getMonth(), year = now.getFullYear() - (month < 2 ? 1 : 0);
  const semester = month < 2 || month >= 8 ? '2' : '1';
  const classInfo = State.settings.classInfo || '';
  const match = classInfo.match(/(\d+)\s*학년\s*(\d+)\s*반/);
  const scope = [State.sheet.id, year, semester, classInfo].join('|');
  let saved = null;
  try { saved = JSON.parse(SS.get('neisTransferContext') || 'null'); } catch (_) {}
  return Object.assign({ scope, year: String(year), grade: match ? match[1] : '', classNumber: match ? match[2] : '', semester, category: '' }, saved && saved.scope === scope ? saved : {});
}
/* NEIS transfer v1. No credentials or spreadsheet IDs leave the app. */
function makeNeisTransferPanel(items, cats) {
  const defaults = neisTransferDefaults();
  const box = el('details', {open:true,style:'margin:16px 0;padding:16px;border:1px solid var(--line,#ddd);border-radius:16px'});
  box.append(el('summary', {text:'나이스 자동 입력 준비 · BETA',style:'cursor:pointer;font-weight:700'}));
  box.append(el('p',{text:'한 과목·영역씩 검토한 결과를 확장프로그램으로 바로 보낼 수 있습니다. JSON 파일 없이 같은 크롬에서 이어서 입력하세요. 확장 프로그램이 번호·이름을 대조한 뒤 빈 입력란을 채웁니다. 나이스 최종 저장은 직접 해 주세요. 실제 나이스 호환성 확인이 필요한 시험 버전입니다.'}));
  box.append(el('div',{class:'row',style:'display:flex;gap:10px;flex-wrap:wrap'},[
    el('a',{class:'btn',href:'https://chromewebstore.google.com/detail/mgfgocnidkjbinbeplgodgiofidlalfc?hl=ko',target:'_blank',rel:'noopener noreferrer',text:'나이스 입력 도우미 설치 ↗'}),
    el('a',{class:'btn line',href:'neis-guide.html',target:'_blank',rel:'noopener',text:'처음 사용하는 선생님 안내'})
  ]));
  box.append(el('p',{text:'처음 한 번: 설치 페이지에서 Chrome에 추가 → 확장 프로그램 추가 → 이 앱 새로고침 → 연결 확인. PC용 크롬에서 사용하며, 설치는 사용자가 직접 승인합니다.'}));
  const connection=el('p',{'aria-live':'polite',text:'확장프로그램 연결을 확인해 주세요.'});
  const check=el('button',{type:'button',class:'btn',text:'연결 확인'});
  check.onclick=async()=>{check.disabled=true;try{const r=await neisExtensionRequest('YS_NEIS_PING');connection.textContent='연결됨 · 버전 '+r.version;}catch(e){connection.textContent=e.message;}finally{check.disabled=false;}};
  box.append(connection,check);
  if(!items.length){box.append(el('p',{text:'설치는 먼저 해 두셔도 됩니다. 문장 생성과 검토를 마친 뒤 이 화면에서 과목·영역을 선택하여 보내세요.'}));return box;}
  box.append(el('p',{text:'사용 순서: 문장 검토 → 나이스로 보내기 → 나이스에서 학생 한 명의 입력칸 클릭 → 확장프로그램에서 대조·입력 → 나이스에서 직접 저장.'}));
  const form = el('form',{style:'display:flex;gap:12px;flex-wrap:wrap;align-items:end'});
  function field(label, input) { form.append(el('label',{},[el('span',{text:label,style:'display:block;margin-bottom:6px'}),input])); return input; }
  const year = field('학년도',el('input',{type:'number',min:2000,max:2100,required:true,value:defaults.year,style:'width:100px'}));
  const grade = field('학년',el('input',{type:'number',min:1,max:12,required:true,value:defaults.grade,style:'width:75px'}));
  const cls = field('반',el('input',{type:'number',min:1,max:99,required:true,value:defaults.classNumber,style:'width:75px'}));
  const semester = field('학기',el('select',{},[el('option',{value:'1',text:'1학기'}),el('option',{value:'2',text:'2학기'})]));
  const cat = field('과목·영역',el('select',{}));
  cats.forEach(c=>cat.append(el('option',{value:c,text:c})));
  semester.value = defaults.semester;
  if (cats.includes(defaults.category)) cat.value = defaults.category;
  box.append(el('p',{text:'학년·반은 앱 설정에서, 학년도·학기는 현재 날짜를 기준으로 채웠습니다. 이전 학기 작업이라면 바꿔 주세요. 이 브라우저 세션에서는 직접 바꾼 값을 유지합니다.'}));
  const count = el('p', {'aria-live':'polite'});
  const paintCount = () => { count.textContent = cat.value + ' · 전송 대상 ' + items.filter(it=>it.cat===cat.value).length + '명'; };
  paintCount(); box.append(count);
  const reviewed=el('input',{type:'checkbox',required:true});
  form.append(el('label',{},[reviewed,' 문장과 학급 정보를 검토했으며, 학생 이름·번호·문장을 이 크롬의 확장프로그램 세션 메모리에 전달하여 나이스 입력에 사용하는 데 동의합니다.']));
  const remember = () => {
    SS.set('neisTransferContext',JSON.stringify({scope:defaults.scope,year:year.value,grade:grade.value,classNumber:cls.value,semester:semester.value,category:cat.value}));
    reviewed.checked=false; paintCount();
  };
  [year,grade,cls,semester,cat].forEach(input=>input.addEventListener('input',remember));
  [semester,cat].forEach(input=>input.addEventListener('change',remember));
  const send=el('button',{type:'submit',class:'btn',text:'나이스로 보내기'});
  const download=el('button',{type:'submit',class:'btn',text:'JSON 파일 받기 (외부 접속용)'});
  form.append(send,download);
  const status=el('p',{'aria-live':'polite'});
  form.onsubmit = async e => {
    e.preventDefault();
    if(!form.reportValidity())return;
    send.disabled=true;download.disabled=true;
    try {
      const selected = items.filter(it=>it.cat===cat.value), nums=new Set();
      const records=selected.map(it=>{
        const students=State.data.list.filter(s=>s.name===it.name);
        if(students.length!==1) throw Error(it.name+': 명단에서 이름이 중복되거나 번호를 찾을 수 없습니다. 학생명단을 확인해 주세요.');
        const number=Number(students[0].num);
        if(!Number.isInteger(number)||number<1||nums.has(number)) throw Error('학생 번호 누락 또는 중복: '+it.name);
        nums.add(number);
        const limit=_getNeisByteLimit(null,it.kind);
        if(_getByteSize(it.text)>limit) throw Error(it.name+': 문장이 앱의 바이트 한도를 초과합니다. 먼저 줄여 주세요.');
        return {number,name:it.name,text:it.text,limit};
      });
      if(!records.length) throw Error('내보낼 결과가 없습니다.');
      const data={format:'saengibu-neis',version:1,context:{year:Number(year.value),grade:Number(grade.value),classNumber:Number(cls.value),semester:Number(semester.value),kind:selected[0].kind,group:selected[0].group||'행동특성 및 종합의견',label:cat.value},records};
      if(e.submitter!==download){
        const result=await neisExtensionRequest('YS_NEIS_SEND',data);
        status.textContent=result.count+'명 기록을 이 크롬의 입력 도우미에 전달했습니다. 아직 나이스에 입력되지 않았습니다. 나이스에서 입력칸을 클릭한 뒤 확장프로그램을 열어 화면 대조 → 확인 → 입력을 진행해 주세요. 15분 안에 대조·입력을 시작해 주세요. 대조·입력 시 보관 기한이 15분 연장되며, 만료되면 다시 보내야 합니다. 작업 후에는 확장프로그램에서 기록을 지워 주세요.';
        return;
      }
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url; a.download='나이스자동입력_'+data.context.grade+'학년_'+data.context.classNumber+'반_'+data.context.group.replace(/[^가-힣a-zA-Z0-9_-]/g,'_')+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent=records.length+'명 파일을 만들었습니다. 학생 기록이 포함되므로 사용 후 파일을 정리해 주세요. 나이스 입력·저장 완료 표시는 변경하지 않았습니다.';
    } catch(err) { status.textContent=err.message; } finally {send.disabled=false;download.disabled=false;}
  };
  box.append(form,status,el('a',{href:'neis-privacy.html',target:'_blank',rel:'noopener',text:'개인정보 처리 안내',style:'margin-right:16px'}),el('a',{href:'neis-guide.html',target:'_blank',rel:'noopener',text:'설치 및 사용 안내',style:'margin-right:16px'}));
  return box;
}

