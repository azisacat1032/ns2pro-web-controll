'use strict';
// Editor drafts are separate from the receiver configuration and NVS saves.
(() => {
  const $ = id => document.getElementById(id);
  const storageKey = 'ns2pro.automation-drafts.v1';
  const labels = ['B（下）', 'A（右）', 'Y（左）', 'X（上）', 'L', 'R', 'ZL', 'ZR',
    '−', '+', '左摇杆按下', '右摇杆按下', '方向↓', '方向→', '方向←', '方向↑',
    'HOME', '截图', 'GR 右背键', 'GL 左背键', 'C'];
  const modes = ['once', 'hold', 'toggle'];
  const emptyMacro = () => ({name: '', trigger: '', mode: 'once', steps: []});
  const fresh = () => ({version: 1, turbo: {buttons: [], mode: 'hold', rate: 10}, macros: Array.from({length: 4}, emptyMacro)});
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  function valid(d) {
    return d && d.version === 1 && d.turbo && Array.isArray(d.turbo.buttons) &&
      d.turbo.buttons.every(n => integer(n, 0, 20)) && ['hold', 'toggle'].includes(d.turbo.mode) && integer(d.turbo.rate, 1, 30) &&
      Array.isArray(d.macros) && d.macros.length === 4 && d.macros.every(m => m &&
        typeof m.name === 'string' && m.name.length <= 32 && (m.trigger === '' || integer(m.trigger, 0, 20)) &&
        modes.includes(m.mode) && Array.isArray(m.steps) && m.steps.length <= 32 && m.steps.every(s => s &&
          ['button', 'wait'].includes(s.type) && integer(s.duration, 10, 10000) && (s.type === 'wait' || integer(s.button, 0, 20))));
  }
  let draft = fresh(), slot = 0, hasDraft = false;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!valid(parsed)) throw Error('invalid draft');
      draft = parsed;
      hasDraft = true;
    }
  } catch (_) {
    for (const id of ['turboDraftState', 'macroDraftState']) $(id).textContent = '无法读取本地草稿，已显示默认值。连接后可读取设备配置。';
  }
  const dirty = id => { hasDraft = true; $(id).textContent = '草稿已修改，点击“应用全部”下发；“保存到设备”可断电保留。'; };
  function save(id) {
    if (!valid(draft)) { $(id).textContent = '请检查配置：步骤时长须为 10–10000 ms 的整数。'; return; }
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      hasDraft = true; $(id).textContent = '全部草稿已保存到当前浏览器。设备配置需单独应用或保存。';
    } catch (_) { $(id).textContent = '保存失败，浏览器存储不可用；请保留当前页面。'; }
  }
  function options(select, blank) {
    if (blank) {
      const option = document.createElement('option'); option.value = ''; option.textContent = '未绑定'; select.append(option);
    }
    labels.forEach((label, i) => {
      const option = document.createElement('option'); option.value = String(i); option.textContent = label; select.append(option);
    });
  }
  labels.forEach((label, i) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-pressed', String(draft.turbo.buttons.includes(i)));
    button.addEventListener('click', () => {
      const selected = draft.turbo.buttons.includes(i);
      draft.turbo.buttons = selected ? draft.turbo.buttons.filter(n => n !== i) : [...draft.turbo.buttons, i];
      button.setAttribute('aria-pressed', String(!selected)); dirty('turboDraftState');
    });
    $('turboButtons').append(button);
  });
  $('turboMode').value = draft.turbo.mode;
  $('turboRate').value = draft.turbo.rate;
  const rateLabel = () => { $('turboRateValue').textContent = `${draft.turbo.rate} 次/秒`; };
  rateLabel();
  $('turboMode').addEventListener('change', () => { draft.turbo.mode = $('turboMode').value; dirty('turboDraftState'); });
  $('turboRate').addEventListener('input', () => { draft.turbo.rate = Number($('turboRate').value); rateLabel(); dirty('turboDraftState'); });
  $('turboClear').addEventListener('click', () => {
    draft.turbo.buttons = [];
    for (const button of $('turboButtons').children) button.setAttribute('aria-pressed', 'false');
    dirty('turboDraftState');
  });
  $('turboSave').addEventListener('click', () => save('turboDraftState'));
  options($('macroTrigger'), true);
  const summary = () => {
    const steps = draft.macros[slot].steps;
    $('macroSummary').textContent = `${steps.length} / 32 步 · 单轮 ${steps.reduce((sum, s) => sum + (Number.isFinite(s.duration) ? s.duration : 0) + (s.type === 'button' ? 10 : 0), 0)} ms（每次按键后松开 10 ms）`;
    $('macroAddButton').disabled = $('macroAddWait').disabled = steps.length >= 32;
  };
  function renderSteps() {
    $('macroSteps').replaceChildren();
    draft.macros[slot].steps.forEach((step, index) => {
      const row = document.createElement('li'); row.className = 'macro-step';
      if (step.type === 'button') {
        const select = document.createElement('select'); options(select, false); select.value = step.button;
        select.setAttribute('aria-label', `步骤 ${index + 1} 按键`);
        select.addEventListener('change', () => { step.button = Number(select.value); dirty('macroDraftState'); });
        row.append(select);
      } else { const label = document.createElement('span'); label.textContent = '等待'; row.append(label); }
      const duration = document.createElement('input');
      duration.type = 'number'; duration.min = '10'; duration.max = '10000'; duration.step = '1'; duration.value = step.duration;
      duration.setAttribute('aria-label', `步骤 ${index + 1} 时长（毫秒）`);
      duration.addEventListener('input', () => { step.duration = duration.valueAsNumber; summary(); dirty('macroDraftState'); });
      const unit = document.createElement('span'); unit.textContent = 'ms';
      row.append(duration, unit);
      for (const [text, delta] of [['↑', -1], ['↓', 1], ['删除', 0]]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = text;
        button.setAttribute('aria-label', `步骤 ${index + 1} ${delta === -1 ? '上移' : delta === 1 ? '下移' : '删除'}`);
        button.disabled = delta !== 0 && (index + delta < 0 || index + delta >= draft.macros[slot].steps.length);
        button.addEventListener('click', () => {
          const steps = draft.macros[slot].steps;
          if (delta) [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
          else steps.splice(index, 1);
          renderSteps(); dirty('macroDraftState');
        }); row.append(button);
      }
      $('macroSteps').append(row);
    });
    summary();
  }
  function renderMacro() {
    const macro = draft.macros[slot];
    $('macroName').value = macro.name; $('macroTrigger').value = macro.trigger; $('macroMode').value = macro.mode;
    renderSteps();
  }
  $('macroSlot').addEventListener('change', () => { slot = Number($('macroSlot').value); renderMacro(); });
  for (const [id, field] of [['macroName', 'name'], ['macroTrigger', 'trigger'], ['macroMode', 'mode']]) {
    $(id).addEventListener(id === 'macroName' ? 'input' : 'change', () => {
      draft.macros[slot][field] = field === 'trigger' && $(id).value !== '' ? Number($(id).value) : $(id).value;
      dirty('macroDraftState');
    });
  }
  for (const [id, type] of [['macroAddButton', 'button'], ['macroAddWait', 'wait']]) {
    $(id).addEventListener('click', () => {
      if (draft.macros[slot].steps.length >= 32) return;
      draft.macros[slot].steps.push(type === 'button' ? {type, button: 0, duration: 100} : {type, duration: 100});
      renderSteps(); dirty('macroDraftState');
    });
  }
  $('macroClear').addEventListener('click', () => { draft.macros[slot] = emptyMacro(); renderMacro(); dirty('macroDraftState'); });
  $('macroSave').addEventListener('click', () => save('macroDraftState'));
  globalThis.automationEditor = {
    get: () => structuredClone(draft),
    valid,
    hasDraft: () => hasDraft,
    set(value) {
      if (!valid(value)) throw Error('连发/宏配置格式无效');
      draft = structuredClone(value); hasDraft = false;
      $('turboMode').value = draft.turbo.mode; $('turboRate').value = draft.turbo.rate; rateLabel();
      Array.from($('turboButtons').children).forEach((button, i) => button.setAttribute('aria-pressed', String(draft.turbo.buttons.includes(i))));
      renderMacro();
    }
  };
  renderMacro();
})();
