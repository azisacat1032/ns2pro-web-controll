import {createBrowserGuideAPI} from './browser-api.mjs';
if(!window.__TAURI__){
  // Insert before the firmware module binds its controls; native hosts provide their own.
  const input=document.querySelector('#firmwareFile');
  if(input&&!document.querySelector('#bundledFirmwareSelect')){
    const box=document.createElement('div');box.className='bundled-firmware';
    box.innerHTML='<label for="bundledFirmwareSelect">网页随包固件</label><div class="map-actions"><select id="bundledFirmwareSelect" disabled><option value="">正在读取随包固件…</option></select><button id="bundledFirmwareUse" type="button" disabled>使用此固件</button></div><p id="bundledFirmwareState" class="note" role="status"></p>';
    input.parentElement.prepend(box);
  }
  let storage;
  try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('浏览器未允许保存完成记录，请允许网站存储后重试');}};}
  window.ns2proGuideAPI=createBrowserGuideAPI(navigator.hid,storage);
  void import('./onboarding.js').catch(error=>console.error('首次设置加载失败',error));
}
