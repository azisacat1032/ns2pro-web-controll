'use strict';
const usbModeSelect = document.querySelector('#usbMode');
const usbModeState = document.querySelector('#usbModeState');
const usbModeNames = ['DS5', 'Xbox', 'DS5 Edge', '原生 Pro2'];
let usbModeConfirmed, usbModeSupported = false, usbModeSwitching = false, usbModeTimeout;
const usbModeIsSwitching = () => usbModeSwitching;
const usbModeGainEditable = i => usbModeConfirmed === 3 ? i === 0 : usbModeConfirmed === 1 ? i < 2 : true;
function usbModeProfileText(values) {
  return ['总', '普通', 'HD', '扳机'].map((name,i) => usbModeGainEditable(i) ? `${name} ${gainDisplay(values[i])}%` : '').filter(Boolean).join(' / ');
}
function usbModeBusy(value) {
  usbModeSelect.disabled = value || !selectedDevice || !usbModeSupported;
  sourcePanel.hidden = !canProfile || usbModeConfirmed === 3;
  ranges.forEach((r,i) => {
    r.disabled = value || !selectedDevice || !usbModeGainEditable(i);
    if (i) r.parentElement.hidden = usbModeConfirmed === 3 || (usbModeConfirmed === 1 && i === 2);
  });
  if (typeof gyroMode === 'function') gyroMode();
  const ds5 = usbModeConfirmed !== 1 && usbModeConfirmed !== 3;
  runtimePanel.hidden = usbModeConfirmed === 3;
  triggerToggle.disabled = value || !runtimeDevice || !ds5;
  if (usbModeConfirmed === 1) {
    labels[3].textContent = '待开发';
    document.querySelector('#triggerHelp').textContent = 'Xbox 扳机反馈预留，暂未启用。';
    triggerState.textContent = 'Xbox 扳机反馈待开发';
  } else {
    document.querySelector('#triggerHelp').textContent = '把游戏的扳机效果转成震动，比如开枪、拉弓。';
  }
}
async function usbModeRefresh(device) {
  if (!usbModeSupported) return;
  try {
    const b = payloadOf(await device.receiveFeatureReport(16),16);
    if (b[0] !== 1 || b[1] > 3 || b[3] !== 15 || (b[2] !== 255 && b[2] > 3) || b.slice(10).some(v=>v)) throw new Error('模式状态格式无效');
    const error = new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(6,true);
    if (error) throw new Error(`设备切换失败：${error}`);
    usbModeConfirmed = b[1]; usbModeSelect.value = String(b[1]);
    usbModeState.textContent = `当前：${usbModeNames[b[1]]}`;
    usbModeBusy(configBusy);
    return b;
  } catch (error) {
    usbModeState.textContent = `当前模式未确认：${error.message}`;
    throw error;
  }
}
async function usbModeConnected(device, extensions) {
  clearTimeout(usbModeTimeout); usbModeSwitching = false; usbModeConfirmed = undefined;
  usbModeSupported = Boolean(extensions & 32);
  usbModeState.textContent = usbModeSupported ? '当前：读取中…' : '模式切换需更新固件';
  await usbModeRefresh(device);
}
function usbModeDisconnected() {
  clearTimeout(usbModeTimeout);
  const expected = usbModeSwitching;
  usbModeSwitching = false; usbModeSupported = false; usbModeConfirmed = undefined;
  usbModeState.textContent = expected ? '已重启切换，请重新连接确认模式' : '当前：未连接';
}
usbModeSelect.addEventListener('change', async () => {
  if (configBusy || !selectedDevice || !usbModeSupported) return;
  const target = Number(usbModeSelect.value), device = selectedDevice;
  if (!Number.isInteger(target) || target < 0 || target > 3 || target === usbModeConfirmed) return;
  busy(true);
  try {
    await device.open();
    const token = crypto.getRandomValues(new Uint8Array(1))[0];
    const request = new Uint8Array(63); request.set([1,target,token]);
    await device.sendFeatureReport(16,request);
    const status = payloadOf(await device.receiveFeatureReport(16),16);
    if (status[0] !== 1 || status[2] !== target || status[5] !== token) throw new Error('切换请求未被设备确认');
    usbModeSwitching = true;
    usbModeState.textContent = `当前：${usbModeNames[usbModeConfirmed]} · 正在切至 ${usbModeNames[target]}，重启后请重新连接`;
    usbModeTimeout = setTimeout(() => {
      if (!usbModeSwitching) return;
      usbModeSwitching = false; usbModeSupported = false;
      usbModeState.textContent = '切换结果待确认，请重新连接接收器'; busy(false);
    }, 3000);
  } catch (error) {
    usbModeSelect.value = String(usbModeConfirmed);
    usbModeState.textContent = `切换未确认：${error.message}，请重新连接读取实际模式`;
  } finally {
    if (device.opened) { try { await device.close(); } catch (_) {} }
    busy(false);
  }
});
