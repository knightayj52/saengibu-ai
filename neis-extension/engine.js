/* Runs in an isolated world. Never calls NEIS private APIs or Save. */
(() => {
  if(globalThis.__ysNeis) return;
  const tickets=new Map();
  const norm=s=>String(s||'').replace(/\s/g,'');
  const visible=e=>e.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
  const editable=e=>e instanceof HTMLTextAreaElement&&visible(e)&&!e.disabled&&!e.readOnly;
  const cells=row=>Array.from(row.querySelectorAll('td,[role="gridcell"],[role="cell"]')).filter(c=>c.closest('tr,[role="row"]')===row&&!c.querySelector('textarea,input:not([type="checkbox"]),select'));
  const matches=(row,r)=> {
    if(!row||!visible(row)) return false;
    const cs=cells(row);
    return cs.some(c=>norm(c.textContent)===norm(r.name))&&cs.some(c=>{
      const t=norm(c.textContent); return /^\d+$/.test(t)&&Number(t)===r.number;
    });
  };
  const fingerprint=()=>JSON.stringify([location.href,Array.from(document.querySelectorAll('select,input:not([type="checkbox"]):not([type="radio"]),input[type="radio"]:checked')).filter(visible).map(e=>[e.id,e.value]),Array.from(document.querySelectorAll('h1,h2,[role="tab"][aria-selected="true"]')).filter(visible).map(e=>e.textContent)]);
  globalThis.__ysNeis={
    scan(records) {
      tickets.clear();
      const fields=Array.from(document.querySelectorAll('textarea')).filter(editable);
      const context=fingerprint();
      const rows=records.map(r=>{
        const found=fields.filter(e=>matches(e.closest('tr,[role="row"]'),r));
        if(!found.length) return {number:r.number,status:'missing'};
        if(found.length!==1) return {number:r.number,status:'ambiguous'};
        const e=found[0], row=e.closest('tr,[role="row"]');
        // One record field per row only; multiple columns must never be guessed.
        if(Array.from(row.querySelectorAll('textarea')).filter(editable).length!==1) return {number:r.number,status:'ambiguous'};
        if(e.value.trim()) return {number:r.number,status:e.value===r.text?'same':'occupied'};
        if(e.maxLength>=0&&r.text.length>e.maxLength) return {number:r.number,status:'tooLong'};
        const token=crypto.randomUUID();
        tickets.set(token,{e,row,r:{...r},context,before:e.value});
        return {number:r.number,status:'ready',token};
      });
      return {rows,diagnostic:{editableTextareas:fields.length,rows:document.querySelectorAll('tr,[role="row"]').length}};
    },
    async fill(token) {
      const t=tickets.get(token); tickets.delete(token);
      if(!t) return {status:'stale'};
      const {e,row,r}=t;
      if(fingerprint()!==t.context||!editable(e)||e.closest('tr,[role="row"]')!==row||!matches(row,r)||e.value!==t.before) return {status:'stale'};
      if(Array.from(row.querySelectorAll('textarea')).filter(editable).length!==1) return {status:'stale'};
      e.focus();
      // Focus can activate/recycle editors in virtual grids: verify again.
      if(!editable(e)||!matches(row,r)||e.value!==t.before||fingerprint()!==t.context) return {status:'stale'};
      const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
      setter.call(e,r.text);
      e.dispatchEvent(new Event('input',{bubbles:true}));
      e.dispatchEvent(new Event('change',{bubbles:true}));
      e.blur();
      await new Promise(resolve=>setTimeout(resolve,250));
      if(!e.isConnected||!matches(row,r)||e.value!==r.text) return {status:'unconfirmed'};
      return {status:'filled'}; // DOM value only, never means persisted to NEIS.
    }
  };
})();
