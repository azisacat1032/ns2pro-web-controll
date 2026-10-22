'use strict';
const calBegin = document.querySelector('#calibrationBegin'), calFinish = document.querySelector('#calibrationFinish');
const calSave = document.querySelector('#calibrationSave'), calCancel = document.querySelector('#calibrationCancel');
const calState = document.querySelector('#calibrationState'), calBadge = document.querySelector('#calibrationBadge');
let calDevice, calSnapshot, calTimer;
const calibrationActive = () => Boolean(calDevice && calSnapshot && calSnapshot.phase >= 1 && calSnapshot.phase <= 4);
const calibrationIsValid = () => Boolean(calDevice && calSnapshot?.valid);
function updateCalibrationMode() {
  if (!deadzoneDevice || !deadzoneConfirmed) return;
  deadzoneMode.textContent = calibrationIsValid()
    ? ((deadzoneConfirmed[0] & 1) ? '校准基准 + 自定义死区' : '校准默认 · 无额外死区')
    : ((deadzoneConfirmed[0] & 1) ? '固定量程 + 自定义死区' : '旧模式 · 尚未校准');
  deadzoneMode.textContent += (deadzoneConfirmed[0] & 2) ? ' · 圆角微方' : ' · 纯圆';
  if (calibrationIsValid() && !(deadzoneConfirmed[0] & 1)) {
    deadzoneRanges.forEach((range, i) => { range.value = [0, 100, 0, 100][i]; });
    drawDeadzones();
  }
}
function calibrationBusy(value) {
  const phase = calSnapshot?.phase;
  calBegin.disabled = value || !calDevice || (phase >= 1 && phase <= 4);
  calFinish.disabled = value || !calDevice || phase !== 2;
  calSave.disabled = value || !calDevice || phase !== 3;
  calCancel.disabled = value || !calDevice || ![1, 2, 3, 6].includes(phase);
}
function calibrationReset() {
  clearInterval(calTimer); calTimer = undefined; calDevice = undefined; calSnapshot = undefined;
  calBadge.textContent = '未连接'; calState.textContent = '连接后可采集中心与外圈，保存后作为默认基准。';
  for (const name of ['Center', 'Left', 'Right']) {
    document.querySelector(`#calibration${name}`).value = 0;
    document.querySelector(`#calibration${name}Text`).textContent = '—';
  }
  document.querySelector('#calibrationProgress').hidden = true;
  calibrationBusy(true);
}
async function calFetch(device) {
  const b = payloadOf(await device.receiveFeatureReport(12), 12);
  if (b[0] !== 1 || b[1] > 6 || b[2] > 1 || b[4] > 100 || b[5] > 32 || b[6] > 32 ||
      b[7] > 7 || b[44] !== 32 || b.slice(45).some(v => v)) throw new Error('校准状态格式不符合预期');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { phase: b[1], valid: Boolean(b[2]), token: b[3], center: b[4], left: b[5], right: b[6],
    error: b[7], session: view.getUint32(8, true), generation: view.getUint32(12, true), storageError: view.getUint32(36, true) };
}
function calAccept(snapshot) {
  calSnapshot = snapshot;
  document.querySelector('#calibrationProgress').hidden = snapshot.phase === 0;
  const messages = [
    snapshot.valid ? '已加载校准基准，默认按实测中心与外沿输出。' : '尚未校准，100% 外边界仍使用固定名义量程。',
    '松开两根摇杆与所有按键，保持静止约 1.5 秒。',
    '两根摇杆分别贴住外沿缓慢转 3–5 圈，补齐所有方向后点击“完成采样”。',
    '采样检查通过。点击“保存并作为默认”后才会应用新校准。',
    '正在保存并校验读回，请等待…',
    '校准已保存并生效。关闭自定义死区可使用校准默认；100% 外边界按实测外圈计算。',
    '校准未完成，原有配置继续生效。',
  ];
  const errors = ['', '没有新鲜摇杆数据，请先连接 NS2 Pro 后重新开始。', '检测到移动，已重新计时；请松开两根摇杆。',
    '外圈覆盖不足或转动时间过短，请继续贴边慢转。', '校准超时，请重新开始。',
    '保存未确认，当前仍用原有校准；重启后请重新读取状态。', '校准流程已被其他页面修改，请读取当前状态。',
    '外沿采样不一致，部分方向可能未推满，请继续贴边转动后再完成。'];
  calState.textContent = messages[snapshot.phase] + (snapshot.error ? ` ${errors[snapshot.error]}` : '');
  calBadge.textContent = snapshot.phase >= 1 && snapshot.phase <= 4 ? '采集中 · 原配置保持' : snapshot.valid ? '已校准' : '未校准';
  for (const [name, value, max] of [['Center', snapshot.center, 100], ['Left', snapshot.left, 32], ['Right', snapshot.right, 32]]) {
    document.querySelector(`#calibration${name}`).value = value;
    document.querySelector(`#calibration${name}Text`).textContent = max === 100 ? `${value}%` : `${value} / ${max}`;
  }
  updateCalibrationMode(); deadzoneBusy(configBusy); calibrationBusy(configBusy);
}
async function calibrationConnected(device, capabilities) {
  if (!(capabilities & 128)) { calBadge.textContent = '旧固件'; calState.textContent = '当前固件不支持摇杆校准。'; return; }
  const status = await calFetch(device); calDevice = device; calAccept(status);
  calTimer = setInterval(() => {
    if (!configBusy && !document.hidden && calibrationActive()) calOperation(async d => calAccept(await calFetch(d)));
  }, 500);
}
async function calOperation(action) {
  if (!calDevice || configBusy) return;
  const device = calDevice; busy(true);
  try { await device.open(); await action(device); }
  catch (error) { calState.textContent = `校准状态未确认：${error.message}。可重新连接读取，未确认前不要当作保存成功。`; }
  finally {
    if (device.opened) { try { await device.close(); } catch (error) { line(error.message); } }
    if (calDevice !== device) calibrationReset();
    busy(false);
  }
}
function calCommand(command) {
  return calOperation(async device => {
    const current = await calFetch(device);
    if (current.session !== calSnapshot.session) { calAccept(current); throw new Error('另一个页面更改了校准流程，已刷新'); }
    const token = crypto.getRandomValues(new Uint8Array(1))[0];
    const request = new Uint8Array(63); request.set([1, command, token]);
    new DataView(request.buffer).setUint32(3, current.session, true);
    await device.sendFeatureReport(12, request);
    const status = await calFetch(device); calAccept(status);
    if (status.token !== token || (command === 1 ? status.session !== ((current.session + 1) >>> 0) :
        command === 4 ? status.session !== ((current.session + 1) >>> 0) : status.session !== current.session))
      throw new Error('设备未接受本次校准请求');
  });
}
calBegin.addEventListener('click', () => calCommand(1));
calFinish.addEventListener('click', () => calCommand(2));
calSave.addEventListener('click', () => calCommand(3));
calCancel.addEventListener('click', () => calCommand(4));
calibrationReset();
