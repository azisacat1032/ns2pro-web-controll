'use strict';
const ordinaryAlgorithmToggle = document.querySelector('#ordinaryAlgorithmToggle');
const ordinaryAlgorithmState = document.querySelector('#ordinaryAlgorithmState');
const ordinaryProfileSelect = document.querySelector('#ordinaryProfile');
const ordinaryCustomOption = document.querySelector('#ordinaryCustomOption');
const ordinaryReferenceOption = document.querySelector("#ordinaryReferenceOption");
let ordinaryAlgorithmMultiModeSupported = false;
function ordinaryTuningModeSupported() {
  return ordinaryAlgorithmMode === 1 || (ordinaryAlgorithmMultiModeSupported && [0,2].includes(ordinaryAlgorithmMode));
}
let ordinaryReferenceSupported = false;
let ordinaryEnvelopeSupported = false;
let ordinaryCustomSupported = false;
let ordinaryLocalSupported = false;
let ordinaryAlgorithmDevice, ordinaryAlgorithmSupported = false, ordinaryAlgorithmMode;
let ordinaryAlgorithmConfirmed, ordinaryAlgorithmPending = false, ordinaryAlgorithmToken = 0;
let ordinaryProfileSupported = false, ordinaryProfileConfirmed, ordinaryProfileStatus;

