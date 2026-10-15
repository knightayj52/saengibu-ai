/* Fictional cases only. Uses the production prompt/cleanup pipeline; never writes Sheets. */
const QualityTest = (() => {
  const STORAGE = 'sgb_qualityTest_v1', SUITE = 'elementary-12-v1';
  const rubric = ['평가 근거에 없는 활동·사건·성과를 만들지 않았는가', '도움을 받아·일부 등 수행 범위와 성취 수준을 보존했는가', '낮은 성취를 낙인찍거나 높은 성취로 과장하지 않았는가', '개인 특성이 있는 사례에서 학생 간 차이가 드러나는가', '관찰자 시점·명사형 종결과 자연스러운 문장인가', '같은 근거의 상·중·하 문장이 실제로 구별되는가'];
  const writing = ['경험한 일을 순서에 맞게 정리하고 생각과 느낌이 드러나도록 글을 씀.', '경험한 일을 순서에 맞게 간단한 글로 씀.', '교사의 도움을 받아 경험한 일의 일부를 짧은 문장으로 씀.'];
  const math = ['받아올림이 있는 두 자리 수의 덧셈을 계산하고 계산 과정을 설명함.', '받아올림이 있는 두 자리 수의 덧셈을 계산함.', '수 모형과 교사의 도움을 받아 받아올림이 있는 덧셈의 일부를 계산함.'];
  const item = (domain, texts, level) => ({domain, level: LEVELS[level], criteria: texts[level], above: texts.slice(0,level)});
  const subject = (id,title,group,items,trait='') => ({id,title,job:{kind:'subject',name:id,group,items,trait}});
  const cases = [
    ...writing.map((_,i)=>subject('write-'+i,'국어 · '+LEVELS[i],'국어',[item('쓰기',writing,i)])),
    ...math.map((_,i)=>subject('math-'+i,'수학 · '+LEVELS[i],'수학',[item('수와 연산',math,i)])),
    subject('mixed','국어 · 상·하 혼합','국어',[item('쓰기',writing,0),item('듣기', ['이야기의 주요 내용을 순서대로 설명함.','이야기의 주요 내용을 말함.','교사의 질문을 듣고 이야기의 일부 내용을 말함.'],2)]),
    subject('trait-a','같은 근거 · 소리 내어 확인','국어',[item('쓰기',writing,1)],'쓴 문장을 소리 내어 읽고 빠진 낱말을 찾아 고침.'),
    subject('trait-b','같은 근거 · 순서표 활용','국어',[item('쓰기',writing,1)],'쓸 일을 순서표에 먼저 적은 뒤 문장으로 옮김.'),
    {id:'activity',title:'창체 · 학급회의',job:{kind:'activity',name:'activity',group:'자율활동',trait:'',acts:[{actType:'자율활동',actName:'학급회의',actContent:'교실 정리 규칙에 대해 의견을 나누고 지킬 규칙을 정함.',memo:'친구의 의견을 듣고 정리 도구를 제자리에 두자는 의견을 말함.'}]}},
    {id:'behavior-positive',title:'행동특성 · 협력',job:{kind:'behavior',name:'behavior-positive',group:'',trait:'모둠 자료를 나눠 줄 때 빠진 친구가 있는지 확인함.',phrases:['[협력] 친구의 의견을 듣고 맡은 일을 끝까지 수행함.']}},
    {id:'behavior-growth',title:'행동특성 · 성장 지원',job:{kind:'behavior',name:'behavior-growth',group:'',trait:'교사의 안내를 듣고 준비물 목록을 보며 스스로 확인하려고 노력함.',phrases:['[생활습관] 준비물을 챙기는 데 도움이 필요한 경우가 있으나 확인하는 습관을 기르려고 노력함.']}}
  ];
  let data=null, running=false, stopped=false, controller=null, message='', storageError=false, lastRequest=0;
  try { const d=JSON.parse(localStorage.getItem(STORAGE)||'null'); if(d?.suite===SUITE&&Array.isArray(d.results)&&d.settings&&Array.isArray(d.attempts)) data=d; } catch (_) {}
  message=data?.lastError?.message || (data ? '보관된 테스트를 불러왔습니다. 남은 사례를 이어서 실행하거나 결과를 다운로드하세요.' : '');
  const copy=x=>JSON.parse(JSON.stringify(x));
  function clean(value,key='') { let s=JSON.stringify(value); if(key)s=s.split(key).join('[API 키 제외]'); s=s.replace(/AIza[\w-]{20,}/g,'[API 키 제외]'); return JSON.parse(s); }
  function save() { try { localStorage.setItem(STORAGE,JSON.stringify(data)); storageError=false; } catch (_) { storageError=true; } }
  function checks(text,guard,spec) { const byte=_getByteSize(text); return {style:_detectStyleIssues(text),levelWords:findLevelWords(text,guard),byte,characters:text.length,targetMinByte:spec.minByte,targetMaxByte:spec.maxByte,length:byte<spec.minByte?'목표보다 짧음':byte>spec.maxByte?'목표보다 김':'목표 범위',meaning:'자동 판정하지 않음 — 평가 근거와 대조 필요'}; }
  function fresh() {
    const s=State.settings;
    data={format:'saengibu-ai-quality',version:1,suite:SUITE,appVersion:CONFIG.VERSION,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),settings:{model:resolveModel(s.model),tier:s.tier,length:s.length,level:'초등학교',closing:copy(s.closing)},promptBasis:'앱 기본 지침(V9_DATA.basePrompt); 학급 시트의 맞춤 지침은 사용하지 않음',cases:copy(cases),rubric:copy(rubric),results:[],attempts:[],lastError:null};
    save();
  }
  function exported() { return data ? copy(data) : null; }
  function download() {
    if(!data)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(exported(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='생기부_AI품질테스트_'+data.startedAt.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function wait(ms) { const until=Date.now()+ms; while(Date.now()<until){if(stopped)throw Error('사용자가 중지했습니다.');await new Promise(r=>setTimeout(r,Math.min(200,until-Date.now())));} }
  function paintProgress(){const n=$('qualityProgress');if(n)n.textContent=message;const c=$('qualityCount');if(c)c.textContent=`완료 ${data?.results.length||0}/${cases.length}개 · 생성·교정 호출 기록 ${data?.attempts.length||0}건`;}
  async function run() {
    if(running||GEN.running||RV.running||RV.busyKey)return;
    const key=LS.get('geminiKey')||'';
    if(!key){toast('설정에서 API 키를 저장한 뒤 시작해 주세요.',6000);return;}
    // Pending production edits are completed before starting, not discarded.
    try { await Saver.drain(); } catch(e){toast(e.message,6000);return;}
    if(!data)fresh();
    if(data.appVersion!==CONFIG.VERSION){message='앱 버전이 바뀌었습니다. 이전 결과를 다운로드한 뒤 새 테스트를 시작해 주세요.';render();return;}
    running=true;stopped=false;data.lastError=null;lastRequest=0;message='가상 사례로 실제 Gemini 응답을 생성합니다.';render();
    try {
      for(const c of cases){
        if(data.results.some(r=>r.id===c.id))continue;
        if(stopped)break;
        const bp=buildPrompt(c.job,V9_DATA.basePrompt,data.settings);
        const startAttempt=data.attempts.length, started=Date.now();
        const retry=async(prompt,unused,temp)=>{
          if(stopped)throw Error('사용자가 중지했습니다.');
          const interval=data.settings.tier==='유료'?1500:8000;
          const remaining=interval-(Date.now()-lastRequest);
          if(remaining>0){message=c.title+' · 호출 간격을 두고 기다리는 중…';paintProgress();await wait(remaining);}
          if(stopped)throw Error('사용자가 중지했습니다.');
          message=c.title+' · Gemini 응답 대기 중…';paintProgress();
          controller=new AbortController();let timedOut=false;
          const timeout=setTimeout(()=>{timedOut=true;controller?.abort();},60000);
          const attempt={caseId:c.id,at:new Date().toISOString(),prompt,temperature:temp??0.8};
          data.attempts.push(clean(attempt,key));save();lastRequest=Date.now();
          let out;
          try{out=await geminiOnce(prompt,temp,{apiKey:key,model:data.settings.model,noUsageWrite:true,signal:controller.signal});}
          finally{clearTimeout(timeout);controller=null;}
          Object.assign(data.attempts[data.attempts.length-1],clean({response:out,elapsedMs:Date.now()-lastRequest},key));save();paintProgress();
          if(stopped)throw Error('사용자가 중지했습니다.');
          if(timedOut)throw Error('응답 대기 60초를 넘겨 중지했습니다. 이어서 실행할 수 있습니다.');
          if(!out.success)throw Error(out.rate?'API 사용 한도에 도달했습니다. 시간이 지난 뒤 이어서 실행해 주세요.':out.error||'응답을 받지 못했습니다.');
          return out;
        };
        const out=await generateWithLengthControl(bp.prompt,bp.lenSpec.minByte,bp.lenSpec.maxByte,bp.lenSpec.targetChars,bp.guard,{retry,report:msg=>{message=c.title+' · '+msg;paintProgress();}});
        if(stopped)break;
        if(!out.success)throw Error(out.error);
        data.results.push(clean({id:c.id,title:c.title,text:out.text,adjusted:out.adjusted,checks:checks(out.text,bp.guard,bp.lenSpec),firstAttempt:startAttempt,lastAttempt:data.attempts.length-1,elapsedMs:Date.now()-started},key));
        data.updatedAt=new Date().toISOString();save();render();
      }
      message=stopped?'중지했습니다. 완료한 사례는 보관했습니다.':`가상 사례 ${data.results.length}개 생성을 마쳤습니다. 결과 파일을 다운로드해 검토를 요청해 주세요.`;
    } catch(e){data.lastError=clean({at:new Date().toISOString(),message:e.message},key);message=data.lastError.message;}
    finally{running=false;data.updatedAt=new Date().toISOString();save();render();}
  }
  function stop(){stopped=true;controller?.abort();message='중지하는 중… 완료한 사례는 유지됩니다.';paintProgress();}
  function reset(){if(running)return;if(data&&!confirm('보관한 테스트 결과를 지우고 새로 시작할까요? 필요한 결과는 먼저 다운로드하세요.'))return;data=null;localStorage.removeItem(STORAGE);message='현재 모델·분량 설정으로 새 테스트를 시작할 수 있습니다.';render();}
  function render(){
    const root=$('v-quality');if(!root)return;root.textContent='';
    const card=el('div',{class:'card'});const settings=data?.settings||{...State.settings,level:'초등학교'};
    card.append(el('h2',{text:'실제 Gemini로 가상 사례 12개 생성'}),el('p',{text:'초등학교용 평가 근거만 사용합니다. 학생명단과 학급 기록은 읽지 않으며, 테스트 결과와 호출 기록은 이 브라우저에 보관합니다. 학급 시트에 결과나 사용 횟수를 쓰지 않습니다.'}),el('p',{text:'앱의 기본 지침과 실제 생성·교정 과정을 사용합니다. 학급 시트에서 수정한 맞춤 지침은 포함하지 않습니다. 문체·분량 자동 검사만으로 생기부에 적합하다고 판정하지 않습니다.'}),el('p',{text:`모델: ${resolveModel(settings.model)} · 요금제 설정: ${settings.tier} · 분량: ${settings.length} · 학교급: 초등학교`}),el('p',{class:'muted',text:'사례당 교정 과정에서 여러 번 호출될 수 있으며 실제 API 사용량이 발생합니다. 무료 한도에 걸리면 멈추고, 완료한 사례를 제외한 나머지부터 이어갑니다. 이어하기는 이 테스트를 시작한 모델·분량을 유지합니다.'}));
    const controls=el('div',{class:'row'});
    const done=data?.results.length===cases.length;
    controls.append(el('button',{type:'button',class:'btn',text:running?'실행 중…':done?'12개 생성 완료':data?'남은 사례 이어서 실행':'실제 AI 테스트 시작',disabled:running||done||!LS.get('geminiKey'),onclick:run}),el('button',{type:'button',class:'btn danger',text:'중지',hidden:!running,onclick:stop}),el('button',{type:'button',class:'btn line',text:'결과 파일 다운로드',disabled:!data,onclick:download}),el('button',{type:'button',class:'btn line',text:'새 테스트',disabled:running,onclick:reset}));
    card.append(controls,el('p',{id:'qualityCount','aria-live':'polite'}),el('p',{id:'qualityProgress',role:'status'}));
    if(!LS.get('geminiKey'))card.append(el('p',{text:'API 키가 없습니다. 설정에 키를 저장해 주세요.'}));
    card.append(el('button',{type:'button',class:'btn line sm',text:'모델·API 키 설정으로',disabled:running,onclick:()=>show('settings')}));
    if(storageError)card.append(el('p',{class:'msg err',text:'브라우저에 결과를 보관하지 못했습니다. 화면을 닫기 전에 결과 파일을 다운로드해 주세요.'}));
    if(data?.appVersion!==undefined&&data.appVersion!==CONFIG.VERSION)card.append(el('p',{text:'이전 앱 버전의 결과입니다. 새 테스트를 시작해 주세요.'}));
    root.append(card);paintProgress();
    const review=el('div',{class:'card'});review.append(el('h3',{text:'생성 후 확인할 기준'}));rubric.forEach(t=>review.append(el('p',{text:'• '+t})));root.append(review);
    const list=el('div',{class:'card'});list.append(el('h3',{text:'가상 사례와 결과'}));
    cases.forEach(c=>{const result=data?.results.find(r=>r.id===c.id);const details=el('details',{style:'padding:12px 0;border-bottom:1px solid var(--line)'});details.append(el('summary',{text:c.title+(result?' · 생성 완료':' · 대기')}));
      const j=c.job,source=j.kind==='subject'?j.items.map(i=>'['+i.level+'] '+i.criteria):j.kind==='activity'?j.acts.map(a=>a.actName+': '+a.actContent+' '+a.memo):j.phrases;
      source.concat(j.trait?['개인 특성: '+j.trait]:[]).forEach(t=>details.append(el('p',{text:t})));
      if(result){details.append(el('p',{text:result.text}),el('p',{class:'muted',text:result.checks.byte+' byte · '+result.checks.length+' · 문체 지적 '+result.checks.style.length+'개 · 수준 표현 지적 '+result.checks.levelWords.length+'개'}));}list.append(details);});root.append(list);
  }
  return {render,run,stop,download,reset,get running(){return running;}};
})();
