'use strict';
const bleIntervalToggle = document.querySelector('#bleIntervalToggle');
const bleIntervalRate = document.querySelector('#bleIntervalRate');
const bleIntervalState = document.querySelector('#bleIntervalState');
let bleIntervalDevice, bleIntervalSupported = false, bleIntervalConnectedFlag = false;
let bleIntervalConfirmed, bleIntervalToken = 0;
let bleIntervalConfirmedUnits = 4, bleIntervalMinimum = 4;
let bleIntervalNegotiating = false, bleIntervalRestorePollUntil = 0;

function bleIntervalBusy(value) {
  bleIntervalToggle.disabled = value || bleIntervalNegotiating || !bleIntervalSupported || !bleIntervalDevice || !bleIntervalConnectedFlag;
  bleIntervalRate.disabled = bleIntervalToggle.disabled;
}
function bleIntervalUnknown(message) {
  bleIntervalConfirmed = undefined; bleIntervalConnectedFlag = false;
  bleIntervalNegotiating = false;
  bleIntervalToggle.checked = false; bleIntervalState.textContent = message;
  bleIntervalBusy(true);
}
function bleIntervalReset() {
  bleIntervalDevice = undefined; bleIntervalSupported = false;
  bleIntervalRestorePollUntil = 0;
  bleIntervalRate.value = '4'; bleIntervalConfirmedUnits = 4;
  bleIntervalUnknown('连接后读取 · 实验功能');
}
async function readBleInterval(device) {
  const b = payloadOf(await device.receiveFeatureReport(14), 14);
  if (typeof fullSettingsSupported !== 'undefined' && fullSettingsSupported) {
    const fullStatus = payloadOf(await device.receiveFeatureReport(25),25);
    if (fullStatus[0]===1 && fullStatus[7]) {
      const pending = await fullSettingsRead(device), units = pending.data.full[68];
      // A preset may be waiting for BLE connection; retain the measured interval
      // in bytes4..5 and display only the requested selection as pending.
      b[3] = Number(units<6); b[6] = 1; b[17] = units;
    }
  }
  if (b[0] !== 1 || b.slice(1,4).some(v => v > 1) || b[6] > 3 ||
      ![0,2,3,4,6].includes(b[16]) || ![0,2,3,4,6].includes(b[17]) || b.slice(18).some(v => v))
    throw new Error('蓝牙模式状态格式无效');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const status = {supported:Boolean(b[1]), connected:Boolean(b[2]), selected:Boolean(b[3]),
    units:view.getUint16(4,true), state:b[6], token:b[7], error:view.getUint32(8,true), event:view.getInt32(12,true),
    targetUnits:b[17] || 4};
  bleIntervalConnectedFlag = status.connected;
  bleIntervalMinimum = b[16] || 4;
  for (const option of bleIntervalRate.options) option.disabled = Number(option.value) < bleIntervalMinimum;
  const pending = (status.state === 1 ||
    (status.state === 2 && status.selected && status.units !== status.targetUnits)) &&
    (status.connected || status.selected);
  bleIntervalNegotiating = status.connected && pending;
  if (pending) {
    // Keep the requested switch state stable while the controller negotiates.
    // The actual interval remains separately confirmed from status.units.
    bleIntervalToggle.checked = status.selected;
    if ([2,3,4].includes(b[17])) bleIntervalRate.value = String(b[17]);
  } else {
    bleIntervalConfirmed = status.connected && [2,3,4].includes(status.units);
    if (bleIntervalConfirmed) {
      bleIntervalConfirmedUnits = status.units;
      bleIntervalRate.value = String(status.units);
    }
    bleIntervalToggle.checked = bleIntervalConfirmed;
  }
  if (!status.supported) bleIntervalUnknown('需更新支持 200Hz 的实验固件');
  else if (!status.connected && status.selected && status.state === 1)
    bleIntervalState.textContent = `已保存超频档位 ${({4:'200',3:'266',2:'400'}[Number(b[17])] || '实验')}Hz · 手柄连接后恢复`;
  else if (!status.connected) bleIntervalState.textContent = '手柄未连接 · 普通断连恢复默认，模式切换会恢复上次超频';
  else if (pending)
    bleIntervalState.textContent = '正在协商，请稍候…';
  else if (status.state === 3 && status.selected)
    bleIntervalState.textContent = `恢复超频未确认 · 保存目标 ${({4:'200',3:'266',2:'400'}[status.targetUnits] || '实验')}Hz`;
  else if (bleIntervalConfirmed) bleIntervalState.textContent = `已启用 · 实际间隔 ${status.units * 1.25}ms · 普通断连恢复默认，模式切换会恢复`;
  else bleIntervalState.textContent = `已关闭 · 实际间隔 ${(status.units * 1.25).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}ms`;
  bleIntervalBusy(configBusy);
  return status;
}
async function bleIntervalConnected(device, extensions) {
  bleIntervalSupported = Boolean(extensions & 8);
  bleIntervalDevice = device;
  if (!bleIntervalSupported) { bleIntervalUnknown('需更新支持 200Hz 的实验固件'); return; }
  // The connection handler already owns the shared config lock.
  await bleIntervalRefresh(device, true);
}
async function bleIntervalRefresh(device, lockHeld = false) {
  if (!bleIntervalSupported || device !== bleIntervalDevice || (configBusy && !lockHeld)) return;
  if (!lockHeld) configBusy = true;
  const openedHere = !device.opened;
  try {
    if (openedHere) await device.open();
    const status = await readBleInterval(device);
    if ((status.state === 1 || (status.state === 2 && status.units !== status.targetUnits)) && status.selected) {
      if (!bleIntervalRestorePollUntil) bleIntervalRestorePollUntil = Date.now() + 60000;
    } else if (status.connected && status.state === 2 && status.units === status.targetUnits) {
      bleIntervalRestorePollUntil = 0;
    }
    return status;
  } catch (error) { bleIntervalUnknown(`状态未确认：${error.message}`); }
  finally {
    if (openedHere && device.opened) { try { await device.close(); } catch (_) {} }
    if (!lockHeld) { configBusy = false; bleIntervalBusy(false); }
  }
}
function bleIntervalShouldPollRestore() { return Date.now() < bleIntervalRestorePollUntil; }
async function bleIntervalOperation() {
  if (!bleIntervalDevice || !bleIntervalSupported || configBusy) return;
  const device = bleIntervalDevice, target = bleIntervalToggle.checked;
  const targetUnits = target ? Number(bleIntervalRate.value) : 6;
  if (![2,3,4,6].includes(targetUnits) || targetUnits < bleIntervalMinimum) return;
  const token = bleIntervalToken = (bleIntervalToken + 1) & 255;
  // Serialize feature-report traffic without dimming/disabling the whole console.
  // The shared lock keeps other HID actions from racing this negotiation.
  configBusy = true;
  bleIntervalBusy(true);
  bleIntervalState.textContent = '正在协商，请稍候…';
  try {
    await device.open();
    const request = new Uint8Array(63); request.set([1, Number(target), token]);
    // Zero retains compatibility with the original 200Hz-only firmware.
    request[3] = target && targetUnits !== 4 ? targetUnits : 0;
    await device.sendFeatureReport(14, request);
    const deadline = Date.now() + 8000;
    let confirmed = false;
    while (Date.now() < deadline) {
      const status = await readBleInterval(device);
      if (!status.connected) throw new Error('手柄已断连，恢复默认目标');
      if (status.token === token) {
        if (status.state === 3) throw new Error(`设备拒绝请求：0x${status.error.toString(16)}`);
        if (status.state === 2 && status.units === targetUnits) { confirmed = true; break; }
        if (status.state === 2 && status.event > 0 && status.selected !== target)
          throw new Error(`协商失败：${status.event}`);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!confirmed) throw new Error('协商超时，实际模式未确认，请刷新状态');
    line(`蓝牙回报率：${target ? ({4:'200',3:'266',2:'400'}[targetUnits] + 'Hz') : '默认约 133Hz'}，实际连接间隔已回读确认。`);
  } catch (error) {
    bleIntervalNegotiating = false;
    bleIntervalToggle.checked = bleIntervalConfirmed === true;
    bleIntervalRate.value = String(bleIntervalConfirmedUnits);
    bleIntervalState.textContent = `切换未确认：${error.message}`;
  } finally {
    if (device.opened) {
      try { await device.close(); } catch (error) { line(`关闭模式设备：${error.message}`); }
    }
    configBusy = false;
    bleIntervalBusy(false);
  }
}
bleIntervalToggle.addEventListener('change', bleIntervalOperation);
bleIntervalRate.addEventListener('change', () => {
  if (bleIntervalToggle.checked) return bleIntervalOperation();
});
bleIntervalReset();