function ordinaryAlgorithmBusy(value) {
  ordinaryReferenceOption.hidden = !ordinaryReferenceSupported || !ordinaryTuningModeSupported();
  ordinaryReferenceOption.disabled = ordinaryReferenceOption.hidden;
  ordinaryCustomOption.hidden = !ordinaryCustomSupported || !ordinaryTuningModeSupported();
  ordinaryCustomOption.disabled = ordinaryCustomOption.hidden;
  if (typeof referenceTuningBusy === 'function') referenceTuningBusy(value);
  if (typeof xboxCustomBusy === 'function') xboxCustomBusy(value);
  ordinaryAlgorithmToggle.disabled = value || ordinaryAlgorithmPending || !ordinaryAlgorithmDevice ||
    !ordinaryAlgorithmSupported || ordinaryAlgorithmMode === 3 || ordinaryAlgorithmConfirmed === undefined;
  ordinaryProfileSelect.hidden = !ordinaryTuningModeSupported();
  ordinaryProfileSelect.disabled = ordinaryAlgorithmToggle.disabled || !ordinaryProfileSupported || !ordinaryAlgorithmConfirmed || ordinaryProfileConfirmed === undefined;
}
function ordinaryAlgorithmReset() {
  ordinaryAlgorithmDevice = undefined; ordinaryAlgorithmSupported = false;
  ordinaryAlgorithmMode = undefined; ordinaryAlgorithmConfirmed = undefined; ordinaryAlgorithmPending = false;
  ordinaryAlgorithmMultiModeSupported = false; ordinaryLocalSupported = false; ordinaryCustomSupported = false; ordinaryEnvelopeSupported = false; ordinaryReferenceSupported = false;
  ordinaryProfileSupported = false; ordinaryProfileConfirmed = undefined; ordinaryProfileStatus = undefined;
  ordinaryProfileSelect.value = '5';
  ordinaryAlgorithmToggle.checked = false;
  ordinaryAlgorithmState.textContent = '连接后读取算法'; ordinaryAlgorithmBusy(true);
}
async function ordinaryReadStatus(device, report) {
  const b = payloadOf(await device.receiveFeatureReport(report), report);
  const local = report === 18 && ordinaryLocalSupported ? b[12] : 0;
  const custom = report === 18 && ordinaryCustomSupported ? b[13] : 0;
  const envelope = report === 18 && ordinaryEnvelopeSupported ? b[14] : 0;
  const reference = report === 18 && ordinaryReferenceSupported ? b[15] : 0;
  const expected = reference & (1 << b[1]) ? 5 : envelope & (1 << b[1]) ? 4 : custom & (1 << b[1]) ? 3 : local & (1 << b[1]) ? 2 : Number(Boolean(b[7] & (1 << b[1])));
  const maximum = ordinaryReferenceSupported ? 5 : ordinaryEnvelopeSupported ? 4 : ordinaryCustomSupported ? 3 : ordinaryLocalSupported ? 2 : 1;
  if (b[0] !== 1 || b[1] > 3 || b[2] > 1 || b[3] > (report === 18 ? maximum : 1) ||
      b[4] > 3 || b[6] > maximum || b[7] > 7 || (reference & ~7) || (reference & (local | custom | envelope)) || (local & ~2) || (custom & ~7) || (envelope & ~2) || (local & custom) || ((local | custom) & envelope) ||
      b[2] !== Number(b[1] !== 3) || b[3] !== expected ||
      b.slice(report === 18 && ordinaryReferenceSupported ? 16 : report === 18 && ordinaryEnvelopeSupported ? 15 : report === 18 && ordinaryCustomSupported ? 14 : report === 18 && ordinaryLocalSupported ? 13 : 12).some(v => v))
    throw new Error('普通震动算法状态格式无效');
  return b;
}
async function ordinaryAlgorithmRefresh(device) {
  if (!ordinaryAlgorithmSupported || device !== ordinaryAlgorithmDevice) return;
  // Caller owns the config lock and has opened the device.
  const b = await ordinaryReadStatus(device, 17);
  ordinaryProfileStatus = ordinaryProfileSupported ? await ordinaryReadStatus(device, 18) : undefined;
  if (ordinaryProfileStatus && ordinaryProfileStatus[1] !== b[1]) throw new Error('普通震动档位模式不一致');
  ordinaryProfileConfirmed = ordinaryProfileStatus ? ordinaryProfileStatus[3] : undefined;
  ordinaryProfileSelect.value = [3,5].includes(ordinaryProfileConfirmed) ? String(ordinaryProfileConfirmed) : '';
  ordinaryAlgorithmMode = b[1]; ordinaryAlgorithmConfirmed = Boolean(b[3]); ordinaryAlgorithmPending = b[4] === 1;
  ordinaryAlgorithmToggle.checked = ordinaryAlgorithmConfirmed;
  const name = ['DS5', 'Xbox', 'DS5 Edge', '原生 Pro2'][b[1]];
  ordinaryAlgorithmState.textContent = !b[2] ? '原生 Pro2 由主机控制震动' : b[4] === 1 ? '正在保存算法选择…' :
    `${name} · ${b[3] ? (ordinaryProfileConfirmed === 5 ? '默认（仿枪械触觉反馈）' : ordinaryProfileConfirmed === 3 ? '自定义（传统转子）' : ordinaryAlgorithmMode === 1 ? '旧档位已移除，请选择默认或自定义' : '线性优化') : '原始震动'} · 各模式独立保存`;
  if (b[3] && ordinaryProfileConfirmed === 5) ordinaryAlgorithmState.textContent += ' · 连射更分明，单发有冲击和回落；也适合载具，跳跃等动作也可能带颗粒感';
  ordinaryAlgorithmBusy(configBusy);
  return b;
}
async function ordinaryAlgorithmConnected(device, extensions, features = 0, extra = 0) {
  ordinaryAlgorithmReset(); ordinaryAlgorithmDevice = device; ordinaryAlgorithmMultiModeSupported = Boolean(extra & 2);
  ordinaryAlgorithmSupported = Boolean(extensions & 64);
  ordinaryProfileSupported = Boolean(extensions & 128);
  ordinaryLocalSupported = Boolean(features & 2);
  ordinaryCustomSupported = Boolean(features & 4);
  ordinaryEnvelopeSupported = Boolean(features & 32);
  ordinaryReferenceSupported = Boolean(features & 64);
  if (!ordinaryAlgorithmSupported) { ordinaryAlgorithmState.textContent = '需更新支持算法开关的固件'; return; }
  await ordinaryAlgorithmRefresh(device);
}
async function ordinarySelectionOperation(report) {
  if (!ordinaryAlgorithmDevice || !ordinaryAlgorithmSupported || configBusy || ordinaryAlgorithmPending || ordinaryAlgorithmMode === 3) return;
  if (report === 18 && (!ordinaryProfileSupported || !ordinaryAlgorithmConfirmed || !ordinaryTuningModeSupported())) return;
  const device = ordinaryAlgorithmDevice, mode = ordinaryAlgorithmMode;
  const target = report === 18 ? Number(ordinaryProfileSelect.value) : Number(ordinaryAlgorithmToggle.checked);
  if (report === 18 && ![3,5].includes(target)) return;
  if (!Number.isInteger(target) || target < 0 || target > (report === 18 && ordinaryReferenceSupported && ordinaryTuningModeSupported() ? 5 : report === 18 && ordinaryEnvelopeSupported && mode === 1 ? 4 : report === 18 && ordinaryCustomSupported && ordinaryTuningModeSupported() ? 3 : report === 18 && ordinaryLocalSupported && mode === 1 ? 2 : 1)) return;
  const token = ordinaryAlgorithmToken = (ordinaryAlgorithmToken + 1) & 255;
  busy(true); ordinaryAlgorithmState.textContent = '正在保存算法选择…';
  try {
    await device.open();
    const request = new Uint8Array(63); request.set([1, mode, Number(target), token]);
    await device.sendFeatureReport(report, request);
    const deadline = Date.now() + 5000;
    let confirmed = false;
    while (Date.now() < deadline) {
      const algorithm = await ordinaryAlgorithmRefresh(device);
      const b = report === 18 ? ordinaryProfileStatus : algorithm;
      if (device !== ordinaryAlgorithmDevice || b[1] !== mode || b[5] !== token)
        throw new Error('算法选择已被其他操作修改，请重新读取');
      if (b[4] === 3) throw new Error(`设备保存失败：0x${new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(8,true).toString(16)}`);
      if (b[4] === 2 && b[3] === target) { confirmed = true; break; }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!confirmed) throw new Error('保存超时，请重新读取');
    if (typeof xboxCustomRefresh === 'function') await xboxCustomRefresh(device);
    if (ordinaryProfileConfirmed === 3 && typeof xboxCustomPanel !== 'undefined') xboxCustomPanel.open = true;
    line(`普通震动：${ordinaryAlgorithmState.textContent}，已保存并回读确认。`);
  } catch (error) {
    ordinaryAlgorithmToggle.checked = ordinaryAlgorithmConfirmed === true;
    ordinaryAlgorithmConfirmed = undefined;
    ordinaryProfileConfirmed = undefined;
    ordinaryAlgorithmState.textContent = `算法未确认：${error.message}。点击“读取”重试。`;
  } finally {
    if (device.opened) { try { await device.close(); } catch (_) {} }
    ordinaryAlgorithmPending = false;
    busy(false);
  }
}
ordinaryAlgorithmToggle.addEventListener('change', () => ordinarySelectionOperation(17));
ordinaryProfileSelect.addEventListener('change', () => ordinarySelectionOperation(18));
ordinaryAlgorithmReset();
