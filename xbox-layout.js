'use strict';
const xboxLayoutControl = document.querySelector('#xboxLayoutControl');
const xboxLayoutToggle = document.querySelector('#xboxLayoutToggle');
const xboxLayoutState = document.querySelector('#xboxLayoutState');
let xboxLayoutDevice, xboxLayoutSupported = false, xboxLayoutConfirmed;
let xboxLayoutPending = false, xboxLayoutToken = 0;

function xboxLayoutBusy(value) {
  xboxLayoutControl.hidden = usbModeConfirmed !== 1;
  xboxLayoutToggle.disabled = value || xboxLayoutPending || !xboxLayoutDevice ||
    !xboxLayoutSupported || usbModeConfirmed !== 1 || xboxLayoutConfirmed === undefined;
}
function xboxLayoutReset() {
  xboxLayoutDevice = undefined; xboxLayoutSupported = false;
  xboxLayoutConfirmed = undefined; xboxLayoutPending = false;
  xboxLayoutToggle.checked = false;
  xboxLayoutState.textContent = '连接后读取';
  xboxLayoutBusy(true);
}
async function xboxLayoutRefresh(device) {
  if (!xboxLayoutSupported || device !== xboxLayoutDevice) return;
  const b = payloadOf(await device.receiveFeatureReport(19), 19);
  if (b.length !== 63 || b[0] !== 1 || b[1] > 3 || b[1] !== usbModeConfirmed ||
      b[2] > 1 || b[3] > 3 || b[5] > 1 || b.slice(10).some(v => v))
    throw new Error('Xbox 布局状态格式无效');
  xboxLayoutConfirmed = Boolean(b[2]); xboxLayoutPending = b[3] === 1;
  xboxLayoutToggle.checked = xboxLayoutConfirmed;
  xboxLayoutState.textContent = b[3] === 1 ? '正在保存…' :
    xboxLayoutConfirmed ? '已开启 · 自动保存' : '已关闭 · 原映射';
  if (typeof renderMapping === 'function') renderMapping();
  xboxLayoutBusy(configBusy);
  return b;
}
async function xboxLayoutConnected(device, extensions) {
  xboxLayoutReset(); xboxLayoutDevice = device; xboxLayoutSupported = Boolean(extensions & 1);
  if (!xboxLayoutSupported) { xboxLayoutState.textContent = '需更新固件'; return; }
  await xboxLayoutRefresh(device);
}
xboxLayoutToggle.addEventListener('change', async () => {
  if (xboxLayoutToggle.disabled || configBusy) return;
  const device = xboxLayoutDevice, target = Number(xboxLayoutToggle.checked);
  const token = xboxLayoutToken = (xboxLayoutToken + 1) & 255;
  busy(true);
  try {
    await device.open();
    const request = new Uint8Array(63); request.set([1, target, token]);
    await device.sendFeatureReport(19, request);
    for (let attempt = 0; attempt < 50; ++attempt) {
      const b = await xboxLayoutRefresh(device);
      if (!b || device !== xboxLayoutDevice || b[1] !== 1 || b[4] !== token || b[5] !== target)
        throw new Error('布局请求未确认，请重新读取');
      if (b[3] === 3) throw new Error('设备保存失败');
      if (b[3] === 2 && b[2] === target) {
        line('Xbox 任天堂布局已保存并回读确认。'); return;
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error('保存超时，请重新读取');
  } catch (error) {
    xboxLayoutToggle.checked = xboxLayoutConfirmed === true;
    xboxLayoutConfirmed = undefined;
    xboxLayoutState.textContent = `未确认：${error.message}`;
  } finally {
    if (device.opened) { try { await device.close(); } catch (_) {} }
    xboxLayoutPending = false;
    busy(false);
  }
});
xboxLayoutReset();
