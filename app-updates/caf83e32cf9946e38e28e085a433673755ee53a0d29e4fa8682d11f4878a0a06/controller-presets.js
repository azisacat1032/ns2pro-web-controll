'use strict';
const controllerPresetSelects = Array.from({length:4}, (_,i)=>document.querySelector('#controllerPreset'+i));
const controllerPresetButtons = Array.from({length:4}, (_,i)=>document.querySelector('#controllerPresetSave'+i));
const controllerPresetState = document.querySelector('#controllerPresetState');
let controllerPresetDevice, controllerPresetSlots = [], controllerPresetMask = 0;

function controllerPresetRender() {
  controllerPresetSelects.forEach((select,i)=>{
    const previous = select.value;
    select.replaceChildren();
    const empty = document.createElement('option'); empty.value=''; empty.textContent='未关联（清除灯位）'; select.append(empty);
    for (const preset of presetItems) {
      const option = document.createElement('option'); option.value=preset.id; option.textContent=preset.name; select.append(option);
    }
    select.value = presetItems.some(p=>p.id===previous) ? previous : '';
    const saved = controllerPresetSlots[i];
    document.querySelector('#controllerPresetSaved'+i).textContent = saved?.valid ? `设备已保存：${saved.name || '未命名预设'}` : '设备未关联';
  });
  controllerPresetBusy(configBusy);
}
function controllerPresetBusy(value) {
  const disabled = value || calibrationActive() || controllerPresetDevice !== selectedDevice || !controllerPresetDevice || !presetReady();
  controllerPresetSelects.forEach(s=>s.disabled=disabled || Boolean(presetStorageError));
  controllerPresetButtons.forEach(b=>b.disabled=disabled || Boolean(presetStorageError));
}
function controllerPresetDecode(b) {
  if (b.length!==63 || b[0]!==2 || b[1]>3 || b[3]>3 || b[4]>1 || (b[5]>3 && b[5]!==255) || b[6]>15 || b[7]>3 || b[12]>1 || b[13]!==2 || b[14]!==69 || b[15]!==4) throw new Error('\u706f\u4f4d\u9884\u8bbe\u683c\u5f0f\u65e0\u6548\uff0c\u8bf7\u5237\u65b0\u7f51\u9875\u5e76\u66f4\u65b0\u56fa\u4ef6');
  return {slot:b[3],valid:Boolean(b[4]),active:b[5],mask:b[6],state:b[1],token:b[2],mode:b[7],page:b[12],revision:new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(8,true),chunk:Array.from(b.slice(16,16+(b[12]?46:47)))};
}
async function controllerPresetRead(device, slot=0) {
  let saved, bytes=[];
  for(let page=0;page<2;page++) {
    const request=new Uint8Array(63); request.set([2,0,slot,0,0,usbModeConfirmed,page]);
    await device.sendFeatureReport(15,request);
    const result=controllerPresetDecode(payloadOf(await device.receiveFeatureReport(15),15));
    if(result.slot!==slot || result.page!==page || result.mode!==usbModeConfirmed || (saved && saved.revision!==result.revision)) throw new Error('\u706f\u4f4d\u8bfb\u53d6\u51b2\u7a81\uff0c\u8bf7\u91cd\u8bd5');
    saved=result; bytes.push(...result.chunk);
  }
  saved.data=saved.valid?presetFromFull(bytes.slice(0,69)):undefined;
  saved.name=new TextDecoder().decode(new Uint8Array(bytes.slice(69))).replace(/\0.*$/s,'');
  return saved;
}
function controllerPresetAccept(saved) {
  controllerPresetSlots[saved.slot]=saved; controllerPresetMask=saved.mask;
  const active=saved.active===255 ? '当前未选用灯位预设' : `当前预设：灯位 ${saved.active+1}`;
  document.querySelector('#controllerPresetActive').textContent=active;
}
async function controllerPresetConnected(device, extensions) {
  controllerPresetDevice=undefined; controllerPresetSlots=[]; controllerPresetMask=0;
  if (!(extensions&16) || !fullSettingsSupported) { controllerPresetState.textContent='需更新支持灯位预设的固件。'; controllerPresetRender(); return; }
  for (let i=0;i<4;i++) controllerPresetAccept(await controllerPresetRead(device,i));
  document.querySelector('#controllerPresetTitle').textContent=['DS5','Xbox','DS5 Edge','NS2 Pro'][usbModeConfirmed]+' \u6307\u793a\u706f\u9884\u8bbe\uff084 / 16\uff09';
  controllerPresetDevice=device; controllerPresetState.textContent='已读取接收器保存的灯位关联。'; controllerPresetRender();
}
async function controllerPresetRefresh(device) {
  if (device!==controllerPresetDevice) return;
  controllerPresetAccept(await controllerPresetRead(device));
}
async function controllerPresetSave(slot) {
  const device=controllerPresetDevice;
  if (!device || device!==selectedDevice || configBusy || calibrationActive() || presetStorageError) return;
  const id=controllerPresetSelects[slot].value, preset=presetItems.find(p=>p.id===id);
  if (id && !preset) return;
  busy(true);
  try {
    await device.open();
    const previous=await controllerPresetRead(device,slot), token=crypto.getRandomValues(new Uint8Array(1))[0];
    const record=new Uint8Array(93); let savedName='';
    if(preset) {
      const data=presetValidateData(preset.data);
      if(!data.full) throw new Error('\u8fd9\u662f\u65e7\u9884\u8bbe\uff0c\u8bf7\u5148\u5e94\u7528\u540e\u8986\u76d6\u4fdd\u5b58\uff0c\u8865\u5168\u7b97\u6cd5\u548c\u8d85\u9891\u53c2\u6570');
      record.set(data.full);
      for(const char of preset.name) { if(new TextEncoder().encode(savedName+char).length>23) break; savedName+=char; }
      record.set(new TextEncoder().encode(savedName),69);
    }
    for(let page=0;page<2;page++) {
      const b=new Uint8Array(63); b.set([2,1,slot,token,Number(Boolean(preset)),previous.mode,page]);
      new DataView(b.buffer).setUint32(8,previous.revision,true); b.set(record.slice(page*47,page*47+47),16);
      await device.sendFeatureReport(15,b);
    }
    const commit=new Uint8Array(63); commit.set([2,2,slot,token,Number(Boolean(preset)),previous.mode]);
    new DataView(commit.buffer).setUint32(8,previous.revision,true); await device.sendFeatureReport(15,commit);
    let saved;
    for (let attempt=0;attempt<50;attempt++) {
      saved=controllerPresetDecode(payloadOf(await device.receiveFeatureReport(15),15));
      if (saved.token!==token || saved.slot!==slot) throw new Error('另一个页面修改了灯位，请重新连接读取');
      if (saved.state===3) throw new Error('接收器保存未确认，请重试');
      if (saved.state===2) break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if (saved.state!==2) throw new Error('保存超时，请重新连接确认');
    saved=await controllerPresetRead(device,slot);
    if (saved.valid!==Boolean(preset) || (preset && (!presetEqual(saved.data,preset.data) || saved.name!==savedName))) throw new Error('保存回读与所选预设不一致');
    controllerPresetAccept(saved); controllerPresetRender();
    controllerPresetState.textContent=`灯位 ${slot+1} ${preset ? `已关联“${preset.name}”` : '已清除关联'}，已写入设备并回读确认。`;
  } catch(error) { controllerPresetState.textContent=`关联未确认：${error.message}`; }
  finally { if (device.opened) { try { await device.close(); } catch(error) { controllerPresetState.textContent+=`；${error.message}`; } } busy(false); }
}
controllerPresetButtons.forEach((button,i)=>button.addEventListener('click',()=>controllerPresetSave(i)));
controllerPresetRender();
