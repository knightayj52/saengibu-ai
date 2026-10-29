'use strict';
importScripts('core.js','session.js');
const sessions=createNeisSession(chrome);
function allowedSender(sender) {
  try {const u=new URL(sender.url);return sender.id===chrome.runtime.id&&sender.frameId===0&&u.origin==='https://knightayj52.github.io'&&u.pathname.startsWith('/saengibu-ai/');}catch{return false;}
}
function popupSender(sender){return sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html');}
const init=Promise.all([
  chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
  chrome.storage.session.remove(['package','pendingPackage'])
]);
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  const app=allowedSender(sender), popup=popupSender(sender);
  if(!app&&!popup)return;
  if(app&&m?.type==='YS_NEIS_PING'){reply({ok:true,version:chrome.runtime.getManifest().version});return;}
  let type;
  if(app&&m?.type==='YS_NEIS_SEND')type='receive';
  else if(popup&&m?.type==='YS_NEIS_SESSION'&&['open','import','touch','track','cancel','clear'].includes(m.action))type=m.action;
  else return;
  init.then(()=>sessions.act(type,m)).then(result=>reply({ok:true,...result}),e=>reply({ok:false,error:e.message||'기록 처리에 실패했습니다.'}));
  return true;
});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===sessions.alarmName)init.then(()=>sessions.act('purge')).catch(()=>{});});
init.then(()=>sessions.act('purge')).catch(()=>{});
