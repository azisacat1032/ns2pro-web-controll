export const phases=['flash','reboot','pc','choice','ns2intro','protect','console','capture','merge','finish'];
export function fresh(){return {schema:1,phase:'flash',mode:'dual',sawUnplug:false,consoleConfirmed:false,expectedVersion:''};}
export function restore(value){
  if(!value||value.schema!==1||!phases.includes(value.phase)||!['pc','dual'].includes(value.mode))return fresh();
  return {...fresh(),...value};
}
export function decodeInfo(raw){
  if(!raw||raw.length!==64||raw[0]!==1||String.fromCharCode(...raw.slice(1,5))!=='NSCF'||raw[5]!==1||raw[6]!==63)throw Error('接收器状态格式无效');
  const p=raw.slice(1),version=String.fromCharCode(...p.slice(8,40)).split('\0')[0];
  if(p[43]===0)return {version,supported:false};
  if(p[43]!==1||p[45]>3||p[46]>1)throw Error('配对进度格式无效，请更新软件');
  const f=p[44];
  return {version,supported:true,pc:Boolean(f&1),ns2:Boolean(f&2),setup:Boolean(f&4),paused:Boolean(f&8),dual:Boolean(f&16),busy:Boolean(f&32),ready:Boolean(f&64),reset:Boolean(f&128),result:p[45],cleanup:Boolean(p[46])};
}
export function healthy(p){return p?.supported&&!p.busy&&!p.reset&&!p.cleanup&&p.result!==2;}
export function complete(p,mode,live){return healthy(p)&&p.pc&&p.ready&&live&&(mode==='pc'?!p.setup:(p.ns2&&p.dual&&!p.setup));}
export function advance(state,p){
  const next={...state};
  if(!p){if(['reboot','console'].includes(next.phase))next.sawUnplug=true;return next;}
  if(!healthy(p))return next;
  if(next.phase==='reboot'&&next.sawUnplug&&p.version===next.expectedVersion){next.phase='pc';next.sawUnplug=false;}
  if(next.phase==='pc'&&p.pc&&p.ready){
    if(p.setup){next.phase=p.ns2?'merge':next.consoleConfirmed?'capture':'console';next.sawUnplug=false;}
    else next.phase='choice';
  }
  if(next.phase==='protect'&&p.pc&&p.setup&&p.paused){next.phase='console';next.sawUnplug=false;}
  if(next.phase==='capture'&&next.consoleConfirmed&&p.setup&&p.ns2&&p.ready)next.phase='merge';
  if(next.phase==='merge'&&p.pc&&p.ns2&&p.dual&&!p.setup&&p.ready)next.phase='finish';
  return next;
}
export function existing(state,p){if(state.phase!=='flash'||!healthy(p))throw Error('尚未检测到支持引导的固件');return advance({...state,phase:'pc'},p);}
export function flashed(state,detail){
  if(state.phase!=='flash'||detail?.verified!==true||typeof detail.version!=='string'||!detail.version||! /^[0-9a-f]{64}$/i.test(detail.sha256||''))return state;
  return {...state,phase:'reboot',expectedVersion:detail.version,sawUnplug:false};
}
export function confirmConsole(state,paired,poweredOff){
  if(state.phase!=='console'||!state.sawUnplug||!paired||!poweredOff)throw Error('请完成主机配对、休眠或关机，并拔下接收器后再确认');
  return {...state,phase:'capture',consoleConfirmed:true};
}
export function pcOnly(state,p){
  if(!['choice','protect'].includes(state.phase)||!healthy(p)||!p.pc||!p.ready||p.setup)throw Error('当前状态还不能完成 PC 设置');
  return {...state,mode:'pc',phase:'finish'};
}
export function chooseDual(state,p){
  if(state.phase!=='choice'||!healthy(p)||!p.pc||!p.ready||p.setup)throw Error('请先确认 PC 连接正常');
  return {...state,mode:'dual',phase:'ns2intro'};
}
export function acknowledgeDual(state,p){
  if(state.phase!=='ns2intro'||!healthy(p)||!p.pc||!p.ready||p.setup)throw Error('请确认 PC 连接正常，并阅读双机配对说明');
  return {...state,mode:'dual',phase:p.ns2&&p.dual?'finish':'protect'};
}
