'use strict';
document.querySelector('main.dashboard').append(document.querySelector('#presetCardTemplate').content.cloneNode(true));
const presetKey = 'ns2pro.presets.v1';
const presetList = document.querySelector('#presetList'), presetName = document.querySelector('#presetName');
const presetState = document.querySelector('#presetState'), presetSummary = document.querySelector('#presetSummary');
const presetControls = Object.fromEntries(['Create','Overwrite','Apply','Persist','Rename','Delete','Undo'].map(k => [k, document.querySelector('#preset' + k)]));
let presetItems = [], presetDeleted, presetStorageError = '', presetStoredRaw = null;
const presetEqual = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const presetIntegerArray = (a,n,max) => Array.isArray(a) && a.length === n && a.every(v => Number.isInteger(v) && v >= 0 && v <= max);
function presetValidateData(p) {
  if (!p || !presetIntegerArray(p.gains,4,200) || !presetIntegerArray(p.mapping,21,19) ||
      !presetIntegerArray(p.deadzone,5,100) || !dzValid(p.deadzone) || typeof p.trigger !== 'boolean') throw new Error('预设参数格式无效');
  return {gains:p.gains.slice(), mapping:p.mapping.slice(), deadzone:p.deadzone.slice(), trigger:p.trigger};
}
function presetLoad() {
  const raw = localStorage.getItem(presetKey);
  presetStoredRaw = raw;
  if (raw === null) return [];
  const file = JSON.parse(raw);
  if (file?.version !== 1 || !Array.isArray(file.items) || file.items.length > 100) throw new Error('预设存储格式无效');
  const ids = new Set(), names = new Set();
  return file.items.map(p => {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' ||
        !p.name.trim() || p.name.length > 40 || names.has(p.name)) throw new Error('预设名称或编号无效');
    ids.add(p.id); names.add(p.name);
    return {id:p.id, name:p.name, data:presetValidateData(p.data)};
  });
}
function presetCommit(items, selection) {
  // Persist first: a quota/privacy failure must not pretend the preset was saved.
  if (localStorage.getItem(presetKey) !== presetStoredRaw) {
    presetItems = presetLoad(); presetRender();
    throw new Error('另一个页面修改了预设，已刷新，请重试');
  }
  const raw = JSON.stringify({version:1, items});
  localStorage.setItem(presetKey, raw); presetStoredRaw = raw;
  presetItems = items; presetRender(selection);
}
const presetSelected = () => presetItems.find(p => p.id === presetList.value);
function presetReady() {
  return Boolean(selectedDevice && result.dataset.connected === 'true' && canProfile && gainScale === 2 &&
    mapDevice === selectedDevice && deadzoneDevice === selectedDevice && runtimeDevice === selectedDevice && squareSupported);
}
function presetBusy(value) {
  const locked = value || calibrationActive();
  const selected = Boolean(presetSelected()), storage = Boolean(presetStorageError);
  presetList.disabled = locked || storage || !presetItems.length; presetName.disabled = locked || storage;
  presetControls.Create.disabled = locked || storage || !presetReady();
  presetControls.Overwrite.disabled = locked || storage || !presetReady() || !selected;
  presetControls.Apply.disabled = locked || !presetReady() || !selected;
  presetControls.Persist.disabled = locked || !presetReady() || !selected || !canSave;
  presetControls.Rename.disabled = locked || storage || !selected;
  presetControls.Delete.disabled = locked || storage || !selected;
  presetControls.Undo.disabled = locked || storage || !presetDeleted;
}
function presetRender(selection = presetList.value) {
  presetList.replaceChildren();
  if (!presetItems.length) {
    const empty = document.createElement('option'); empty.textContent = '还没有预设'; empty.value = ''; presetList.append(empty);
  }
  for (const p of presetItems) {
    const option = document.createElement('option'); option.value = p.id; option.textContent = p.name; presetList.append(option);
  }
  presetList.value = presetItems.some(p => p.id === selection) ? selection : (presetItems[0]?.id || '');
  const p = presetSelected(); presetName.value = p?.name || '';
  presetSummary.textContent = p ? `总强度 ${p.data.gains[0]/2}% · 普通 ${p.data.gains[1]/2}% · HD ${p.data.gains[2]/2}% · 扳机 ${p.data.gains[3]/2}% · ${p.data.deadzone[0]&2 ? '圆角微方' : '纯圆'} · 扳机开关${p.data.trigger?'开启':'关闭'}` : '连接接收器，设置好参数后保存第一个预设。';
  presetControls.Undo.hidden = !presetDeleted; presetBusy(configBusy);
}
function presetGetName(except) {
  const name = presetName.value.trim();
  if (!name || name.length > 40) throw new Error('请输入 1–40 字的预设名称');
  if (presetItems.some(p => p.name === name && p.id !== except)) throw new Error('已有同名预设，请换一个名称或使用覆盖');
  return name;
}
async function presetRead(device) {
  if (calibrationActive()) throw new Error('请先完成或取消摇杆校准');
  const gains = await fetchGain(device), mapping = await fetchMapping(device), dz = await dzFetch(device);
  const runtime = await readRuntime(device);
  showGain(gains); acceptMapping(mapping); dzAccept(dz);
  return presetValidateData({gains, mapping:mapping.targets, deadzone:dz.profile, trigger:Boolean(runtime[1])});
}
async function presetWrite(device, p) {
  const currentMap = await fetchMapping(device), currentDz = await dzFetch(device);
  let b = new Uint8Array(63); b.set([1,...p.gains]); await device.sendFeatureReport(5,b);
  b = new Uint8Array(63); b.set([1,21]); new DataView(b.buffer).setUint32(2,currentMap.generation,true); b.set(p.mapping,6);
  await device.sendFeatureReport(7,b);
  const mapped = await fetchMapping(device);
  if (!presetEqual(mapped.targets,p.mapping) || mapped.generation !== ((currentMap.generation+1)>>>0)) throw new Error('映射冲突，设备未接受预设');
  b = new Uint8Array(63); b.set([1,...p.deadzone]); new DataView(b.buffer).setUint32(6,currentDz.generation,true);
  await device.sendFeatureReport(10,b);
  const dz = await dzFetch(device);
  if (!presetEqual(dz.profile,p.deadzone) || dz.generation !== ((currentDz.generation+1)>>>0)) throw new Error('死区冲突，设备未接受预设');
  b = new Uint8Array(63); b.set([1,Number(p.trigger)]); await device.sendFeatureReport(9,b);
  const actual = await presetRead(device);
  if (!presetEqual(actual,p)) throw new Error('全部参数回读与预设不一致');
}
async function presetSaveDevice(device, p) {
  const token = () => crypto.getRandomValues(new Uint8Array(1))[0];
  const jobs = [
    {id:6, t:token(), request:t=>[1,1,p.gains[0],t,...p.gains.slice(1)], read:fetchSave,
      accepted:(s,t)=>s[5]===t && presetEqual([s[2],...s.slice(13,16)],p.gains), saved:s=>s[3] && presetEqual([s[4],...s.slice(10,13)],p.gains), show:showSaved},
    {id:8, t:token(), request:t=>[1,1,t,...p.mapping], read:fetchMapSaved,
      accepted:(s,t)=>s[2]===t && presetEqual(Array.from(s.slice(29,50)),p.mapping), saved:s=>s[3] && presetEqual(Array.from(s.slice(8,29)),p.mapping), show:showMapSaved},
    {id:11, t:token(), request:t=>[1,1,t,...p.deadzone], read:dzFetchSaved,
      accepted:(s,t)=>s[2]===t && presetEqual(Array.from(s.slice(13,18)),p.deadzone), saved:s=>s[3] && presetEqual(Array.from(s.slice(8,13)),p.deadzone), show:dzShowSaved},
  ];
  for (const job of jobs) {
    const b = new Uint8Array(63); b.set(job.request(job.t)); await device.sendFeatureReport(job.id,b);
    let done = false;
    for (let attempt=0; attempt<50; attempt++) {
      const s = await job.read(device); job.show(s);
      if (!job.accepted(s,job.t)) throw new Error('设备保存请求冲突');
      if (s[1]===3) throw new Error('设备保存失败');
      if (s[1]===2 && job.saved(s)) { done=true; break; }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if (!done) throw new Error('设备保存超时');
  }
  if (!presetEqual(await presetRead(device),p)) throw new Error('保存期间设备配置发生变化');
}
async function presetOperation(action) {
  if (configBusy || !presetReady() || calibrationActive()) return;
  const device = selectedDevice; busy(true);
  try { await device.open(); await action(device); }
  catch(error) { presetState.textContent = `操作未完成：${error.message}`; }
  finally {
    if (device.opened) { try { await device.close(); } catch(error) { presetState.textContent += `；关闭连接失败：${error.message}`; } }
    busy(false);
  }
}
function presetLocalAction(action) {
  if (configBusy || presetStorageError) return;
  try { action(); } catch(error) { presetState.textContent = `未保存：${error.message}`; }
}
function presetCapture(overwrite) {
  return presetOperation(async device => {
    const old = overwrite ? presetSelected() : undefined;
    if (overwrite && !old) throw new Error('请先选择预设');
    const name = presetGetName(old?.id);
    if (!old && presetItems.length>=100) throw new Error('最多保存 100 个预设');
    const storedBeforeRead = presetStoredRaw;
    const data = await presetRead(device), entry = {id:old?.id || crypto.randomUUID(),name,data};
    if (presetStoredRaw !== storedBeforeRead) throw new Error('读取期间其他页面修改了预设，请重试');
    presetCommit(old ? presetItems.map(p=>p.id===old.id?entry:p) : [...presetItems,entry],entry.id);
    presetState.textContent = `“${name}”已${old?'覆盖':'保存'}到当前浏览器。`;
  });
}
function presetApplySelected(persist) {
  const selected = presetSelected(); if (!selected) return;
  const target = presetValidateData(selected.data);
  return presetOperation(async device => {
    const before = await presetRead(device);
    presetState.textContent = '正在应用并回读全部参数…';
    try { await presetWrite(device,target); }
    catch(error) {
      try { await presetWrite(device,before); }
      catch(rollback) {
        try { await presetRead(device); } catch(_) { /* Disconnected: report uncertainty below. */ }
        throw new Error(`${error.message}；恢复未确认，设备可能仅应用了部分参数，请重新连接读取`); }
      throw new Error(`${error.message}；已恢复应用前参数`);
    }
    if (persist) {
      try { await presetSaveDevice(device,target); }
      catch(error) { throw new Error(`预设已即时生效，但断电保存未完整确认：${error.message}。请重试“应用并保存到设备”`); }
    }
    presetState.textContent = `“${selected.name}”已应用，全部参数回读一致。${persist?'震动、映射与死区已保存到设备；扳机开关重启按固件默认。':'尚未写入设备的断电配置。'}`;
  });
}
presetList.addEventListener('change',()=>presetRender());
presetControls.Create.addEventListener('click',()=>presetCapture(false));
presetControls.Overwrite.addEventListener('click',()=>presetCapture(true));
presetControls.Apply.addEventListener('click',()=>presetApplySelected(false));
presetControls.Persist.addEventListener('click',()=>presetApplySelected(true));
presetControls.Rename.addEventListener('click',()=>presetLocalAction(()=>{
  const p = presetSelected(); if (!p) return;
  const name = presetGetName(p.id); presetCommit(presetItems.map(x=>x.id===p.id?{...x,name}:x),p.id);
  presetState.textContent = `已重命名为“${name}”。`;
}));
presetControls.Delete.addEventListener('click',()=>presetLocalAction(()=>{
  const p = presetSelected(); if (!p) return;
  presetCommit(presetItems.filter(x=>x.id!==p.id)); presetDeleted = p; presetRender();
  presetState.textContent = `已删除“${p.name}”，可撤销。`;
}));
presetControls.Undo.addEventListener('click',()=>presetLocalAction(()=>{
  const p = presetDeleted; if (!p) return;
  if (presetItems.length>=100 || presetItems.some(x=>x.name===p.name || x.id===p.id)) throw new Error('存在同名预设或预设数量已满，无法恢复');
  presetCommit([...presetItems,p],p.id); presetDeleted = undefined; presetRender(p.id); presetState.textContent = '已恢复删除的预设。';
}));
window.addEventListener('storage',event=>{
  if (event.key !== presetKey && event.key !== null) return;
  try { presetItems = presetLoad(); presetStorageError = ''; presetDeleted = undefined; presetRender(); presetState.textContent = '已同步其他页面修改的预设。'; }
  catch(error) { presetStorageError = error.message; presetBusy(configBusy); presetState.textContent = `无法读取预设：${error.message}，原存储未覆盖。`; }
});
try { presetItems = presetLoad(); } catch(error) { presetStorageError = error.message; presetState.textContent = `无法读取预设：${error.message}，原存储未覆盖。`; }
presetRender();
