'use strict';
const customTuningModeAvailable = () => ordinaryAlgorithmMode === 1 || (typeof ordinaryAlgorithmMultiModeSupported !== 'undefined' && ordinaryAlgorithmMultiModeSupported && [0,2].includes(ordinaryAlgorithmMode));
const xboxCustomPanel = document.querySelector('#xboxCustomPanel');
const xboxCustomFields = document.querySelector('#xboxCustomFields');
const xboxCustomState = document.querySelector('#xboxCustomState');
const xboxCustomRead = document.querySelector('#xboxCustomRead');
const xboxCustomSave = document.querySelector('#xboxCustomSave');
const xboxCustomDefaults = document.querySelector('#xboxCustomDefaults');
const xboxCustomBypass = document.querySelector('#xboxCustomBypass');
const xboxCustomDefault = [100,100,0,0,100,100,0,0,0,0,0,0,24,35,4,4,100,100,100,100,100,0,60,20,0,2,60,4];
const xboxCustomGroups = [
  ['输入整形', [[0,'主体路增益',0,200,1,'%'],[1,'细节路增益',0,200,1,'%'],[2,'主体路门限',0,64,1,''],[3,'细节路门限',0,64,1,''],[4,'主体路强度曲线',50,200,5,'gamma'],[5,'细节路强度曲线',50,200,5,'gamma']]],
  ['包络', [[6,'主体起振',0,42,1,'ms'],[7,'主体收尾',0,84,1,'ms'],[8,'细节起振',0,42,1,'ms'],[9,'细节收尾',0,84,1,'ms'],[10,'游戏停止后保留有限收尾',0,1,1,'bool']]],
  ['冲击增强', [[11,'启用冲击增强',0,1,1,'bool'],[12,'上升检测门限',1,128,1,''],[13,'冲击增强量',0,100,1,'%'],[14,'冲击衰减',1,12,1,'ms'],[15,'再触发间隔',1,16,1,'ms']]],
  ['左右分配', [[16,'主体 → 左马达',0,100,1,'%'],[17,'主体 → 右马达',0,100,1,'%'],[18,'细节 → 左马达',0,100,1,'%'],[19,'细节 → 右马达',0,100,1,'%']]],
  ['持续震动压低', [[21,'启用持续震动压低',0,1,1,'bool'],[22,'持续力度压低量',0,100,1,'%'],[23,'进入压低时间',1,84,1,'ms']]],
  ['小幅变化增强', [[24,'启用小幅变化增强',0,1,1,'bool'],[25,'小变化检测门限',1,32,1,''],[26,'小变化增强量',0,200,1,'%'],[27,'小变化消散时间',1,42,1,'ms']]],
  ['混合', [[20,'处理混合',0,100,1,'%']]],
];
const xboxCustomMeta = xboxCustomGroups.flatMap(g => g[1]);
const xboxCustomHelp = [
  '调高增强主体路力度，调低减弱；0% 关闭处理后的主体路。',
  '调高增强细节路力度，调低减弱；过高可能让细碎震动过于突出。',
  '滤掉主体路的微弱输入。越高过滤越强，也越容易丢失轻微震动。',
  '滤掉细节路的微弱输入。越高越干净，但细小变化也会减少。',
  '小于 1 提升弱震，大于 1 压低弱震、拉开强弱反差；1 保持原曲线。',
  '小于 1 提升细微震动，大于 1 突出强弱反差；1 保持原曲线。',
  '按力度差值平滑上升，弱震也遵循相近时间比例。最大 504ms；越长越柔和，0ms 立即响应。',
  '按力度差值平滑下降，最大 1008ms。越长收尾越缓；游戏停止后的尾巴由下方开关决定。',
  '按力度差值平滑上升，弱震也遵循相近时间比例。最大 504ms；越长越柔和，0ms 立即响应。',
  '按力度差值平滑下降，最大 1008ms。越长收尾越缓；游戏停止后的尾巴由下方开关决定。',
  '开启后，游戏停止震动时仍按收尾和冲击衰减结束；关闭则立即停止对应通道。',
  '在游戏震动力度突然上升时叠加短促冲击，无需按扳机，也不会识别具体枪声。',
  '越低越容易触发冲击，越高只响应较大的力度跳变；不按扳机判断。',
  '控制额外冲击的力度。越高撞击越突出；0% 不叠加冲击。',
  '控制额外冲击消散的时间。越短越利落，越长尾部越明显。',
  '两次冲击触发之间的最短间隔。越短越密集，越长越能减少反复触发。',
  '主体路送到左马达的比例。调高增强左侧主体；0% 关闭这一路分配。',
  '主体路送到右马达的比例。调高增强右侧主体；0% 关闭这一路分配。',
  '细节路送到左马达的比例。调高增强左侧细节；0% 关闭这一路分配。',
  '细节路送到右马达的比例。调高增强右侧细节；0% 关闭这一路分配。',
  '0% 完全使用原始输出，100% 完全使用本组处理结果；中间值混合两者。原始部分不受门限和左右分配影响。',
  '逐渐压低连续非零输入的底层力度，给冲击和细节留出空间。停止后重新起振会恢复起始力度。',
  '最终压低的比例。0% 不压低，60% 保留四成底层力度；不压低独立的冲击和小变化增强。',
  '从起始力度逐渐降到压低目标的时间。越短越快让出空间，越长越保留开头；最大 1008ms。',
  '突出游戏非零震动信号中的细小升降，不把首次起振或完全停止当作细节。无需扳机。',
  '越低越敏感，越高越忽略细小变化。按游戏强度 0～255 的变化量判断。',
  '控制额外细节的力度。0% 不增强；200% 为两倍。大幅跳变按最多 32 级处理，避免过度增强。',
  '每次小变化增强消散的时间。越短越清晰，越长越有尾巴，最大 504ms；相邻变化会合并。',
];
const xboxCustomInputs = [], xboxCustomOutputs = [], xboxCustomHelpElements = [], xboxCustomDetailGroups = [];
let xboxCustomDevice, xboxCustomSupported = false, xboxCustomDetailSupported = false, xboxCustomConfirmed, xboxCustomGeneration;
let xboxCustomPending = false, xboxCustomToken = 0;
function xboxCustomFormat(value, unit) {
  return unit === 'ms' ? `${value * 12}ms` : unit === 'gamma' ? (value / 100).toFixed(2) : `${value}${unit}`;
}
for (const [title, fields] of xboxCustomGroups) {
  const group = document.createElement('fieldset'), legend = document.createElement('legend');
  legend.textContent = title; group.append(legend);
  if (fields[0][0] >= 21) xboxCustomDetailGroups.push(group);
  for (const [i, name, min, max, step, unit] of fields) {
    const row = document.createElement('label'), caption = document.createElement('span');
    caption.textContent = name;
    const input = document.createElement('input'); input.id = `xboxCustom${i}`;
    input.type = unit === 'bool' ? 'checkbox' : 'range'; input.min = min; input.max = max; input.step = step;
    input.disabled = true;
    row.htmlFor = input.id;
    const output = document.createElement('output');
    if (unit === 'bool') { input.setAttribute('role','switch'); row.className = 'custom-check'; }
    else row.className = 'custom-range';
    const help = document.createElement('small');
    help.className = 'custom-help'; help.id = `xboxCustomHelp${i}`;
    help.textContent = xboxCustomHelp[i];
    xboxCustomHelpElements[i] = help;
    input.setAttribute('aria-describedby', help.id);
    row.append(caption, output, input, help); group.append(row);
    xboxCustomInputs[i] = input; xboxCustomOutputs[i] = output;
    input.addEventListener('input', () => { output.textContent = unit === 'bool' ? '' : xboxCustomFormat(Number(input.value),unit); });
    input.addEventListener('change', () => {
      if (!xboxCustomConfirmed || input.disabled) return;
      const target = xboxCustomConfirmed.slice(); target[i] = unit === 'bool' ? Number(input.checked) : Number(input.value);
      return xboxCustomOperation(0,target);
    });
  }
  xboxCustomFields.append(group);
}
function xboxCustomDraw(profile) {
  for (const [i,, , , ,unit] of xboxCustomMeta) {
    xboxCustomInputs[i].value = String(profile[i]); xboxCustomInputs[i].checked = Boolean(profile[i]);
    xboxCustomOutputs[i].textContent = unit === 'bool' ? '' : xboxCustomFormat(profile[i],unit);
  }
}
function xboxCustomBusy(value) {
  const xbox = customTuningModeAvailable();
  xboxCustomPanel.hidden = !xbox || !xboxCustomSupported;
  const connected = xbox && xboxCustomSupported && xboxCustomDevice;
  const blocked = value || xboxCustomPending || !connected;
  const editable = !blocked && ordinaryAlgorithmConfirmed === true && ordinaryProfileConfirmed === 3 && xboxCustomConfirmed;
  xboxCustomRead.disabled = blocked;
  xboxCustomSave.disabled = !editable || xboxCustomBypass.checked;
  xboxCustomDefaults.disabled = !editable;
  xboxCustomBypass.disabled = !editable;
  xboxCustomDetailGroups.forEach(group => { group.hidden = !xboxCustomDetailSupported; });
  xboxCustomInputs.forEach((input,i) => { input.disabled = !editable || xboxCustomBypass.checked || (i >= 21 && !xboxCustomDetailSupported); });
  xboxCustomEffectHints();
}
function xboxCustomEffectHints() {
  const p = xboxCustomConfirmed;
  for (let i = 0; i < xboxCustomHelpElements.length; ++i) {
    let reason = '';
    if (p) {
      if (xboxCustomBypass.checked) reason = '当前旁路中，修改参数不会改变原始对照输出。';
      else if (!ordinaryAlgorithmConfirmed || ordinaryProfileConfirmed !== 3 || !customTuningModeAvailable())
        reason = '当前未启用 自定义（传统转子），参数暂不参与输出。';
      else if (i !== 20 && p[20] === 0) reason = '当前处理混合为 0%，本项暂不参与输出。';
      else if (i >= 12 && i <= 15 && !p[11]) reason = '当前冲击增强关闭，本项已设置但暂不参与输出。';
      else if (i >= 22 && i <= 23 && !p[21]) reason = '当前持续震动压低关闭，本项已设置但暂不参与输出。';
      else if (i >= 25 && i <= 27 && !p[24]) reason = '当前小幅变化增强关闭，本项已设置但暂不参与输出。';
      else if ((i === 7 || i === 9) && !p[10]) reason = '当前仅平滑力度下降；游戏发来停止指令时仍立即停止。';
    }
    const help = xboxCustomHelpElements[i];
    help.textContent = reason ? `${reason} ${xboxCustomHelp[i]}` : xboxCustomHelp[i];
    help.setAttribute('data-conditional', String(Boolean(reason)));
  }
}
function xboxCustomReset() {
  xboxCustomDevice = undefined; xboxCustomSupported = xboxCustomDetailSupported = false; xboxCustomConfirmed = undefined;
  xboxCustomGeneration = undefined; xboxCustomPending = false; xboxCustomBypass.checked = false;
  xboxCustomState.textContent = '选择 自定义（传统转子）后调节；松开滑块应用，保存后断电保留。';
  xboxCustomDraw(xboxCustomDefault); xboxCustomBusy(true);
}
function xboxCustomValid(p) {
  return p.length === 28 && xboxCustomMeta.every(([i,,min,max]) => Number.isInteger(p[i]) && p[i] >= min && p[i] <= max);
}
async function xboxCustomRefresh(device) {
  if (!xboxCustomSupported || device !== xboxCustomDevice) return;
  let b, detail;
  for (let attempt = 0; attempt < 3; ++attempt) {
    b = payloadOf(await device.receiveFeatureReport(20),20);
    if (!xboxCustomDetailSupported) break;
    detail = payloadOf(await device.receiveFeatureReport(21),21);
    if ([0,1,2,3,4,5,6,8,9,10,11,12,13,14,15].every(i => b[i] === detail[i])) break;
    if (attempt === 2) throw new Error('两组参数读取期间发生变化，请重新读取');
  }
  const current = [...b.slice(16,37), ...(detail ? detail.slice(16,23) : xboxCustomDefault.slice(21))];
  const saved = [...b.slice(37,58), ...(detail ? detail.slice(23,30) : xboxCustomDefault.slice(21))];
  if (b.length !== 63 || b[0] !== 1 || b[1] !== ordinaryAlgorithmMode || b[2] > 3 || b[4] > 3 ||
      b[5] > 1 || b[6] > 1 || b[7] !== 21 || b[58] > 1 || b.slice(59).some(v=>v) ||
      (detail && (detail.length !== 63 || detail[7] !== 7 || detail[30] !== b[58] || detail.slice(31).some(v=>v))) ||
      !xboxCustomValid(current) || !xboxCustomValid(saved)) throw new Error('自定义参数状态格式无效');
  xboxCustomConfirmed = current; xboxCustomGeneration = new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(8,true);
  xboxCustomPending = b[2] === 1; xboxCustomBypass.checked = Boolean(b[58]); xboxCustomDraw(current);
  xboxCustomState.textContent = b[58] ? '原始对照中：自定义处理已暂时旁路，参数保留。' :
    b[2] === 1 ? '设备正在处理…' : `${b[6] ? '当前参数未保存' : '当前参数已保存，断电保留'} · ${ordinaryProfileConfirmed === 3 && ordinaryAlgorithmConfirmed ? '自定义生效中' : '当前未启用自定义'}`;
  xboxCustomBusy(configBusy); return b;
}
async function xboxCustomConnected(device, features) {
  xboxCustomReset(); xboxCustomDevice = device; xboxCustomSupported = Boolean(features & 4);
  xboxCustomDetailSupported = Boolean(features & 8);
  if (xboxCustomSupported) await xboxCustomRefresh(device);
}
async function xboxCustomOperation(op, target = xboxCustomConfirmed) {
  if (!xboxCustomDevice || !xboxCustomSupported || configBusy || xboxCustomPending || !customTuningModeAvailable()) return;
  if (op !== undefined && (!target || !xboxCustomValid(target))) return;
  const device = xboxCustomDevice, bypass = Number(xboxCustomBypass.checked);
  const detailWrite = op === 0 && target.slice(21).some((v,i)=>v!==xboxCustomConfirmed[21+i]);
  if (detailWrite && !xboxCustomDetailSupported) return;
  const report = detailWrite ? 21 : 20;
  const token = xboxCustomToken = (xboxCustomToken + 1) & 255;
  busy(true);
  try {
    await device.open();
    if (op === undefined) { await xboxCustomRefresh(device); return; }
    const request = new Uint8Array(63); request.set([1,op,token]);
    new DataView(request.buffer).setUint32(3,xboxCustomGeneration,true); request.set(detailWrite ? target.slice(21) : target.slice(0,21),7);
    if (op === 3) request[28] = bypass;
    await device.sendFeatureReport(report,request);
    for (let attempt=0;attempt<60;++attempt) {
      const b = await xboxCustomRefresh(device);
      if (!b || device !== xboxCustomDevice || b[3] !== token || b[4] !== op) throw new Error('设备参数已变化，请读取后重试');
      if (b[2] === 3) throw new Error('设备处理失败，参数保存未确认');
      if (b[2] === 2) {
        const expected = op === 2 ? xboxCustomDefault : target;
        if (!expected.every((v,i)=>v===xboxCustomConfirmed[i]) || (op===1 && (!b[5] || b[6])) || (op===3 && b[58]!==bypass))
          throw new Error('设备回读与目标不一致');
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,80));
    }
    throw new Error('处理超时，请重新读取');
  } catch(error) {
    if (xboxCustomConfirmed) xboxCustomDraw(xboxCustomConfirmed);
    xboxCustomConfirmed = undefined;
    xboxCustomState.textContent = `操作未确认：${error.message}`;
  } finally {
    if (device.opened) { try { await device.close(); } catch (_) {} }
    xboxCustomPending = false; busy(false);
  }
}
xboxCustomRead.addEventListener('click',()=>xboxCustomOperation(undefined));
xboxCustomSave.addEventListener('click',()=>xboxCustomOperation(1));
xboxCustomDefaults.addEventListener('click',()=>xboxCustomOperation(2));
xboxCustomBypass.addEventListener('change',()=>xboxCustomOperation(3));
xboxCustomReset();
