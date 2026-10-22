'use strict';
const runtimePanel = document.querySelector('#runtimePanel');
const triggerToggle = document.querySelector('#triggerToggle');
const triggerState = document.querySelector('#triggerState');
const runtimeRead = document.querySelector('#runtimeRead');
const batteryIcon = document.querySelector('#batteryIcon');
const batteryCells = Array.from(document.querySelectorAll('.battery-cell'));
const batteryLevel = document.querySelector('#batteryLevel');
const chargeState = document.querySelector('#chargeState');
const batteryMeta = document.querySelector('#batteryMeta');
const batteryVoltage = document.querySelector('#batteryVoltage');
function unknownVoltage(reason = '等待有效 FD2 电压遥测。') {
  batteryVoltage.textContent = '电压未知'; batteryVoltage.title = reason;
}
let runtimeDevice, runtimeTimer, triggerConfirmed;

const usbRate = document.querySelector('#usbRate'), bleRate = document.querySelector('#bleRate');
const rateState = document.querySelector('#rateState');
let rateSupported = false, ratePrevious;
function rateReset(message = '连接接收器后显示') {
  ratePrevious = undefined; usbRate.textContent = bleRate.textContent = '—'; rateState.textContent = message;
}
function showRates(b) {
  if (b[0] !== 1 || b[1] > 3 || b[2] || b[3] || b.slice(32).some(v=>v)) throw new Error('回报率数据格式无效');
  const view = new DataView(b.buffer,b.byteOffset,b.byteLength);
  const sample = {flags:b[1], time:view.getUint32(4,true), ble:view.getUint32(8,true), usb:view.getUint32(12,true), epoch:view.getUint32(24,true)};
  const previous = ratePrevious;
  if (!previous || ((sample.time-previous.time)>>>0)>10000 || sample.epoch!==previous.epoch || sample.flags!==previous.flags) {
    rateReset('正在采样…'); ratePrevious = sample;
  } else {
    const elapsed = (sample.time-previous.time)>>>0;
    if (elapsed >= 500) {
      const ble = ((sample.ble-previous.ble)>>>0)*1000/elapsed, usb = ((sample.usb-previous.usb)>>>0)*1000/elapsed;
      if (ble>8000 || usb>8000) rateReset('计数已重置，重新采样…');
      else {
        bleRate.textContent = (sample.flags&1) ? `${ble.toFixed(1)} Hz` : '未连接';
        usbRate.textContent = (sample.flags&2) ? `${usb.toFixed(1)} Hz` : '未就绪';
        rateState.textContent = `最近 ${(elapsed/1000).toFixed(1)} 秒平均 · USB 成功报告 / 蓝牙输入帧`;
      }
      ratePrevious = sample;
    }
  }
  if (!(sample.flags&1)) bleRate.textContent = '未连接';
  if (!(sample.flags&2)) usbRate.textContent = '未就绪';
}

