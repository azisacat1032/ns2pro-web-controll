'use strict';
const deadzoneRanges = ['leftInner', 'leftOuter', 'rightInner', 'rightOuter']
  .map(name => document.querySelector(`#${name}Zone`));
const squareMode = document.querySelector('#squareMode');
let squareSupported = false;
const deadzoneEnabled = document.querySelector('#deadzoneEnabled');
const deadzoneRead = document.querySelector('#deadzoneRead');
const deadzoneSave = document.querySelector('#deadzoneSave');
const deadzoneDefaults = document.querySelector('#deadzoneDefaults');
const deadzoneMode = document.querySelector('#deadzoneMode');
const deadzoneState = document.querySelector('#deadzoneState');
const deadzoneSavedState = document.querySelector('#deadzoneSavedState');
let deadzoneDevice, deadzoneConfirmed, deadzoneGeneration;
const dzEquals = (a, b) => Boolean(a && b && a.length === b.length && a.every((v, i) => v === b[i]));
const dzValid = p => p.length === 5 && p[0] <= 3 && p[1] <= 50 && p[3] <= 50 &&
  p[2] >= 55 && p[2] <= 100 && p[4] >= 55 && p[4] <= 100;
function drawDeadzones() {
  for (const [side, radius] of [['left', 76], ['right', 72]]) {
    for (const type of ['Inner', 'Outer']) {
      const value = document.querySelector(`#${side}${type}Zone`).value;
      document.querySelector(`#${side}${type}Ring`).setAttribute('r', String(radius * Number(value) / 100));
      document.querySelector(`#${side}${type}Value`).textContent = `${value}%`;
    }
  }
}
function dzTarget() { return [(Number(deadzoneEnabled.checked) | (Number(squareMode.checked) << 1)), ...deadzoneRanges.map(r => Number(r.value))]; }
function dzAccept(snapshot) {
  deadzoneGeneration = snapshot.generation; deadzoneConfirmed = snapshot.profile.slice();
  deadzoneEnabled.checked = Boolean(snapshot.profile[0] & 1);
  squareMode.checked = Boolean(snapshot.profile[0] & 2);
  deadzoneRanges.forEach((r, i) => { r.value = snapshot.profile[i + 1]; });
  deadzoneMode.textContent = (snapshot.profile[0] & 1) ? '自定义径向死区' : '旧模式 · 参数未启用';
  if (typeof updateCalibrationMode === 'function') updateCalibrationMode();
  drawDeadzones();
}
function deadzoneBusy(value) {
  value = value || (typeof calibrationActive === 'function' && calibrationActive());
  squareMode.disabled = value || !deadzoneDevice || !squareSupported;
  [deadzoneEnabled, deadzoneRead, deadzoneSave, deadzoneDefaults]
    .forEach(control => { control.disabled = value || !deadzoneDevice; });
  const baseline = typeof calibrationIsValid === 'function' && calibrationIsValid() && !deadzoneEnabled.checked;
  deadzoneRanges.forEach(control => { control.disabled = value || baseline; });
}
function deadzoneReset() {
  deadzoneDevice = undefined; deadzoneConfirmed = undefined; deadzoneGeneration = undefined;
  squareMode.checked = false; squareSupported = false;
  deadzoneEnabled.checked = false;
  deadzoneRanges.forEach((r, i) => { r.value = [10, 100, 10, 100][i]; });
  deadzoneMode.textContent = '未连接 · 仅预览';
  deadzoneState.textContent = '连接支持死区功能的固件后可调节。'; deadzoneSavedState.textContent = '';
  drawDeadzones(); deadzoneBusy(false);
}
async function dzFetch(device) {
  const b = payloadOf(await device.receiveFeatureReport(10), 10);
  const profile = Array.from(b.slice(1, 6));
  if (b[0] !== 1 || !dzValid(profile) || b.slice(10).some(v => v)) throw new Error('死区配置格式不符合预期');
  return { profile, generation: new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(6, true) };
}
async function dzFetchSaved(device) {
  const b = payloadOf(await device.receiveFeatureReport(11), 11);
  if (b[0] !== 1 || b[1] > 3 || b[3] > 1 || b.slice(18).some(v => v) ||
      (b[3] && !dzValid(Array.from(b.slice(8, 13)))) ||
      ((b[1] === 1 || b[1] === 2) && !dzValid(Array.from(b.slice(13, 18)))))
    throw new Error('死区保存状态格式不符合预期');
  return b;
}
function dzShowSaved(b) {
  deadzoneSavedState.textContent = b[1] === 1 ? '正在保存…' : b[1] === 3 ? '保存未确认，请重读或重试。' :
    !b[3] ? '尚未保存；重启使用旧模式。' : dzEquals(Array.from(b.slice(8, 13)), deadzoneConfirmed)
      ? '当前死区已保存，断电保留。' : '当前死区未保存。';
}
async function deadzoneConnected(device, capabilities, extensions = 0) {
  if (!(capabilities & 64)) {
    deadzoneMode.textContent = '旧固件 · 仅预览';
    deadzoneState.textContent = '当前固件不支持死区设置，滑块只改变图示。'; return;
  }
  squareSupported = Boolean(extensions & 1);
  const snapshot = await dzFetch(device), saved = await dzFetchSaved(device);
  deadzoneDevice = device; dzAccept(snapshot); dzShowSaved(saved);
  deadzoneState.textContent = '松开滑块自动应用；开启自定义后参数生效。';
}
async function dzOperation(action) {
  if (!deadzoneDevice || configBusy) return;
  const device = deadzoneDevice; busy(true);
  try {
    await device.open(); await action(device);
  } catch (error) {
    if (deadzoneConfirmed) dzAccept({ profile: deadzoneConfirmed, generation: deadzoneGeneration });
    deadzoneState.textContent = `操作未确认：${error.message}；请读取确认。`;
    line(`死区 ${error.name}: ${error.message}`);
  } finally {
    if (device.opened) { try { await device.close(); } catch (error) { line(error.message); } }
    if (deadzoneDevice !== device) deadzoneReset();
    busy(false);
  }
}
async function dzApply(device, profile) {
  const request = new Uint8Array(63); request.set([1, ...profile]);
  new DataView(request.buffer).setUint32(6, deadzoneGeneration, true);
  await device.sendFeatureReport(10, request);
  const actual = await dzFetch(device);
  const accepted = actual.generation === ((deadzoneGeneration + 1) >>> 0) && dzEquals(actual.profile, profile);
  dzAccept(actual);
  if (!accepted) throw new Error('设备配置已变化，已同步设备值；确认后重试');
  dzShowSaved(await dzFetchSaved(device));
  deadzoneState.textContent = (profile[0] & 2) ? '圆角微方模式已应用并回读确认。' : (profile[0] & 1) ? '自定义死区已应用并回读确认。' : (typeof calibrationIsValid === 'function' && calibrationIsValid() ? '已恢复校准默认，不叠加额外死区。' : '已恢复旧模式；滑块参数暂不生效。');
}
deadzoneRanges.forEach(range => {
  range.addEventListener('input', drawDeadzones);
  range.addEventListener('change', () => { const target = dzTarget(); dzOperation(device => dzApply(device, target)); });
});
squareMode.addEventListener('change', () => {
  const target = deadzoneConfirmed.slice();
  target[0] = (target[0] & 1) | (Number(squareMode.checked) << 1);
  dzOperation(device => dzApply(device, target));
});
deadzoneEnabled.addEventListener('change', () => {
  const target = dzTarget();
  if (deadzoneEnabled.checked && deadzoneConfirmed && !(deadzoneConfirmed[0] & 1) &&
      typeof calibrationIsValid === 'function' && calibrationIsValid()) target.splice(1, 4, ...deadzoneConfirmed.slice(1));
  dzOperation(device => dzApply(device, target));
});
deadzoneRead.addEventListener('click', () => dzOperation(async device => {
  dzAccept(await dzFetch(device)); dzShowSaved(await dzFetchSaved(device)); deadzoneState.textContent = '已读取设备死区。';
}));
deadzoneDefaults.addEventListener('click', () => dzOperation(device => dzApply(device, [0, 10, 100, 10, 100])));
deadzoneSave.addEventListener('click', () => dzOperation(async device => {
  const actual = await dzFetch(device);
  if (!dzEquals(actual.profile, deadzoneConfirmed) || actual.generation !== deadzoneGeneration) {
    dzAccept(actual); throw new Error('设备配置已变化，已刷新显示');
  }
  const token = crypto.getRandomValues(new Uint8Array(1))[0];
  const request = new Uint8Array(63); request.set([1, 1, token, ...actual.profile]);
  await device.sendFeatureReport(11, request);
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = await dzFetchSaved(device);
    if (status[2] !== token || !dzEquals(Array.from(status.slice(13, 18)), actual.profile)) throw new Error('保存请求未被接受');
    dzShowSaved(status);
    if (status[1] === 3) throw new Error('设备保存失败');
    if (status[1] === 2 && status[3] && dzEquals(Array.from(status.slice(8, 13)), actual.profile)) {
      dzAccept(await dzFetch(device)); dzShowSaved(status); deadzoneState.textContent = '保存提交及读回确认成功。'; return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('保存超时');
}));
deadzoneReset();
