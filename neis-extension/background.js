'use strict';
importScripts('core.js');
function allowedSender(sender) {
  try { const u=new URL(sender.url); return sender.id===chrome.runtime.id && sender.frameId===0 && u.origin==='https://knightayj52.github.io' && u.pathname.startsWith('/saengibu-ai/'); } catch { return false; }
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(!allowedSender(sender))return;
  if(message?.type==='YS_NEIS_PING'){reply({ok:true,version:chrome.runtime.getManifest().version});return;}
  if(message?.type!=='YS_NEIS_SEND')return;
  try {
    if(JSON.stringify(message.package).length>2000000)throw Error('기록이 너무 큽니다.');
    const p=validatePackage(message.package);
    // Keep a running popup's current package intact. Consume pending data on next open.
    chrome.storage.session.set({pendingPackage:p}).then(()=>reply({ok:true,count:p.records.length}),()=>reply({ok:false,error:'기록을 보관하지 못했습니다. 다시 보내 주세요.'}));
    return true;
  } catch(e) { reply({ok:false,error:e.message}); }
});
