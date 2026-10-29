/* 0.2: learn an editable column from a real student cell, then activate it row by row. */
(() => {
  if(globalThis.__ysNeis?.version==='0.4.0') return;
  globalThis.__ysNeis?.clear?.();
  const tickets=new Map();let calibration=null, writing=false, generation=0, sessionId=null, expiresAt=0, expiryTimer=null;
  function clear(){generation++;tickets.clear();calibration=null;sessionId=null;expiresAt=0;clearTimeout(expiryTimer);return {cleared:true};}
  function renew(lease){
    if(!lease||typeof lease.id!=='string'||!Number.isFinite(lease.expiresAt)||lease.expiresAt<=Date.now()||lease.expiresAt>Date.now()+15*60*1000+1000)return false;
    if(sessionId&&sessionId!==lease.id)return false;
    sessionId=lease.id;expiresAt=lease.expiresAt;clearTimeout(expiryTimer);expiryTimer=setTimeout(clear,Math.max(0,expiresAt-Date.now()));return true;
  }
  addEventListener('pagehide',clear);
  if(typeof chrome!=='undefined'&&chrome.runtime?.onMessage)chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(sender.id!==chrome.runtime.id||m?.type!=='YS_NEIS_CLEAR')return;
    if(m.sessionId===sessionId)clear();reply({ok:true});
  });
  const ROW='tr,[role="row"]', CELL='td,[role="gridcell"],[role="cell"]';
  const norm=s=>String(s||'').replace(/\s/g,'');
  // Only the confirmed trailing transfer annotation is ignored; never use partial names.
  const studentName=s=>norm(s).replace(/(?:\(전입학\)|（전입학）)$/, '');
  const sameName=(actual,expected)=>!!studentName(expected)&&studentName(actual)===studentName(expected);
  const visible=e=>!!e?.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const editable=e=>e instanceof HTMLTextAreaElement&&visible(e)&&!e.disabled&&!e.readOnly;
  const cells=row=>Array.from(row.querySelectorAll(CELL)).filter(c=>c.closest(ROW)===row);
  const tableOf=row=>row.closest('table,[role="grid"],[role="table"]');
  const rowsOf=table=>Array.from(table.querySelectorAll(ROW)).filter(row=>tableOf(row)===table&&visible(row));
  const plain=c=>!c.querySelector('textarea,input:not([type="checkbox"]),select');
  const editors=cell=>Array.from(cell.querySelectorAll('textarea')).filter(editable);
  function identity(row,r,c){
    const cs=cells(row);
    return visible(row)&&cs.length===c.count&&plain(cs[c.nameCol])&&plain(cs[c.numCol])&&sameName(cs[c.nameCol].textContent,r.name)&&/^\d+$/.test(norm(cs[c.numCol].textContent))&&Number(norm(cs[c.numCol].textContent))===r.number;
  }
  function ancestorContext(){
    const out=[];let w=window;
    try{while(w.parent!==w){w=w.parent;out.push(globalThis.NeisContext?.capture(w.document).signature||'');}}catch{out.push('inaccessible');}
    return out;
  }
  const fingerprint=()=>JSON.stringify([location.href,ancestorContext(),
    Array.from(document.querySelectorAll('select,input:not([type="checkbox"]):not([type="radio"]):not([type="password"]):not([type="hidden"]),input[type="radio"]:checked,[role="combobox"],.w2selectbox')).filter(e=>visible(e)&&!e.closest(ROW)).map(e=>[e.id,e.value??e.textContent]),
    Array.from(document.querySelectorAll('h1,h2,[role="tab"][aria-selected="true"]')).filter(visible).map(e=>e.textContent)]);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function learn(records){
    const options=[];
    for(const e of Array.from(document.querySelectorAll('textarea')).filter(editable)){
      const row=e.closest(ROW), cell=e.closest(CELL);if(!row||!cell)continue;
      const table=tableOf(row), cs=cells(row);if(!table||!cs.includes(cell))continue;
      for(const r of records){
        const nameCols=cs.map((x,i)=>plain(x)&&sameName(x.textContent,r.name)?i:-1).filter(i=>i>=0);
        const numCols=cs.map((x,i)=>plain(x)&&/^\d+$/.test(norm(x.textContent))&&Number(norm(x.textContent))===r.number?i:-1).filter(i=>i>=0);
        if(nameCols.length!==1||numCols.length!==1||nameCols[0]===numCols[0])continue;
        const col=cs.indexOf(cell);if(col===nameCols[0]||col===numCols[0])continue;
        const c={generation,table,col,nameCol:nameCols[0],numCol:numCols[0],count:cs.length,context:fingerprint()};
        if(!options.some(x=>x.table===table&&x.col===col&&x.nameCol===c.nameCol&&x.numCol===c.numCol&&x.count===c.count))options.push(c);
      }
    }
    return options.length===1?options[0]:null;
  }
  function locate(c,r){return rowsOf(c.table).filter(row=>identity(row,r,c));}
  function state(cell,r){
    if(cell.querySelector('button,a,input:not([type="checkbox"]),select,[role="button"]'))return 'ambiguous';
    const all=Array.from(cell.querySelectorAll('textarea'));
    if(all.some(e=>e.disabled||e.readOnly))return 'locked';
    if(all.length>1)return 'ambiguous';
    const text=all.length?all[0].value:cell.textContent;
    if(norm(text))return norm(text)===norm(r.text)?'same':'occupied';
    if(all[0]?.maxLength>=0&&r.text.length>all[0].maxLength)return 'tooLong';
    return 'ready';
  }
  function scroller(c){
    for(let e=c.table.parentElement;e&&e!==document.body;e=e.parentElement){
      if(e.scrollHeight>e.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(e).overflowY))return e;
    }
    const e=document.scrollingElement;
    return e&&e.scrollHeight>e.clientHeight+4?e:null;
  }
  const valid=c=>{
    if(Date.now()>=expiresAt){clear();return false;}
    return c.generation===generation&&visible(c.table)&&fingerprint()===c.context;
  };
  async function find(c,r){
    if(!valid(c))return {status:'stale'};
    let found=locate(c,r);
    if(found.length>1)return {status:'ambiguous'};
    if(found.length===1)return {row:found[0]};
    const scroll=scroller(c);if(!scroll)return {status:'missing'};
    // Bounded search; never infer student identity from row order or scroll distance.
    scroll.scrollTop=0;scroll.dispatchEvent(new Event('scroll'));await wait(220);
    for(let n=0;n<45;n++){
      if(!valid(c))return {status:'stale'};
      found=locate(c,r);
      if(found.length>1)return {status:'ambiguous'};
      if(found.length===1)return {row:found[0]};
      const old=scroll.scrollTop, step=Math.max(60,Math.floor(scroll.clientHeight*.7));
      scroll.scrollTop=Math.min(old+step,scroll.scrollHeight-scroll.clientHeight);
      scroll.dispatchEvent(new Event('scroll'));await wait(220);
      if(scroll.scrollTop===old)break;
    }
    return {status:'missing'};
  }
  async function resolveEditor(c,r){
    let found=await find(c,r);if(!found.row)return found;
    let cell=cells(found.row)[c.col];
    const before=state(cell,r);if(before!=='ready')return {status:before};
    cell.scrollIntoView({block:'nearest',inline:'nearest'});await wait(100);
    if(!valid(c))return {status:'stale'};
    let rows=locate(c,r);if(rows.length!==1)return {status:'stale'};
    cell=cells(rows[0])[c.col];if(state(cell,r)!=='ready')return {status:'stale'};
    let ed=editors(cell);
    if(!ed.length){
      for(const type of ['mousedown','mouseup','click'])cell.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));
      for(let i=0;i<8;i++){
        await wait(100);if(!valid(c))return {status:'stale'};
        rows=locate(c,r);if(rows.length!==1)return {status:'stale'};
        cell=cells(rows[0])[c.col];ed=editors(cell);if(ed.length)break;
      }
    }
    if(ed.length!==1)return {status:'activationFailed'};
    const check=state(cell,r);if(check!=='ready')return {status:check};
    return {cell,e:ed[0],row:rows[0]};
  }
  globalThis.__ysNeis={version:'0.4.0',
    clear,
    scan(records,lease){
      if(writing)return {rows:[],diagnostic:{busy:true}};
      clear();if(!renew(lease))return {rows:[],diagnostic:{expired:true}};
      calibration=learn(records);
      const diagnostic={editableTextareas:Array.from(document.querySelectorAll('textarea')).filter(editable).length,calibrated:!!calibration};
      const rows=records.map(r=>{
        if(!calibration)return {number:r.number,status:'missing'};
        const found=locate(calibration,r);
        const status=found.length>1?'ambiguous':found.length?state(cells(found[0])[calibration.col],r):'pending';
        if(!['ready','pending'].includes(status))return {number:r.number,status};
        const token=crypto.randomUUID();tickets.set(token,{r:{...r},c:calibration});
        return {number:r.number,status,token};
      });return {rows,diagnostic};
    },
    async fill(token,lease){
      if(Date.now()>=expiresAt){clear();return {status:'expired'};}
      if(!renew(lease))return {status:'expired'};
      if(writing)return {status:'stale'};
      const ticket=tickets.get(token);tickets.delete(token);if(!ticket)return {status:'stale'};
      writing=true;
      try{
        const {r,c}=ticket;const result=await resolveEditor(c,r);if(result.status)return result;
        const {e,cell,row}=result;e.focus();
        if(!valid(c)||!editable(e)||e.closest(CELL)!==cell||!identity(row,r,c)||e.value.trim())return {status:'stale'};
        if(e.maxLength>=0&&r.text.length>e.maxLength)return {status:'tooLong'};
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,r.text);
        e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();await wait(250);
        if(!valid(c))return {status:'unconfirmed'};
        const rows=locate(c,r);if(rows.length!==1)return {status:'unconfirmed'};
        const newCell=cells(rows[0])[c.col];
        const fields=Array.from(newCell.querySelectorAll('textarea'));
        const value=fields.length===1?fields[0].value:fields.length?'':newCell.textContent;
        if(norm(value)!==norm(r.text))return {status:'unconfirmed'};
        return {status:'filled'}; // DOM only: the teacher must verify and Save in NEIS.
      }catch{return {status:'unconfirmed'};}finally{writing=false;}
    }
  };
})();
