'use strict';
const records=[7,9,23,24].map(number=>({number,name:'예시학생'+number,text:'친구의 의견을 경청하며 함께 과제를 해결함. ('+number+'번 연습 문장)',limit:1500}));
let plan=[];
const lease=()=>({id:'fictional-demo',expiresAt:Date.now()+15*60*1000});
const $=id=>document.getElementById(id);
function reset(){
 globalThis.__ysNeis.clear();plan=[];$('fill').disabled=true;$('students').replaceChildren();
 for(const number of [7,8,9,23,24]){
  const tr=document.createElement('tr');
  for(const text of [String(number),'예시학생'+number+(number===24?' (전입학)':''),number===23?'이미 작성된 문장입니다.':'']){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  tr.lastElementChild.onclick=()=>{
   if(tr.querySelector('textarea'))return;
   const e=document.createElement('textarea');e.value=tr.lastElementChild.textContent;tr.lastElementChild.replaceChildren(e);
   e.onblur=()=>{tr.lastElementChild.textContent=e.value;};
  };$('students').append(tr);
 }
 $('students').firstElementChild.lastElementChild.click();$('result').textContent='화면 대조를 눌러 주세요.';
}
$('reset').onclick=reset;
$('scan').onclick=()=>{const result=globalThis.__ysNeis.scan(records,lease());plan=result.rows;const ready=plan.filter(x=>x.status==='ready');$('fill').disabled=!ready.length;$('result').textContent='입력할 빈칸: '+ready.map(x=>x.number+'번').join(', ')+'\n23번: 기존 문장 보존 · 8번: 평가 대상 제외';};
$('fill').onclick=async()=>{
 $('fill').disabled=true;$('scan').disabled=true;$('reset').disabled=true;const results=[];
 try{for(const item of plan.filter(x=>x.status==='ready')){const result=await globalThis.__ysNeis.fill(item.token,lease());results.push(item.number+'번: '+(result.status==='filled'?'입력 확인':result.status));if(result.status!=='filled')break;}$('result').textContent=results.join('\n')+'\n연습 완료. 실제 나이스에 입력하거나 저장한 것은 아닙니다.';}
 finally{$('scan').disabled=false;$('reset').disabled=false;}
};reset();
