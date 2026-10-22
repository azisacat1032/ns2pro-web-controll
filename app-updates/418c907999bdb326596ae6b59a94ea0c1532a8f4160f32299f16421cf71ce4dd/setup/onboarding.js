import {fresh,restore,decodeInfo,advance,healthy,complete,existing,flashed,confirmConsole,pcOnly,chooseDual,acknowledgeDual,phases} from './onboarding-model.mjs';
const nativeHost=Boolean(window.__TAURI__);
const api=window.__TAURI__?.core||window.ns2proGuideAPI;
if(api)void initialize().catch(error=>console.error('首次设置加载失败',error));
async function initialize(){
  const response=await fetch(new URL('./onboarding.html',import.meta.url));if(!response.ok)throw Error('无法读取设置引导');
  const container=document.createElement('div');container.innerHTML=await response.text();
  const dialog=container.querySelector('dialog');document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),invoke=api.invoke;
  $('setupBrowserConnect').hidden=nativeHost;
  $('setupBrowserConnect').addEventListener('click',async()=>{
    $('setupBrowserConnect').disabled=true;
    try{await api.connect();await sample();}catch(error){message(`连接未完成：${error.message}`,true);}
    finally{$('setupBrowserConnect').disabled=!api.supported;}
  });
  const recovery=$('setupRecovery');
  $('setupRecoveryOpen').addEventListener('click',()=>recovery.showModal());
  $('setupRecoveryClose').addEventListener('click',()=>recovery.close());
  $('setupRecoveryRestart').addEventListener('click',()=>{if(finishing||packet?.busy)return;recovery.close();update(fresh());void sample();});
  recovery.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();recovery.close();});
  const key='ns2pro.setup.v1';let state=fresh(),packet=null,live=false,polling=false,opened=false,finishing=false,autostartLoaded=false,previous=null,session=null,lastSeen=0;
  try{state=restore(JSON.parse(localStorage.getItem(key)));}catch{}
  const views={
    flash:['01 / 固件准备','先给接收器烧录固件','先安装支持自动检测配对进度的固件，再开始连接手柄。',['将接收器的 USB 串口接到电脑。','打开烧录面板，选择随包固件并连接串口。','点击“开始烧录”，软件会等待写入和校验成功。'],'烧录过程不要拔线。只更新应用区，保留已有配对与校准。','打开烧录面板','已有固件，检测后继续','#83d7ee'],
    reboot:['01 / 烧录已校验','断电重启接收器','写入已完成，接下来确认新固件确实启动。',['拔掉 COM/USB 烧录线，让接收器完全断电。','重新连接接收器的 USB 数据口。','检测到预期版本后，会自动进入 PC 配对。'],'请先拔掉烧录串口线，再重新供电。','','','#83d7ee'],
    pc:['02 / 绑定 PC','让手柄连接接收器','先把 NS2 休眠或关机，避免主机抢走手柄连接。',['接收器正常通电后，短按一次 BOOT 并松开。','长按手柄顶部的 SYNC，等待连接。','接收器绿色闪烁表示 PC 绑定已备份；软件会检测记录及连接状态。'],'已有绑定时可以先唤醒手柄；不要长按 BOOT 或反复按键。','','','#83d7ee'],
    choice:['02 / PC 已连接','还需要连接 NS2 吗？','PC 绑定与手柄连接已检测通过。请选择你的使用方式。',['只在电脑上玩：选择“仅连接 PC，结束配对”。','还要在 PC 与 NS2 之间切换：选择“继续连接 NS2”。'],'以后可以从左下角“使用引导”补做 NS2 配对。','仅连接 PC，结束配对','继续连接 NS2','#88deab'],
    ns2intro:['03 / 双机配对 · 开始前','保留原有 NS2 绑定，按引导继续','以前与 NS2 配对过也可以继续，无需预先取消绑定或清空配对；首次双机切换仍需完成本次引导。',['不必取消原来的 NS2 绑定。按引导在 NS2 上完成配对与无线测试，再由接收器采集、合并并核验两边的记录。','正常按引导操作不会损伤手柄，也不会刷写或升级手柄固件。本流程只读写、核验蓝牙配对记录，不调整手柄硬件参数。','PC / NS2 配对记录的备份保存在 ESP32 内部存储中，断电后保留；合并后的双机记录也会写入手柄。','如果中途操作失误，因配对记录导致手柄无法连接 NS2，可按右上角“操作失误？”中的步骤重置配对，再与 NS2 重新配对，恢复正常使用。重置不会自动还原旧配对。'],'接收器配对期间，让 NS2 休眠或关机即可，避免抢连；需要操作 NS2 时再唤醒。清除配对仅用于失败恢复，不是正常流程的必做步骤。','我已了解，继续配对 NS2','返回选择','#83d7ee'],
    protect:['03 / 双机配对 · 1/4','先保护 PC 配对记录','接下来设置 PC 与 NS2 双机切换。',['保持手柄连接接收器，NS2 休眠或关机。','短按一次接收器 BOOT 并松开。','等待手柄断开、接收器变为青色呼吸。'],'软件检测到采集保护开启后会自动继续。','','仅使用 PC，跳过双机配对','#54dfd6'],
    console:['03 / 双机配对 · 2/4','在 NS2 上完成原生配对','这一段在主机上操作；PC 无法直接判断主机是否已配对、休眠或关机。',['拔掉接收器全部供电线，确认指示灯熄灭。','启动 NS2，进入“手柄 → 更改握法/顺序”，长按手柄 SYNC 配对并测试无线操作。','将 NS2 休眠或关机，拔掉手柄 USB 线。'],'无线配对失败时可先用数据线连接 NS2 配对，再拔线测试无线。','主机操作已完成，继续','','#54dfd6'],
    capture:['03 / 双机配对 · 3/4','采集 NS2 配对记录','保持 NS2 休眠或关机，把接收器重新插回 PC。',['接收器初始为青色呼吸，短按一次 BOOT 开启蓝色呼吸扫描。','长按手柄 SYNC 连接接收器。','等待青色双闪；软件检测到原生记录备份完成后自动继续。'],'青色双闪后保持连接，不要反复按 BOOT。','','','#83d7ee'],
    merge:['03 / 双机配对 · 4/4','合并并核验双机记录','NS2 原生记录已经检测到，最后把两边的记录合并。',['保持手柄连接接收器，NS2 休眠或关机。','短按一次 BOOT 开始合并。','白色呼吸期间保持供电，等待接收器完成写入及读回核验。'],'此时严禁拔线。软件检测到双机绑定有效且无未完成操作后才会继续。','','','#edf2f8'],
    finish:['04 / 最后确认','确认连接，开始使用','等待真实手柄输入与 USB 状态确认，再保存你的启动偏好。',['保持接收器和手柄连接。','软件会检查蓝牙输入帧持续更新、USB 就绪。','选择开机自启偏好，然后进入控制台。'],'日常 PC → NS2：长按 C 约 2 秒后松开，再按 HOME。NS2 → PC：主机休眠、手柄灯灭后，按 A/B/X/Y。','完成设置，进入控制台','','#88deab']
  };
  if(!nativeHost)views.finish=['04 / 最后确认','确认连接，开始使用','确认手柄输入与 USB 状态后，将完成记录保存在当前浏览器。',['保持接收器和手柄连接。','网页会检查真实蓝牙输入持续更新、USB 就绪。','点击完成后返回控制台；以后可从左下角重新打开引导。'],views.finish[4],'完成设置，进入控制台','','#88deab'];
  function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
  function message(text,error=false){$('setupStatus').textContent=text;$('setupStatus').parentElement.dataset.error=String(error);}
  function render(){
    const portGuide=$('setupPortGuide');
    portGuide.hidden=!['flash','reboot','pc','console'].includes(state.phase);portGuide.dataset.mode=state.phase;
    dialog.querySelector('.setup-visual').hidden=!portGuide.hidden||['choice','ns2intro'].includes(state.phase);
    const portLabels={flash:['现在用 COM 烧录','现在插这里','烧录后使用'],reboot:['先全部拔线，再接 USB','烧录后拔掉','断电后接这里'],pc:['现在用 USB 连接手柄','无需连接','现在插这里'],console:['这一步，两根线都拔掉','拔掉供电线','拔掉供电线']};
    if(portLabels[state.phase]){const labels=portLabels[state.phase];$('setupPortNow').textContent=labels[0];$('setupComBadge').textContent=labels[1];$('setupUsbBadge').textContent=labels[2];}
    const v=views[state.phase];$('setupStage').textContent=v[0];$('setupTitle').textContent=v[1];$('setupIntro').textContent=v[2];$('setupNotice').textContent=v[4];
    if(state.phase==='finish'&&state.mode==='pc')$('setupNotice').textContent='PC 配对已完成，无需操作 NS2。以后需要双机切换时，可从左下角“使用引导”继续设置。';
    $('setupInstructions').replaceChildren(...v[3].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('setupPrimary').textContent=v[5];$('setupPrimary').hidden=!v[5];$('setupSecondary').textContent=v[6];$('setupSecondary').hidden=!v[6];$('setupLed').style.background=v[7];$('setupLed').style.color=v[7];
    $('setupConsoleChecks').hidden=state.phase!=='console';$('setupPreferences').hidden=state.phase!=='finish'||!nativeHost;
    $('setupBrowserPreferences').hidden=state.phase!=='finish'||nativeHost;
    $('setupBrowserConnection').hidden=nativeHost||state.phase==='console';
    if(!nativeHost){$('setupBrowserConnect').disabled=!api.supported||!isSecureContext;$('setupBrowserHint').textContent=!api.supported||!isSecureContext?'当前浏览器不支持设备操作，请用电脑 Chrome / Edge 打开 HTTPS 网页。仍可阅读引导。':'首次连接或切换 USB 模式后，请点击授权并选择接收器；烧录串口会在烧录面板中另行选择。';}
    const group=['flash','reboot'].includes(state.phase)?0:['pc','choice'].includes(state.phase)?1:state.phase==='finish'?3:2;
    [...dialog.querySelectorAll('.setup-steps li')].forEach((li,i)=>{li.dataset.state=i===group?'current':i<group?'done':'waiting';if(i===group)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
    buttons();
  }
  function update(next){if(JSON.stringify(state)!==JSON.stringify(next)){const changed=state.phase!==next.phase;state=next;save();if(changed)render();}}
  function buttons(){
    $('setupRecoveryRestart').disabled=finishing||Boolean(packet?.busy);
    const needsFirmware=packet&&!packet.supported&&state.phase!=='flash';
    if(needsFirmware){$('setupSecondary').hidden=false;$('setupSecondary').textContent='返回烧录固件';}
    else {$('setupSecondary').hidden=!views[state.phase][6];$('setupSecondary').textContent=views[state.phase][6];}
    $('setupPause').disabled=finishing||Boolean(packet?.busy);
    $('setupPrimary').disabled=finishing||(state.phase==='finish'&&(!autostartLoaded||!complete(packet,state.mode,live)))||(state.phase==='console'&&(!state.sawUnplug||!$('setupConsolePaired').checked||!$('setupConsoleOff').checked));
    $('setupSecondary').disabled=finishing||(!needsFirmware&&(!healthy(packet)||(state.phase==='protect'&&(!packet.pc||!packet.ready||packet.setup))));
    if(['choice','ns2intro'].includes(state.phase)){
      const unavailable=finishing||!healthy(packet)||!packet.pc||!packet.ready||packet.setup;
      $('setupPrimary').disabled=unavailable;$('setupSecondary').disabled=unavailable;
    }
  }
  function describe(){
    if(state.phase==='ns2intro'&&healthy(packet)&&packet.pc&&packet.ready&&!packet.setup){message('阅读后点击“我已了解，继续配对 NS2”。确认前不会自动进入下一步。');return;}
    if(state.phase==='choice'&&healthy(packet)&&packet.pc&&packet.ready&&!packet.setup){message('PC 连接已确认。仅连接 PC 可直接进入最后确认；连接 NS2 将继续双机配对。');return;}
    if(!packet){message(state.phase==='console'?'接收器已断开。完成主机操作后勾选确认。':'等待接收器 USB 数据连接…');return;}
    if(!packet.supported){message('当前固件不支持配对进度检测，请先烧录随包新固件。',true);return;}
    if(packet.busy){message('接收器正在读取、写入或核验，请保持连接和供电。');return;}
    if(!healthy(packet)){message(packet.reset||packet.cleanup?'接收器有尚未完成的复原操作，请先处理后再继续。':'接收器报告本次操作未成功，请查看连接和灯光，勿反复合并或清空。',true);return;}
    const labels={flash:`已检测到固件 ${packet.version}，可检测现有固件或重新烧录。`,reboot:state.sawUnplug?'正在等待新固件启动并核对版本…':'烧录已校验，请先拔线断电，再连接 USB 数据口。',pc:'等待 PC 绑定备份与手柄连接就绪…',protect:'PC 绑定已检测到，等待开启 NS2 采集保护…',console:state.sawUnplug?'主机配对、休眠或关机完成后，请勾选确认。':'等待拔下接收器，确认全部供电线已移除…',capture:packet.paused?'接收器已接回，请短按 BOOT 开始采集扫描。':'正在等待手柄连接与 NS2 原生记录备份…',merge:'NS2 记录已检测到，请短按 BOOT 合并，等待读回核验。',finish:complete(packet,state.mode,live)?'手柄输入持续更新、USB 已就绪，可以完成设置。':'等待手柄连接与真实输入帧持续更新…'};
    message(labels[state.phase]);
  }
  async function sample(){
    if(!opened||polling||finishing)return;
    if(typeof firmwarePanelOpen!=='undefined'&&firmwarePanelOpen)return;
    if(nativeHost&&typeof configBusy!=='undefined'&&configBusy)return;
    if(!nativeHost&&!window.ns2proBrowserGuideActive)return;
    polling=true;
    try{
      const device=await invoke('hid_status');
      if(!device){packet=null;live=false;previous=null;session=null;update(advance(state,null));}
      else {
        const raw=await invoke('hid_read',{id:device.id,report:1});packet=decodeInfo(raw);lastSeen=Date.now();
        if(session!==device.id){session=device.id;previous=null;live=false;}
        if(state.phase==='finish'){
          const r=await invoke('hid_read',{id:device.id,report:13});
          if(r.length!==64||r[0]!==13||r[1]!==1||r[2]>3)throw Error('手柄输入状态无效');
          const view=new DataView(Uint8Array.from(r).buffer);const now=view.getUint32(5,true),frames=view.getUint32(9,true),age=view.getUint32(17,true);
          const dt=previous?(now-previous.now)>>>0:0,df=previous?(frames-previous.frames)>>>0:0;
          live=(r[2]&3)===3&&age<2000&&dt>0&&dt<10000&&df>0&&df<80000;previous={now,frames};
        }
        update(advance(state,packet));
      }
      describe();buttons();
    }catch(error){packet=null;live=false;previous=null;message(`检测暂不可用：${String(error)}。正在重试…`,true);buttons();}
    finally{polling=false;}
  }
  async function show(restart=false){
    if(opened)return;if(restart){state=fresh();save();}
    packet=null;live=false;previous=null;autostartLoaded=false;opened=true;render();dialog.showModal();message('正在检测接收器…');
    if(!nativeHost){
      while(typeof configBusy!=='undefined'&&configBusy){await new Promise(r=>setTimeout(r,100));if(!opened)return;}
      window.ns2proBrowserGuideActive=true;if(typeof busy==='function')busy(true);
    }
    try{$('setupAutostart').checked=nativeHost?await invoke('autostart_status'):false;autostartLoaded=true;}
    catch(error){message(`无法读取启动偏好：${String(error)}`,true);}
    void sample();
  }
  function releaseBrowser(){if(nativeHost)return Promise.resolve();window.ns2proBrowserGuideActive=false;if(typeof busy==='function')busy(false);return api.release().catch(error=>console.error('引导连接释放失败',error));}
  function pause(){if(finishing||packet?.busy)return;save();opened=false;dialog.close();releaseBrowser();}
  $('setupPause').addEventListener('click',pause);dialog.addEventListener('cancel',event=>{event.preventDefault();pause();});
  $('setupConsolePaired').addEventListener('change',buttons);$('setupConsoleOff').addEventListener('change',buttons);
  $('setupPrimary').addEventListener('click',async()=>{
    try{
      if(state.phase==='flash'){
        if(nativeHost&&typeof configBusy!=='undefined'&&configBusy)return;
        if(!nativeHost){await api.release();window.ns2proBrowserGuideActive=false;if(typeof busy==='function')busy(false);}
        document.querySelector('#firmwareOpen').click();
        if(!nativeHost)window.ns2proBrowserGuideActive=true;
        // Select the recommended image only; connecting and flashing remain explicit.
        for(let i=0;i<50;i++){await new Promise(resolve=>setTimeout(resolve,100));const use=document.querySelector('#bundledFirmwareUse');if(!use?.disabled){use.click();break;}if(!document.querySelector('#firmwareDialog[open]'))break;}
      }else if(state.phase==='choice'){update(pcOnly(state,packet));void sample();}
      else if(state.phase==='ns2intro'){update(acknowledgeDual(state,packet));void sample();}
      else if(state.phase==='console'){update(confirmConsole(state,$('setupConsolePaired').checked,$('setupConsoleOff').checked));void sample();}
      else if(state.phase==='finish'){
        if(!complete(packet,state.mode,live)||Date.now()-lastSeen>4000)throw Error('连接状态已过期，请等待重新检测');
        finishing=true;buttons();await invoke('setup_finish',{enabled:$('setupAutostart').checked,dual:state.mode==='dual'});
        localStorage.removeItem(key);opened=false;dialog.close();await releaseBrowser();location.hash='#controls';
        if(!nativeHost)window.dispatchEvent(new Event('ns2pro-guide-finished'));
      }
    }catch(error){message(`未完成：${String(error)}`,true);}
    finally{finishing=false;buttons();}
  });
  $('setupSecondary').addEventListener('click',()=>{try{update(packet&&!packet.supported&&state.phase!=='flash'?fresh():state.phase==='flash'?existing(state,packet):state.phase==='choice'?chooseDual(state,packet):state.phase==='ns2intro'?{...state,phase:'choice'}:pcOnly(state,packet));void sample();}catch(error){message(String(error),true);}});
  window.addEventListener('firmware-flash-complete',event=>{
    if(!opened||state.phase!=='flash')return;
    update(flashed(state,event.detail));
    if(state.phase==='reboot')setTimeout(()=>document.querySelector('#firmwareClose').click(),0);
  });
  document.querySelector('#setupRestart')?.addEventListener('click',()=>void show(true));
  const guideOpen=document.querySelector(nativeHost?'#setupGuideOpen':'#browserSetupGuideOpen');
  if(guideOpen){guideOpen.disabled=false;guideOpen.addEventListener('click',()=>void show(true));}
  setInterval(()=>{void sample();},1000);
  const mode=await invoke('app_mode');if(!mode&&!(await invoke('setup_status')))await show();
  // Test hook has no device write or completion behavior.
  window.ns2proSetup={open:()=>show(true),phase:()=>state.phase};
}
