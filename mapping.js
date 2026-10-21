'use strict';
const mapSources = ['B（下）', 'A（右）', 'Y（左）', 'X（上）', 'L', 'R', 'ZL', 'ZR',
  '−', '+', '左摇杆按下', '右摇杆按下', '方向↓', '方向→', '方向←', '方向↑',
  'HOME', '截图', '右背键', '左背键', 'C'];
const mapTargets = ['禁用', '× Cross', '○ Circle', '□ Square', '△ Triangle', 'L1', 'R1',
  'L2', 'R2', 'L3', 'R3', '方向↑', '方向→', '方向↓', '方向←', '触摸板点击',
  'PS / Home', 'Options', 'Create / Share', '麦克风静音'];
function mapTargetLabel(target) {
  if (typeof usbModeConfirmed === 'undefined' || usbModeConfirmed !== 1) return mapTargets[target];
  let face = ['禁用', 'A', 'B', 'X', 'Y'];
  if (typeof xboxLayoutConfirmed !== 'undefined' && xboxLayoutConfirmed) face = ['禁用', 'B', 'A', 'Y', 'X'];
  return target <= 4 ? face[target] : mapTargets[target];
}
const mapDefaultTargets = [1,2,3,4,5,6,7,8,18,17,9,10,13,12,14,11,16,15,10,9,19];
const mapPanel = document.querySelector('#mappingPanel');
const mapState = document.querySelector('#mapState');
const mapSavedState = document.querySelector('#mapSavedState');
const mapSourceLabel = document.querySelector('#mapSourceLabel');
const mapTarget = document.querySelector('#mapTarget');
const mapLeft = document.querySelector('#mapLeftPaddle');
const mapRight = document.querySelector('#mapRightPaddle');
const mapRead = document.querySelector('#mapRead');
const mapApply = document.querySelector('#mapApply');
const mapSave = document.querySelector('#mapSave');
const mapDefaults = document.querySelector('#mapDefaults');
const mapRows = document.querySelector('#mapRows');
let mapDevice, mapConfirmed, mapDraft, mapGeneration = 0, mapSelected = 0, mapIsBusy = false;
const mapEquals = (a, b) => Boolean(a && b && a.length === b.length && a.every((v, i) => v === b[i]));
const mapDirty = () => !mapEquals(mapDraft, mapConfirmed);
const mapButtons = [];

