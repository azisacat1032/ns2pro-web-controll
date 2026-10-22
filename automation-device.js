'use strict';
const automationSize = 920, automationChunk = 49;
let automationDevice, automationConfirmed, automationSnapshot;
const automationIds = ['automationApply', 'automationSave', 'automationRead', 'automationStop', 'macroDeviceApply', 'macroDeviceSave', 'macroDeviceRead', 'macroDeviceStop'];
const automationStatus = text => {
  for (const id of ['turboDraftState', 'macroDraftState']) document.getElementById(id).textContent = text;
};
function automationBusy(value) {
  for (const id of automationIds) document.getElementById(id).disabled = value || !automationDevice;
  // Keep the upload snapshot stable while device commands run.
  for (const panel of ['turboPanel', 'macroPanel'])
    for (const control of document.getElementById(panel).querySelectorAll('input,select,button'))
      if (!automationIds.includes(control.id)) control.disabled = value;
}
function automationReset() {
  automationDevice = automationConfirmed = automationSnapshot = undefined;
  automationBusy(false);
  automationStatus('未连接 · 可编辑本地草稿，连接接收器后读取或应用。');
}
function automationCrc(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}
function automationEncode(draft) {
  if (!automationEditor.valid(draft)) throw Error('请检查步骤时长：须为 10–10000 ms 的整数');
  const out = new Uint8Array(automationSize), view = new DataView(out.buffer), triggers = new Set();
  out.set([1, draft.turbo.rate, draft.turbo.mode === 'toggle' ? 1 : 0]);
  view.setUint32(4, draft.turbo.buttons.reduce((mask, n) => mask | (1 << n), 0), true);
  draft.macros.forEach((macro, i) => {
    const at = 8 + 228 * i, name = new TextEncoder().encode(macro.name);
    if (name.length > 96) throw Error(`宏 ${i + 1} 名称过长`);
    if (macro.trigger !== '' && macro.steps.length) {
      if (triggers.has(macro.trigger)) throw Error('多个宏不能使用相同的触发键');
      triggers.add(macro.trigger);
    }
    out.set([macro.trigger === '' ? 255 : macro.trigger, ['once', 'hold', 'toggle'].indexOf(macro.mode), macro.steps.length, name.length], at);
    out.set(name, at + 4);
    macro.steps.forEach((step, n) => {
      const p = at + 100 + 4 * n;
      out[p] = step.type === 'wait' ? 1 : 0; out[p + 1] = step.type === 'wait' ? 255 : step.button;
      view.setUint16(p + 2, step.duration, true);
    });
  });
  return out;
}
function automationDecode(bytes) {
  if (bytes.length !== automationSize || bytes[0] !== 1 || bytes[3] || bytes[2] > 1) throw Error('设备连发/宏配置版本无效');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), mask = view.getUint32(4, true);
  if (mask >>> 21) throw Error('设备连发按键无效');
  const draft = {version: 1, turbo: {rate: bytes[1], mode: bytes[2] ? 'toggle' : 'hold', buttons: []}, macros: []};
  for (let n = 0; n < 21; n++) if (mask & (1 << n)) draft.turbo.buttons.push(n);
  for (let i = 0; i < 4; i++) {
    const at = 8 + 228 * i;
    if (bytes[at + 2] > 32 || bytes[at + 3] > 96) throw Error('设备宏长度无效');
    const macro = {trigger: bytes[at] === 255 ? '' : bytes[at], mode: ['once', 'hold', 'toggle'][bytes[at + 1]],
      name: new TextDecoder('utf-8', {fatal: true}).decode(bytes.slice(at + 4, at + 4 + bytes[at + 3])), steps: []};
    for (let n = 0; n < bytes[at + 2]; n++) {
      const p = at + 100 + 4 * n;
      if (bytes[p] > 1) throw Error('设备宏步骤类型无效');
      macro.steps.push(bytes[p] ? {type: 'wait', duration: view.getUint16(p + 2, true)} :
        {type: 'button', button: bytes[p + 1], duration: view.getUint16(p + 2, true)});
    }
    draft.macros.push(macro);
  }
  const encoded = automationEncode(draft);
  if (!encoded.every((n, i) => n === bytes[i])) throw Error('设备宏配置包含无效或未识别数据');
  return draft;
}
async function automationFetch(device) {
  const bytes = payloadOf(await device.receiveFeatureReport(27), 27);
  if (bytes[0] !== 1 || bytes[1] > 5 || bytes[23] > 1 || bytes[24] > 1 || bytes.slice(31).some(n => n)) throw Error('连发/宏状态无效');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(20, true) !== automationSize) throw Error('固件宏容量不匹配，请更新控制台');
  return {state: bytes[1], token: bytes[2], error: bytes[3], generation: view.getUint32(4, true), session: view.getUint32(8, true),
    crc: view.getUint32(12, true), savedCrc: view.getUint32(16, true), saved: Boolean(bytes[23]), saving: Boolean(bytes[24])};
}
function automationPacket(op, token, generation, session, crc) {
  const p = new Uint8Array(63); p.set([1, op, token]);
  const v = new DataView(p.buffer); v.setUint32(3, generation, true); v.setUint32(7, session, true); v.setUint32(11, crc, true);
  return p;
}
async function automationReadAll(device, status) {
  const out = new Uint8Array(automationSize);
  for (let offset = 0; offset < out.length; offset += automationChunk) {
    const count = Math.min(automationChunk, out.length - offset), p = automationPacket(2, 0, status.generation, 0, 0);
    new DataView(p.buffer).setUint16(11, offset, true); p[13] = count;
    await device.sendFeatureReport(28, p);
    const reply = payloadOf(await device.receiveFeatureReport(28), 28);
    if (!p.slice(0, 14).every((n, i) => n === reply[i])) throw Error('读取被其他页面打断，请重新读取');
    out.set(reply.slice(14, 14 + count), offset);
  }
  const after = await automationFetch(device);
  if (after.generation !== status.generation || after.crc !== status.crc || automationCrc(out) !== status.crc) throw Error('设备配置在读取期间改变，请重新读取');
  automationDecode(out);
  return out;
}
async function automationConnected(device, capabilities) {
  automationReset();
  if (!(capabilities & 16)) { automationStatus('当前固件不支持连发和宏；可编辑本地草稿，更新固件后可应用。'); return; }
  try {
    const status = await automationFetch(device), bytes = await automationReadAll(device, status);
    automationDevice = device; automationConfirmed = bytes; automationSnapshot = status;
    if (!automationEditor.hasDraft()) automationEditor.set(automationDecode(bytes));
    automationStatus('已连接 · 应用全部即时生效；保存到设备后断电保留。已有本地草稿会保留，点击读取设备可同步。');
  } catch (e) { automationStatus(`连发/宏读取失败：${e.message}`); }
}
async function automationOperation(action) {
  if (!automationDevice || configBusy) return;
  const device = automationDevice; busy(true);
  try {
    await device.open(); await action(device);
  } catch (e) { automationStatus(`操作未确认：${e.message}。请读取设备核对，勿视为保存成功。`); }
  finally {
    if (device.opened) try { await device.close(); } catch (e) { line(e.message); }
    busy(false);
  }
}
async function automationApplyAll(device, persist) {
  const bytes = automationEncode(automationEditor.get()), crc = automationCrc(bytes);
  const before = await automationFetch(device);
  if (before.saving) throw Error('设备正在保存，请稍后再试');
  if (before.generation !== automationSnapshot.generation || before.crc !== automationSnapshot.crc) throw Error('其他页面修改了配置，请先读取设备');
  const random = crypto.getRandomValues(new Uint32Array(2)), session = random[0] || 1, token = random[1] & 255;
  if (!bytes.every((n, i) => n === automationConfirmed[i])) {
    let committed = false;
    try {
      await device.sendFeatureReport(27, automationPacket(1, token, before.generation, session, crc));
      for (let offset = 0; offset < bytes.length; offset += automationChunk) {
        const count = Math.min(automationChunk, bytes.length - offset), p = automationPacket(1, token, before.generation, session, 0);
        new DataView(p.buffer).setUint16(11, offset, true); p[13] = count; p.set(bytes.slice(offset, offset + count), 14);
        await device.sendFeatureReport(28, p);
      }
      await device.sendFeatureReport(27, automationPacket(2, token, before.generation, session, crc));
      committed = true;
    } finally {
      if (!committed) try { await device.sendFeatureReport(27, automationPacket(5, token, before.generation, session, 0)); } catch (_) { /* upload expires after 10 seconds */ }
    }
    const status = await automationFetch(device);
    if (status.token !== token || status.generation !== ((before.generation + 1) >>> 0) || status.crc !== crc) throw Error('设备未确认应用');
    const readback = await automationReadAll(device, status);
    if (!bytes.every((n, i) => n === readback[i])) throw Error('设备读回与草稿不一致');
    automationSnapshot = status; automationConfirmed = readback;
  }
  if (!persist) { automationStatus('连发和全部宏已应用并逐字节读回确认；尚未保存到设备。请松开触发键后再按下。'); return; }
  await device.sendFeatureReport(27, automationPacket(3, token, automationSnapshot.generation, 0, crc));
  for (let round = 0; round < 60; round++) {
    const status = await automationFetch(device);
    if (status.token !== token || status.generation !== automationSnapshot.generation || status.crc !== crc) throw Error('保存被其他操作打断');
    if (status.state === 5) throw Error('设备存储或校验失败');
    if (status.state === 4 && !status.saving && status.saved && status.savedCrc === crc) {
      automationSnapshot = status; automationStatus('连发和全部宏已应用并保存到设备，存储校验通过；断电后自动恢复。请松开触发键后再按下。'); return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('等待保存超时');
}
for (const prefix of ['automation', 'macroDevice']) {
  document.getElementById(`${prefix}Apply`).addEventListener('click', () => automationOperation(d => automationApplyAll(d, false)));
  document.getElementById(`${prefix}Save`).addEventListener('click', () => automationOperation(d => automationApplyAll(d, true)));
  document.getElementById(`${prefix}Read`).addEventListener('click', () => automationOperation(async d => {
    const status = await automationFetch(d), bytes = await automationReadAll(d, status);
    automationSnapshot = status; automationConfirmed = bytes; automationEditor.set(automationDecode(bytes));
    automationStatus(status.saved && status.savedCrc === status.crc ? '已读取设备：当前配置已保存，断电保留。' : '已读取设备：当前配置尚未保存到设备。');
  }));
  document.getElementById(`${prefix}Stop`).addEventListener('click', () => automationOperation(async d => {
    const status = await automationFetch(d), token = crypto.getRandomValues(new Uint8Array(1))[0];
    await d.sendFeatureReport(27, automationPacket(4, token, status.generation, 0, 0));
    const after = await automationFetch(d);
    if (after.token !== token) throw Error('设备未确认停止');
    automationStatus('已停止全部连发和宏。配置保留；松开触发键后可重新触发。');
  }));
}
automationReset();
