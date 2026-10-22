'use strict';
const gyroPanel = document.querySelector('#gyroPanel'), gyroState = document.querySelector('#gyroState');
const gyroBegin = document.querySelector('#gyroBegin'), gyroCancel = document.querySelector('#gyroCancel');
let gyroDevice, gyroSnapshot, gyroTimer;
function gyroMode() { gyroPanel.hidden = usbModeConfirmed === 1; }
function gyroBusy(value) {
  gyroMode();
  gyroBegin.disabled = value || !gyroDevice || [1,4].includes(gyroSnapshot?.phase);
  gyroCancel.disabled = value || !gyroDevice || gyroSnapshot?.phase !== 1;
}
function gyroReset() {
  clearInterval(gyroTimer); gyroTimer = undefined; gyroDevice = undefined; gyroSnapshot = undefined;
  document.querySelector('#gyroBadge').textContent = '未连接';
  gyroState.textContent = '将手柄平放在稳定桌面，松开所有按键后开始校准。';
  document.querySelector('#gyroProgressRow').hidden = true;
  gyroBusy(true);
}
async function gyroFetch(device) {
  const b = payloadOf(await device.receiveFeatureReport(26), 26);
  if (b[0] !== 2 || b[1] > 4 || b[2] > 1 || b[4] > 100 || b[5] > 4 ||
      b[6] || b[7] || b.slice(22).some(v => v)) throw new Error('陀螺仪校准状态格式不符合预期');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {phase:b[1], valid:Boolean(b[2]), token:b[3], progress:b[4], error:b[5],
    session:v.getUint32(8, true), bias:[12,14,16].map(i => v.getInt16(i, true))};
}
function gyroAccept(s) {
  gyroSnapshot = s;
  document.querySelector('#gyroBadge').textContent = ['待校准', '采样中', '已保存', '未完成', '保存中'][s.phase];
  const messages = [s.valid ? '已加载保存的陀螺仪零偏，断电重启后自动恢复。' : '将手柄平放在稳定桌面，松开所有按键后开始校准。',
    '请保持手柄静止约 2 秒，采样完成后自动保存，校验成功后生效。',
    `校准已保存并生效，断电后自动恢复。零偏 X / Y / Z：${s.bias.join(' / ')}。`,
    '校准未完成，保留之前的零偏。', '正在保存并校验读回，请等待…'];
  const errors = ['', '没有新鲜陀螺仪数据，请连接手柄后重新开始。', '检测到移动，已重新计时。', '静置采样超时，请重新开始。', '保存未确认，当前仍使用原零偏；重启后请重新读取状态。'];
  gyroState.textContent = messages[s.phase] + (s.error ? ` ${errors[s.error]}` : '');
  document.querySelector('#gyroProgressRow').hidden = ![1,4].includes(s.phase);
  document.querySelector('#gyroProgress').value = s.progress;
  document.querySelector('#gyroProgressText').textContent = `${s.progress}%`;
}
async function gyroConnected(device, capabilities) {
  gyroReset(); gyroMode();
  if (usbModeConfirmed === 1) return;
  if (!(capabilities & 8)) {
    document.querySelector('#gyroBadge').textContent = '旧固件';
    gyroState.textContent = '当前固件不支持陀螺仪校准，请更新接收器固件。'; return;
  }
  let s;
  try { s = await gyroFetch(device); }
  catch (e) { gyroState.textContent = '校准状态读取失败，或当前固件不支持断电保存，请更新固件后重新连接。'; return; }
  gyroDevice = device; gyroAccept(s);
  gyroTimer = setInterval(() => {
    if (!configBusy && !document.hidden && [1,4].includes(gyroSnapshot?.phase))
      gyroOperation(async d => gyroAccept(await gyroFetch(d)));
  }, 400);
}
async function gyroOperation(action) {
  if (!gyroDevice || configBusy || usbModeConfirmed === 1) return;
  const device = gyroDevice; busy(true);
  try { await device.open(); await action(device); }
  catch (e) { gyroState.textContent = `校准状态未确认：${e.message}。请重新连接读取状态。`; }
  finally {
    if (device.opened) try { await device.close(); } catch (e) { line(e.message); }
    busy(false);
  }
}
function gyroCommand(command) {
  return gyroOperation(async device => {
    const current = await gyroFetch(device);
    if (current.session !== gyroSnapshot.session) {
      gyroAccept(current); throw new Error('其他页面修改了校准流程，已刷新');
    }
    const token = crypto.getRandomValues(new Uint8Array(1))[0];
    const p = new Uint8Array(63); p.set([1, command, token]);
    new DataView(p.buffer).setUint32(3, current.session, true);
    await device.sendFeatureReport(26, p);
    const status = await gyroFetch(device); gyroAccept(status);
    if (status.token !== token || status.session !== ((current.session + 1) >>> 0))
      throw new Error('设备未接受校准请求，请确认手柄已连接并重新开始');
  });
}
gyroBegin.addEventListener('click', () => gyroCommand(1));
gyroCancel.addEventListener('click', () => gyroCommand(2));
gyroReset();
