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
let runtimeDevice, runtimeTimer, triggerConfirmed;

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
  batteryCells.forEach(cell => cell.classList.remove('filled'));
  batteryIcon.style.color = '#777'; batteryIcon.setAttribute('aria-label', '电量未知');
  batteryLevel.textContent = '电量未知'; batteryIcon.title = '电量未知'; showCharge(false, false);
  batteryMeta.textContent = reason;
}
function runtimeReset() {
  clearInterval(runtimeTimer); runtimeTimer = undefined; runtimeDevice = undefined;
  triggerConfirmed = undefined; triggerToggle.checked = false;
  triggerState.textContent = '尚未读取'; runtimePanel.hidden = false;
  unknownBattery(); runtimeBusy(true);
}
function showRuntime(bytes) {
  if (bytes[0] !== 1 || bytes.slice(1, 4).some(v => v > 1) || bytes[5] > 1 || bytes[6] > 1 ||
      (bytes[3] && (bytes[4] < 1 || bytes[4] > 7)) || (!bytes[3] && bytes[4] !== 255) ||
      bytes.slice(16).some(v => v)) throw new Error('手柄状态格式不符合预期');
  triggerConfirmed = Boolean(bytes[1]); triggerToggle.checked = triggerConfirmed;
  triggerState.textContent = triggerConfirmed ? '已开启' : '已关闭';
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
}
async function readRuntime(device) { const bytes = payloadOf(await device.receiveFeatureReport(9), 9); showRuntime(bytes); return bytes; }
async function runtimeConnected(device, capabilities) {
  if (!(capabilities & 32)) return;
  await readRuntime(device);
  runtimeDevice = device; runtimePanel.hidden = false;
  runtimeTimer = setInterval(() => {
    const active = document.activeElement;
    if (configBusy || document.hidden || active?.matches('input[type="range"], select')) return;
    runtimeOperation(false);
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
