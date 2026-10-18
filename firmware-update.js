import { inspectFirmware, APP_OFFSET } from './firmware-image.mjs';
const el = id => document.getElementById(id);
const dialog = el('firmwareDialog'), open = el('firmwareOpen'), close = el('firmwareClose');
const file = el('firmwareFile'), info = el('firmwareFileInfo'), connect = el('flashConnect');
const disconnect = el('flashDisconnect'), start = el('flashStart'), state = el('flashStatus');
const progress = el('flashProgress'), percent = el('flashPercent'), portInfo = el('flashPortInfo');
const log = el('flashLog');
let firmware, port, transport, loader, working = false, verified = false;
const append = value => { log.textContent = (log.textContent + String(value) + '\n').slice(-24000); log.scrollTop = log.scrollHeight; };
function controls() {
  close.disabled = working; file.disabled = working;
  connect.disabled = working || Boolean(loader) || !navigator.serial || !window.isSecureContext;
  disconnect.disabled = working || !transport;
  start.disabled = working || !loader || !firmware;
}
function setProgress(value) { progress.value = value; percent.textContent = `${Math.floor(value)}%`; }
async function release(reset = true) {
  const l = loader, t = transport;
  loader = undefined; transport = undefined; port = undefined;
  let failed = false;
  if (reset && l) { try { await l.after('hard_reset'); } catch (e) { failed = true; append(`重启未确认：${e.message}`); } }
  if (t) { try { await t.disconnect(); } catch (e) { failed = true; append(`关闭串口未确认：${e.message}`); } }
  portInfo.textContent = failed ? '请手动重启接收器，并确认其他软件没有占用串口。' : '串口已释放；返回后请重新连接接收器。';
  return !failed;
}
open.addEventListener('click', () => {
  if (configBusy) return;
  firmwarePanelOpen = true; busy(true); dialog.showModal();
  if (!navigator.serial || !window.isSecureContext) state.textContent = '此浏览器未提供 Web Serial，请在桌面 Chrome / Edge 的 localhost 或 HTTPS 页面打开。';
  controls();
});
async function closePanel() {
  if (working) return;
  working = true; controls();
  try { await release(); } finally {
    working = false; dialog.close(); firmwarePanelOpen = false; busy(false); controls();
  }
}
close.addEventListener('click', closePanel);
dialog.addEventListener('cancel', e => { e.preventDefault(); if (!working) closePanel(); });
file.addEventListener('change', async () => {
  if (working) return;
  firmware = undefined; const selected = file.files?.[0];
  if (!selected) { info.textContent = '请选择应用 .bin 文件。'; controls(); return; }
  working = true; controls(); setProgress(0);
  try {
    if (selected.size > 0x100000) throw new Error('文件超过 1 MB 应用分区，请勿选择整包固件');
    const bytes = new Uint8Array(await selected.arrayBuffer());
    const details = await inspectFirmware(bytes); firmware = { bytes, ...details };
    info.textContent = `${selected.name} · ${details.version} · ${(details.size / 1024).toFixed(1)} KB`;
    info.title = `SHA-256: ${details.sha256}`; state.textContent = '文件校验通过；连接串口后可开始更新。';
  } catch (e) { info.textContent = `文件不可用：${e.message}`; info.title = ''; state.textContent = '请选择有效固件。'; }
  finally { working = false; controls(); }
});
connect.addEventListener('click', async () => {
  if (working || loader) return;
  working = true; controls(); log.textContent = ''; state.textContent = '请选择烧录串口…';
  try {
    port = await navigator.serial.requestPort();
    const { ESPLoader, Transport } = await import('./vendor/esptool-js-0.7.0/bundle.js');
    transport = new Transport(port, false);
    const terminal = { clean() { log.textContent = ''; }, write: append,
      writeLine(value) { append(value); if (String(value).includes('Hash of data verified.')) verified = true; } };
    loader = new ESPLoader({ transport, baudrate: 115200, terminal, debugLogging: false });
    state.textContent = '正在连接并识别芯片…'; await loader.main();
    if (loader.chip.CHIP_NAME !== 'ESP32-S3') throw new Error('芯片型号不匹配，仅支持 ESP32-S3');
    portInfo.textContent = 'ESP32-S3 已连接 · 115200 波特率';
    state.textContent = firmware ? '准备就绪，点击开始烧录。' : '串口已连接，请选择应用固件。';
  } catch (e) {
    const cancelled = e.name === 'NotFoundError';
    state.textContent = cancelled ? '已取消选择串口。' : `连接失败：${e.message}。请关闭串口监视器后重试。`;
    await release();
  } finally { working = false; controls(); }
});
disconnect.addEventListener('click', async () => {
  if (working) return;
  working = true; controls();
  try { await release(); state.textContent = '已断开烧录连接。'; }
  finally { working = false; controls(); }
});
start.addEventListener('click', async () => {
  if (working || !loader || !firmware) return;
  working = true; verified = false; controls(); setProgress(0);
  try {
    if (typeof window.md5 !== 'function') throw new Error('校验组件未加载，请刷新网页');
    await inspectFirmware(firmware.bytes);
    state.textContent = '正在写入固件，请保持 USB 连接…';
    await loader.writeFlash({ fileArray: [{ data: firmware.bytes.slice(), address: APP_OFFSET }],
      flashMode: 'keep', flashFreq: 'keep', flashSize: 'keep', eraseAll: false, compress: true,
      calculateMD5Hash: image => window.md5(image),
      reportProgress: (_index, written, total) => {
        if (total > 0) setProgress(Math.min(99, written / total * 100));
        if (written >= total) state.textContent = '写入完成，正在校验…';
      } });
    if (!verified) throw new Error('未收到固件写入校验成功结果');
    setProgress(100);
    const released = await release();
    state.textContent = released ? '烧录及校验成功，已发送重启指令。返回控制台后重新连接。' : '烧录及校验成功，请手动重启接收器。';
  } catch (e) {
    state.textContent = `更新未确认：${e.message}。可重新连接串口重试。`; append(state.textContent);
    await release();
  } finally { working = false; controls(); }
});
window.addEventListener('beforeunload', e => { if (working) { e.preventDefault(); e.returnValue = ''; } });
controls();
