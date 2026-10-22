import {decodeInfo,complete} from './onboarding-model.mjs';

export function createBrowserGuideAPI(hid,storage){
  const completionKey='ns2pro.browser.setup.complete.v1';
  const filters=[{vendorId:0x054c,usagePage:0xff00,usage:1},{vendorId:0xcafe,usagePage:0xff00,usage:1},{vendorId:0x057e,usagePage:0xff00,usage:2}];
  const ids=new WeakMap(),owned=new Set();let current=null,generation=0,queue=Promise.resolve();
  const valid=d=>filters.some(f=>d.vendorId===f.vendorId&&d.collections?.some(c=>c.usagePage===f.usagePage&&c.usage===f.usage));
  const identify=d=>{if(!ids.has(d))ids.set(d,++generation);return {id:ids.get(d)};};
  const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  async function status(){
    const devices=(await hid?.getDevices?.()||[]).filter(valid);
    current=devices.includes(current)?current:devices[0]||null;
    return current?identify(current):null;
  }
  async function read(id,report){
    if(!current||identify(current).id!==id)throw Error('接收器已断开，请重新授权连接');
    if(!current.opened){await current.open();owned.add(current);}
    const data=await current.receiveFeatureReport(report);
    const bytes=Array.from(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
    if(bytes.length!==64||bytes[0]!==report)throw Error('接收器状态报告无效');
    return bytes;
  }
  hid?.addEventListener('disconnect',event=>{if(event.device===current)current=null;owned.delete(event.device);ids.delete(event.device);});
  return {
    supported:Boolean(hid),
    // requestDevice must run directly inside the user's click, before queuing I/O.
    async connect(){
      if(!hid)throw Error('请在电脑 Chrome 或 Edge 中打开，当前浏览器不支持 WebHID');
      const devices=await hid.requestDevice({filters});
      const device=devices.find(valid);if(!device)throw Error('未选择接收器，请连接 USB 数据口后重试');
      current=device;return identify(device);
    },
    release:()=>serial(async()=>{for(const device of owned){if(device.opened)await device.close();owned.delete(device);}}),
    invoke(command,args={}){
      if(command==='app_mode')return Promise.resolve(false);
      if(command==='setup_status'){try{return Promise.resolve(storage.getItem(completionKey)==='1');}catch{return Promise.resolve(false);}}
      if(command==='hid_status')return serial(status);
      if(command==='hid_read')return serial(()=>read(args.id,args.report));
      if(command==='setup_finish')return serial(async()=>{
        if(args.enabled)throw Error('开机自启需要软件版');
        const device=await status();if(!device)throw Error('接收器未连接');
        const packet=decodeInfo(await read(device.id,1)),rates=await read(device.id,13);
        const view=new DataView(Uint8Array.from(rates).buffer);
        if(!complete(packet,args.dual?'dual':'pc',true)||rates[1]!==1||(rates[2]&3)!==3||view.getUint32(17,true)>=2000)throw Error('连接状态已变化，请等待重新检测');
        storage.setItem(completionKey,'1');
      });
      return Promise.reject(Error('网页版不支持此操作：'+command));
    }
  };
}
