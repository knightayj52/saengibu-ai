'use strict';
function validatePackage(p) {
  if(!p || p.format!=='saengibu-neis'||p.version!==1) throw Error('앱에서 받은 자동 입력 JSON 파일을 선택해 주세요.');
  const c=p.context;
  if(!c||!['subject','activity','behavior'].includes(c.kind)||typeof c.group!=='string'||!c.group.trim()||typeof c.label!=='string') throw Error('과목·영역 정보가 잘못되었습니다.');
  for(const [k,min,max] of [['year',2000,2100],['grade',1,12],['classNumber',1,99],['semester',1,2]]) if(!Number.isInteger(c[k])||c[k]<min||c[k]>max) throw Error('학급 정보를 확인해 주세요.');
  if(!Array.isArray(p.records)||!p.records.length||p.records.length>100) throw Error('학생 수는 1~100명이어야 합니다.');
  const numbers=new Set();
  for(const r of p.records) {
    if(!Number.isInteger(r.number)||r.number<1||r.number>999||numbers.has(r.number)) throw Error('학생 번호가 누락되거나 중복되었습니다.');
    numbers.add(r.number);
    if(typeof r.name!=='string'||!r.name.trim()||r.name.length>80||typeof r.text!=='string'||!r.text.trim()||r.text.length>20000) throw Error('이름 또는 문장이 잘못되었습니다.');
    if(!Number.isInteger(r.limit)||r.limit<1||r.limit>20000||neisBytes(r.text)>r.limit) throw Error('문장 바이트 한도를 확인해 주세요.');
  }
  return p;
}
function neisBytes(s) { return Array.from(s).reduce((n,c)=>n+(c==='\n'?2:c.charCodeAt(0)>127?3:1),0); }
function isNeisUrl(url) {try {const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='neis.go.kr'||u.hostname.endsWith('.neis.go.kr'));}catch{return false;}}
if(typeof module!=='undefined') module.exports={validatePackage,neisBytes,isNeisUrl};
