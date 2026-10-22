'use strict';
const referenceTuningModeAvailable = () => ordinaryAlgorithmMode === 1 || (typeof ordinaryAlgorithmMultiModeSupported !== 'undefined' && ordinaryAlgorithmMultiModeSupported && [0,2].includes(ordinaryAlgorithmMode));
const referenceTuningPanel = document.querySelector('#referenceTuningPanel');
const referenceImpact = document.querySelector('#referenceImpact');
const referenceBody = document.querySelector('#referenceBody');
const referencePeriod = document.querySelector('#referencePeriod');
const referenceDepth = document.querySelector('#referenceDepth');
const referenceTexture = document.querySelector('#referenceTexture');
const referenceTuningState = document.querySelector('#referenceTuningState');
const referenceTuningRead = document.querySelector('#referenceTuningRead');
const referenceTuningSave = document.querySelector('#referenceTuningSave');
const referenceTuningDefaults = document.querySelector('#referenceTuningDefaults');
let referenceTuningDevice, referenceTuningSupported = false, referenceTuningCurrent;
let referenceTuningGeneration = 0, referenceTuningToken = 0, referenceTuningPending = false;

function referenceTuningLabels() {
  document.querySelector('#referencePeriodLabel').textContent = `${referencePeriod.value}ms`;
  document.querySelector('#referenceDepthLabel').textContent = `${referenceDepth.value}%`;
  document.querySelector('#referenceImpactLabel').textContent = `${referenceImpact.value}%`;
  document.querySelector('#referenceBodyLabel').textContent = `${referenceBody.value}%`;
  document.querySelector('#referenceTextureLabel').textContent = `${referenceTexture.value}%`;
}
function referenceTuningBusy(value) {
  referenceTuningPanel.hidden = !referenceTuningSupported || !referenceTuningModeAvailable();
  const lock = value || referenceTuningPending || !referenceTuningDevice || !referenceTuningSupported;
  referenceTuningRead.disabled = lock;
  const edit = lock || !ordinaryAlgorithmConfirmed || ordinaryProfileConfirmed !== 5 || !referenceTuningCurrent;
  referenceImpact.disabled = referenceBody.disabled = referenceTexture.disabled = referencePeriod.disabled = referenceDepth.disabled = referenceTuningSave.disabled = referenceTuningDefaults.disabled = edit;
}
function referenceTuningReset() {
  referenceTuningDevice = undefined; referenceTuningSupported = false; referenceTuningCurrent = undefined;
  referenceTuningPending = false; referenceTuningGeneration = 0;
  referenceImpact.value = '100'; referenceBody.value = '100'; referenceTexture.value = '100'; referencePeriod.value = '100'; referenceDepth.value = '70'; referenceTuningLabels();
  referenceTuningState.textContent = '选择“默认（仿枪械触觉反馈）”后可调节。'; referenceTuningBusy(true);
}
async function referenceTuningRefresh(device) {
  if (!referenceTuningSupported || device !== referenceTuningDevice) return;
  const b = payloadOf(await device.receiveFeatureReport(23), 23);
  if (b.length === 63 && b[0] < 3) {
    referenceTuningSupported = false; referenceTuningCurrent = undefined;
    referenceTuningState.textContent = '需更新支持持续纹理的固件'; referenceTuningBusy(true); return;
  }
  if (b.length !== 63 || b[0] !== 3 || b[1] !== ordinaryAlgorithmMode || b[2] > 3 || b[4] > 2 ||
      b[5] > 1 || b[6] > 1 || b[7] !== 5 || b.slice(16,22).some(v=>v>200) || b[22]<60 || b[22]>210 || b[22]%10 || b[23]>100 || b[23]%10 || b[24]<60 || b[24]>210 || b[24]%10 || b[25]>100 || b[25]%10 || b.slice(26).some(v=>v))
    throw new Error('默认震动参数状态格式无效');
  referenceTuningGeneration = new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(8,true);
  referenceTuningCurrent = [...b.slice(16,19),b[22],b[23]];
  referenceImpact.value = String(b[16]); referenceBody.value = String(b[17]); referenceTexture.value = String(b[18]); referencePeriod.value = String(b[22]); referenceDepth.value = String(b[23]); referenceTuningLabels();
  referenceTuningState.textContent = b[2] === 1 ? '正在应用…' :
    `${b[6] ? '当前参数未保存' : '已保存'} · ${ordinaryAlgorithmConfirmed && ordinaryProfileConfirmed === 5 ? '默认档位生效' : '选择“默认（仿枪械触觉反馈）”后生效'}`;
  referenceTuningBusy(configBusy); return b;
}
async function referenceTuningConnected(device, features) {
  referenceTuningReset(); referenceTuningDevice = device; referenceTuningSupported = Boolean(features & 128);
  if (referenceTuningSupported) await referenceTuningRefresh(device);
}
async function referenceTuningOperation(op) {
  if (configBusy || !referenceTuningDevice || !referenceTuningSupported || referenceTuningPending) return;
  if (op !== -1 && (!referenceTuningCurrent || !referenceTuningModeAvailable() || !ordinaryAlgorithmConfirmed || ordinaryProfileConfirmed !== 5)) return;
  const device = referenceTuningDevice;
  const desired = op === 2 ? [100,100,100,100,70] : [Number(referenceImpact.value),Number(referenceBody.value),Number(referenceTexture.value),Number(referencePeriod.value),Number(referenceDepth.value)];
  if (desired.some(v=>!Number.isInteger(v)||v<0) || desired.slice(0,3).some(v=>v>200) || desired[3]<60 || desired[3]>210 || desired[3]%10 || desired[4]>100 || desired[4]%10) return;
  referenceTuningPending = true; busy(true);
  try {
    await device.open();
    if (op === -1) { await referenceTuningRefresh(device); return; }
    const token = referenceTuningToken = (referenceTuningToken + 1) & 255;
    const p = new Uint8Array(63); p.set([3,op,token]);
    new DataView(p.buffer).setUint32(3,referenceTuningGeneration,true); p.set(desired,7);
    await device.sendFeatureReport(23,p);
    for (let i=0;i<60;++i) {
      const b = await referenceTuningRefresh(device);
      if (device !== referenceTuningDevice || !b || b[3] !== token || b[4] !== op) throw new Error('参数被其他操作修改，请重新读取');
      if (b[2] === 3) throw new Error(`设备操作失败：0x${new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(12,true).toString(16)}`);
      if (b[2] === 2) {
        if (b[16] !== desired[0] || b[17] !== desired[1] || b[18] !== desired[2] || b[22] !== desired[3] || b[23] !== desired[4] || (op === 1 && (!b[5] || b[6] || b[19] !== desired[0] || b[20] !== desired[1] || b[21] !== desired[2] || b[24] !== desired[3] || b[25] !== desired[4])))
          throw new Error('参数回读不一致');
        line(`默认震动参数：冲击 ${b[16]}%，主体 ${b[17]}%，瞬态纹理 ${b[18]}%，持续间隔 ${b[22]}ms、深度 ${b[23]}%，${op === 1 ? '已保存到设备' : '已应用，保存后断电保留'}。`); return;
      }
      await new Promise(resolve=>setTimeout(resolve,80));
    }
    throw new Error('操作超时，请重新读取');
  } catch (error) {
    referenceTuningCurrent = undefined;
    referenceTuningState.textContent = `参数未确认：${error.message}。点击“读取参数”重试。`;
  } finally {
    if (device.opened) { try { await device.close(); } catch (_) {} }
    referenceTuningPending = false; busy(false);
  }
}
for (const range of [referenceImpact,referenceBody,referenceTexture,referencePeriod,referenceDepth]) {
  range.addEventListener('input',referenceTuningLabels);
  range.addEventListener('change',()=>referenceTuningOperation(0));
}
referenceTuningRead.addEventListener('click',()=>referenceTuningOperation(-1));
referenceTuningSave.addEventListener('click',()=>referenceTuningOperation(1));
referenceTuningDefaults.addEventListener('click',()=>referenceTuningOperation(2));
referenceTuningReset();
