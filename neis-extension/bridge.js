'use strict';
window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!=='https://knightayj52.github.io')return;
  const m=event.data;
  if(m?.source!=='ys-neis-app'||!['YS_NEIS_PING','YS_NEIS_SEND'].includes(m.type)||typeof m.requestId!=='string'||m.requestId.length>100)return;
  chrome.runtime.sendMessage({type:m.type,package:m.package},response=>{
    const error=chrome.runtime.lastError;
    window.postMessage({source:'ys-neis-extension',requestId:m.requestId,result:error?{ok:false,error:'확장프로그램을 업데이트했다면 생기부 앱을 새로고침해 주세요.'}:response},event.origin);
  });
});