for (const select of [mapTarget, mapLeft, mapRight]) {
  mapTargets.forEach((label, value) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; select.append(option);
  });
}
// Hotspots are in the original photograph's 1000 × 1000 coordinate space.
const keyLayout = [
  [6,'ZL',170,85,120,54,'photo-callout'],[7,'ZR',830,85,120,54,'photo-callout'],
  [4,'L',242,215,220,60,'photo-hotspot photo-shoulder'],[5,'R',758,215,220,60,'photo-hotspot photo-shoulder photo-shoulder-right'],
  [10,'左摇杆按下',239,382,150,150,'photo-hotspot'],[11,'右摇杆按下',615,520,144,144,'photo-hotspot'],
  [3,'X',747,315,76,76,'photo-hotspot'],[2,'Y',670,383,76,76,'photo-hotspot'],
  [1,'A',824,383,76,76,'photo-hotspot'],[0,'B',747,450,76,76,'photo-hotspot'],
  [15,'↑',361,471,50,53,'photo-hotspot photo-square'],[12,'↓',361,563,50,53,'photo-hotspot photo-square'],
  [14,'←',314,517,53,50,'photo-hotspot photo-square'],[13,'→',408,517,53,50,'photo-hotspot photo-square'],
  [8,'−',385,309,46,46,'photo-hotspot'],[9,'+',615,309,46,46,'photo-hotspot'],
  [17,'截图',442,383,42,42,'photo-hotspot photo-square'],[16,'HOME',558,383,50,50,'photo-hotspot'],
  [20,'C',500,590,43,43,'photo-hotspot photo-square'],
  [19,'GL',0,0,0,0,'paddle-key'],[18,'GR',0,0,0,0,'paddle-key'],
];
for (const [source, label, x, y, w, h, kind] of keyLayout) {
  const control = document.createElement('button');
  control.type = 'button'; control.textContent = label;
  control.disabled = true;
  control.className = kind === 'paddle-key' ? kind : `controller-key ${kind}`;
  control.setAttribute('aria-label', mapSources[source]);
  control.setAttribute('aria-pressed', 'false');
  control.title = mapSources[source];
  control.style.cssText = `--x:${x};--y:${y};--w:${w};--h:${h}`;
  control.addEventListener('click', () => { mapSelected = source; renderMapping(); });
  mapButtons[source] = control;
  document.querySelector(source === 19 ? '#leftPaddleButton' : source === 18 ? '#rightPaddleButton' : '#controllerMap').append(control);
}
// Photo callouts and the separate paddle controls select the same inputs.
const mapMirrors = Array.from(document.querySelectorAll('[data-map-source]'));
mapMirrors.forEach(control => {
  const source = Number(control.getAttribute('data-map-source'));
  control.addEventListener('click', () => { mapSelected = source; renderMapping(); });
});
function renderMapMirrors() {
  mapMirrors.forEach(control => {
    const source = Number(control.getAttribute('data-map-source'));
    const label = mapDraft ? `${mapSources[source]} → ${mapTargetLabel(mapDraft[source])}` : mapSources[source];
    control.setAttribute('aria-pressed', String(Boolean(mapDraft) && source === mapSelected));
    control.setAttribute('aria-label', label); control.title = label;
  });
}
function mappingBusy(value) {
  mapIsBusy = value;
  [...mapButtons, ...mapMirrors, mapTarget, mapLeft, mapRight, mapRead, mapApply, mapSave, mapDefaults]
    .forEach(control => { control.disabled = value || !mapDevice; });
  mapSave.disabled = value || !mapDevice || mapDirty();
}
function mappingReset() {
  mapDevice = undefined; mapConfirmed = undefined; mapDraft = undefined;
  mapPanel.hidden = false; mapSavedState.textContent = '';
  mapState.textContent = '连接后读取设备映射';
  mapSourceLabel.textContent = '选择图中的按键';
  mapRows.replaceChildren();
  [mapTarget, mapLeft, mapRight].forEach(select => { select.selectedIndex = -1; });
  mapButtons.forEach((control, source) => {
    control.setAttribute('aria-pressed', 'false');
    control.title = mapSources[source]; control.setAttribute('aria-label', mapSources[source]);
  });
  renderMapMirrors();
  mappingBusy(true);
}
function renderMapping() {
  if (!mapDraft) return;
  for (const select of [mapTarget, mapLeft, mapRight]) {
    Array.from(select.options).forEach((option, target) => { option.textContent = mapTargetLabel(target); });
  }
  mapSourceLabel.textContent = `${mapSources[mapSelected]} →`;
  mapTarget.value = mapDraft[mapSelected];
  mapLeft.value = mapDraft[19]; mapRight.value = mapDraft[18];
  mapRows.replaceChildren();
  mapSources.forEach((label, source) => {
    mapButtons[source].title = `${label} → ${mapTargetLabel(mapDraft[source])}`;
    mapButtons[source].setAttribute('aria-label', mapButtons[source].title);
    mapButtons[source].setAttribute('aria-pressed', String(source === mapSelected));
    const row = document.createElement('tr');
    for (const text of [label, mapTargetLabel(mapDraft[source])]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    mapRows.append(row);
  });
  mapState.textContent = mapDirty() ? '页面草稿尚未应用；点击“应用映射”使其生效。' : '页面与设备映射一致。';
  renderMapMirrors();
  mappingBusy(mapIsBusy);
}
function mappingChanged(source, target) {
  if (!mapDraft) return;
  mapDraft[source] = Number(target); renderMapping();
}
mapTarget.addEventListener('change', () => mappingChanged(mapSelected, mapTarget.value));
mapLeft.addEventListener('change', () => mappingChanged(19, mapLeft.value));
mapRight.addEventListener('change', () => mappingChanged(18, mapRight.value));
mapDefaults.addEventListener('click', () => { mapDraft = mapDefaultTargets.slice(); renderMapping(); });

async function fetchMapping(device) {
  const bytes = payloadOf(await device.receiveFeatureReport(7), 7);
  if (bytes[0] !== 1 || bytes[1] !== 21 || bytes.slice(6, 27).some(v => v >= mapTargets.length) || bytes.slice(27).some(v => v))
    throw new Error('设备映射格式不符合预期');
  return { generation: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(2, true), targets: Array.from(bytes.slice(6, 27)) };
}
async function fetchMapSaved(device) {
  const bytes = payloadOf(await device.receiveFeatureReport(8), 8);
  if (bytes[0] !== 1 || bytes[1] > 3 || bytes[3] > 1 || bytes.slice(8, 50).some(v => v >= mapTargets.length))
    throw new Error('映射保存状态格式不符合预期');
  return bytes;
}
function showMapSaved(status) {
  if (status[1] === 1) mapSavedState.textContent = '设备正在保存映射…';
  else if (status[1] === 3) {
    const error = new DataView(status.buffer, status.byteOffset, status.byteLength).getUint32(4, true);
    mapSavedState.textContent = `映射保存错误 0x${error.toString(16)}，保存值未确认。`;
  } else if (!status[3]) mapSavedState.textContent = '尚无保存的映射；重启使用默认映射。';
  else mapSavedState.textContent = mapEquals(Array.from(status.slice(8, 29)), mapConfirmed)
    ? '当前设备映射已保存，断电重启后恢复。' : '当前设备映射尚未保存；重启恢复此前保存的映射。';
}
function acceptMapping(snapshot) {
  mapGeneration = snapshot.generation; mapConfirmed = snapshot.targets.slice();
  mapDraft = snapshot.targets.slice(); renderMapping();
}
async function mappingConnected(device, capabilities) {
  if (!(capabilities & 16)) return;
  const snapshot = await fetchMapping(device);
  const saved = await fetchMapSaved(device);
  mapDevice = device; acceptMapping(snapshot); showMapSaved(saved); mapPanel.hidden = false;
}
async function mappingOperation(action) {
  if (!mapDevice) return;
  const device = mapDevice;
  busy(true);
  try {
    await device.open();
    await action(device);
  } catch (error) {
    mapState.textContent = `操作未确认：${error.message}`;
    line(`映射 ${error.name}: ${error.message}`);
  } finally {
    if (device.opened) {
      try { await device.close(); } catch (error) { line(`关闭映射设备: ${error.message}`); }
    }
    busy(false);
  }
}
mapRead.addEventListener('click', () => mappingOperation(async device => {
  acceptMapping(await fetchMapping(device)); showMapSaved(await fetchMapSaved(device));
}));
mapApply.addEventListener('click', () => mappingOperation(async device => {
  const target = mapDraft.slice();
  const request = new Uint8Array(63); request.set([1, 21]);
  new DataView(request.buffer).setUint32(2, mapGeneration, true);
  request.set(target, 6);
  await device.sendFeatureReport(7, request);
  const actual = await fetchMapping(device);
  if (!mapEquals(actual.targets, target))
    throw new Error('回读与草稿不一致；设备映射可能已由组合键或其他页面修改，请先读取再编辑。');
  acceptMapping(actual); showMapSaved(await fetchMapSaved(device));
  mapState.textContent = '映射已应用并回读确认。';
}));
mapSave.addEventListener('click', () => mappingOperation(async device => {
  if (mapDirty()) throw new Error('请先应用页面草稿，再保存。');
  const current = await fetchMapping(device);
  if (!mapEquals(current.targets, mapConfirmed)) {
    acceptMapping(current);
    throw new Error('设备映射已改变，已刷新显示；请确认后再次保存。');
  }
  const token = crypto.getRandomValues(new Uint8Array(1))[0];
  const request = new Uint8Array(63); request.set([1, 1, token]); request.set(current.targets, 3);
  await device.sendFeatureReport(8, request);
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = await fetchMapSaved(device);
    if (status[2] !== token || !mapEquals(Array.from(status.slice(29, 50)), current.targets))
      throw new Error('映射保存请求未被接受，设备可能正在处理其他请求。');
    showMapSaved(status);
    if (status[1] === 3) throw new Error(mapSavedState.textContent);
    if (status[1] === 2 && status[3] && mapEquals(Array.from(status.slice(8, 29)), current.targets)) {
      acceptMapping(await fetchMapping(device)); showMapSaved(status);
      line('映射 NVS 提交及读回确认成功。'); return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('保存超时，请重新读取保存状态。');
}));
mappingReset();
