'use strict';
// Conservative, labelled controls only. Unknown values require explicit teacher review.
globalThis.NeisContext = globalThis.NeisContext || (()=>{
  const labels={year:'학년도',grade:'학년',classNumber:'반',semester:'학기',group:'과목·영역'};
  const norm=s=>String(s||'').replace(/\s/g,'').replace(/[·ㆍ]/g,'');
  function field(s){s=norm(s).replace(/[:：*]/g,'');return ({학년도:'year',학년:'grade',반:'classNumber',학급:'classNumber',학기:'semester',과목:'group',교과:'group',영역:'group',활동영역:'group',과목영역:'group'})[s];}
  function value(key,s){
    s=String(s||'').trim();if(key==='group')return s&&!/^(선택|전체|과목선택|영역선택|--.*--)$/.test(norm(s))?norm(s):null;
    const unit={year:'학년도|년',grade:'학년',classNumber:'반',semester:'학기'}[key];
    const m=s.match(new RegExp('^\\s*(\\d{1,4})\\s*(?:'+unit+')?\\s*$'));
    return m?Number(m[1]):null;
  }
  function capture(doc=document){
    const view=doc.defaultView;
    const labelText=e=>{if(!e)return '';const copy=e.cloneNode(true);copy.querySelectorAll('select,input,textarea,[role="combobox"]').forEach(c=>c.remove());return copy.textContent;};
    const fields=Object.fromEntries(Object.keys(labels).map(k=>[k,[]]));
    const visible=e=>e.getClientRects().length>0&&view.getComputedStyle(e).visibility!=='hidden'&&view.getComputedStyle(e).display!=='none';
    for(const e of doc.querySelectorAll('select,input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),[role="combobox"]')){
      if(!visible(e))continue;
      const names=[...(e.labels||[])].map(labelText);
      names.push(e.getAttribute('aria-label'),e.getAttribute('title'));
      const labelled=e.getAttribute('aria-labelledby');if(labelled)names.push(...labelled.split(/\s+/).map(id=>labelText(doc.getElementById(id))));
      const keys=[...new Set(names.map(field).filter(Boolean))];if(keys.length!==1)continue;
      const k=keys[0], text=e.tagName==='SELECT'?e.selectedOptions[0]?.textContent:e.value??e.textContent, v=value(k,text);
      if(v!==null&&!fields[k].includes(v))fields[k].push(v);
    }
    return {fields,signature:JSON.stringify([doc.location.href,fields,Array.from(doc.querySelectorAll('h1,h2,[role="tab"][aria-selected="true"]')).filter(visible).map(e=>e.textContent)])};
  }
  function compare(snapshots,context){
    return Object.keys(labels).map(key=>{
      const actual=[...new Set(snapshots.flatMap(s=>s.fields[key]||[]))];
      const expected=key==='group'?norm(context.group):context[key];
      return {key,label:labels[key],expected:context[key],actual,status:actual.length>1?'ambiguous':actual.length===0?'unknown':actual[0]===expected?'match':'mismatch'};
    });
  }
  return {capture,compare};
})();
if(typeof module!=='undefined')module.exports=NeisContext;