function runtimeBusy(value) {
  triggerToggle.disabled = value || !runtimeDevice;
  runtimeRead.disabled = value || !runtimeDevice;
}
function showCharge(known, charging) {
  const description = known ? (charging ? '充电中' : '未充电') : '充电状态未知';
  chargeState.textContent = known ? (charging ? 'ϟ' : '') : '?';
  chargeState.title = description;
  chargeState.setAttribute('aria-label', description);
  chargeState.dataset.charging = String(known && charging);
  batteryIcon.dataset.charging = String(known && charging);
}
function unknownBattery(reason = '等待真实手柄数据。') {
  unknownVoltage(reason);
  batteryCells.forEach(cell => cell.classList.remove('filled'));
  batteryIcon.style.color = '#777'; batteryIcon.setAttribute('aria-label', '电量未知');
  batteryLevel.textContent = '电量未知'; batteryIcon.title = '电量未知'; showCharge(false, false);
  batteryMeta.textContent = reason;
}
function runtimeReset() {
  rateSupported = false; rateReset();
  if (typeof bleIntervalReset === 'function') bleIntervalReset();
  if (typeof ordinaryAlgorithmReset === 'function') ordinaryAlgorithmReset();
  clearInterval(runtimeTimer); runtimeTimer = undefined; runtimeDevice = undefined;
  triggerConfirmed = undefined; triggerToggle.checked = false;
  triggerState.textContent = '尚未读取'; runtimePanel.hidden = false;
  unknownBattery(); runtimeBusy(true);
}
function showRuntime(bytes, updateTrigger = true) {
  if (bytes[0] !== 1 || bytes.slice(1, 4).some(v => v > 1) || bytes[5] > 1 || bytes[6] > 1 ||
      (bytes[3] && (bytes[4] < 1 || bytes[4] > 7)) || (!bytes[3] && bytes[4] !== 255) ||
      bytes[16] > 1 || bytes[19] || bytes.slice(24).some(v => v)) throw new Error('手柄状态格式不符合预期');
  if (updateTrigger) {
  triggerConfirmed = Boolean(bytes[1]); triggerToggle.checked = triggerConfirmed;
  triggerState.textContent = triggerConfirmed ? '已开启' : '已关闭';
  }
  if (!bytes[2]) { unknownBattery('手柄尚未通过 BLE 连接。'); return; }
  if (bytes[3]) {
    const level = bytes[4];
    batteryCells.forEach((cell, i) => cell.classList.toggle('filled', i < level));
    batteryIcon.style.color = level === 1 ? '#d84848' : level <= 3 ? '#b88710' : '#279558';
    batteryIcon.setAttribute('aria-label', `电量 ${level} / 7 档`);
    batteryLevel.textContent = `${level} / 7 档`;
    const age = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
    batteryMeta.textContent = age === 0xffffffff ? '最近有效放电档位，采样时间未知。'
      : `沿用最近有效放电档位，档位更新约 ${Math.floor(age / 1000)} 秒前。`;
  } else unknownBattery('已连接，尚无有效的放电档位；等待现有采样流程。');
  showCharge(Boolean(bytes[5]), Boolean(bytes[6]));
  if (bytes[5] && bytes[6]) {
    batteryIcon.style.color = '#b88710';
    batteryIcon.setAttribute('aria-label', '充电中');
    batteryLevel.textContent = '充电中';
    batteryMeta.textContent = '充电中';
  }
  batteryIcon.title = `${batteryIcon.getAttribute('aria-label')}；${batteryMeta.textContent}`;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[16] && view.getUint32(20, true) <= 5000) {
    const mv = view.getUint16(17, true);
    batteryVoltage.textContent = `${(mv / 1000).toFixed(3)} V`;
    batteryVoltage.title = `${mv} mV · FD2 电压遥测`;
  } else unknownVoltage();
}
async function readRuntime(device) {
  const bytes = payloadOf(await device.receiveFeatureReport(9), 9); showRuntime(bytes);
  if (rateSupported) {
    try { showRates(payloadOf(await device.receiveFeatureReport(13), 13)); }
    catch (error) { rateReset(`回报率读取失败：${error.message}`); }
  }
  if (typeof bleIntervalRefresh === 'function') await bleIntervalRefresh(device, true);
  if (typeof ordinaryAlgorithmRefresh === 'function') await ordinaryAlgorithmRefresh(device);
  if (typeof controllerPresetRefresh === 'function') await controllerPresetRefresh(device);
  if (typeof usbModeRefresh === 'function') await usbModeRefresh(device);
  return bytes;
}
async function readRateStatus(device) {
  if (!device || configBusy) return;
  // Serialize HID access without disabling every control or changing its value.
  configBusy = true;
  try {
    await device.open();
    try {
      const status = payloadOf(await device.receiveFeatureReport(9), 9);
      if (device === runtimeDevice) showRuntime(status, false);
    } catch (error) { unknownBattery(`状态读取失败：${error.message}`); }
    if (rateSupported) {
      const sample = payloadOf(await device.receiveFeatureReport(13), 13);
      if (device === runtimeDevice) showRates(sample);
    }
  }
  catch (error) { unknownBattery(`状态读取失败：${error.message}`); rateReset(`回报率读取失败：${error.message}`); }
  finally {
    if (device.opened) { try { await device.close(); } catch (_) {} }
    configBusy = false;
  }
}
async function runtimeConnected(device, capabilities, extensions = 0) {
  if (!(capabilities & 32)) return;
  rateSupported = Boolean(extensions & 4);
  rateReset(rateSupported ? '正在采样…' : '需更新固件以显示回报率');
  if (typeof bleIntervalConnected === 'function') await bleIntervalConnected(device, extensions);
  await readRuntime(device);
  runtimeDevice = device; runtimePanel.hidden = false;
  runtimeTimer = setInterval(() => {
    const active = document.activeElement;
    if (configBusy || document.hidden || active?.matches('input[type="range"], select, #presetName')) return;
    // Read BLE status too: the controller can connect after the console does,
    // and a transient status-read failure must recover without reconnecting USB.
    const currentDevice = runtimeDevice;
    return readRateStatus(currentDevice).then(() => {
      if (currentDevice === runtimeDevice && typeof bleIntervalRefresh === 'function')
        return bleIntervalRefresh(currentDevice);
    });
  }, 2000);
}
async function runtimeOperation(write) {
  if (!runtimeDevice || configBusy) return;
  const device = runtimeDevice, target = triggerToggle.checked;
  busy(true);
  try {
    await device.open();
    if (write) {
      const request = new Uint8Array(63); request.set([1, Number(target)]);
      await device.sendFeatureReport(9, request);
    }
    const bytes = await readRuntime(device);
    if (write && Boolean(bytes[1]) !== target) throw new Error('扳机开关回读与目标不一致');
    if (write) line(`自适应混合扳机震动：${bytes[1] ? '开启' : '关闭'}，已回读确认。`);
  } catch (error) {
    if (triggerConfirmed !== undefined) triggerToggle.checked = triggerConfirmed;
    triggerState.textContent = `当前状态未确认：${error.message}`;
    unknownBattery('状态读取失败，未显示旧电量。请重新刷新或连接。');
    rateReset('连接异常，请重新读取');
    if (typeof bleIntervalUnknown === 'function') bleIntervalUnknown('连接异常，状态未确认');
  } finally {
    if (device.opened) {
      try { await device.close(); } catch (error) { line(`关闭状态设备: ${error.message}`); }
    }
    busy(false);
  }
}
triggerToggle.addEventListener('change', () => runtimeOperation(true));
runtimeRead.addEventListener('click', () => runtimeOperation(false));
runtimeReset();
