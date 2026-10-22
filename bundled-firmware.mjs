import {inspectFirmware} from './firmware-image.mjs';
const base=new URL('./firmware/',import.meta.url);
export async function bundledCatalog(fetcher=fetch){
  const response=await fetcher(new URL('catalog.json',base));
  if(!response.ok)throw new Error('无法读取随包固件列表');
  const catalog=await response.json();
  if(catalog.schema!==1||!Array.isArray(catalog.items)||!catalog.items.length)throw new Error('随包固件列表无效');
  const ids=new Set();
  for(const item of catalog.items){
    if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.name!=='string'||!item.name||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\.bin$/.test(item.file)||typeof item.version!=='string'||
      !Number.isInteger(item.bytes)||item.bytes<288||item.bytes>0x100000||!/^[a-f0-9]{64}$/.test(item.sha256)||
      item.chip!=='ESP32-S3'||item.type!=='application'||item.address!=='0x10000')throw new Error('随包固件信息无效');
    ids.add(item.id);
  }
  return catalog.items;
}
export async function bundledImage(item,fetcher=fetch){
  // Validate the selected record too; never use an unchecked path from metadata.
  const [record]=await bundledCatalog(async()=>({ok:true,json:async()=>({schema:1,items:[item]})}));
  const response=await fetcher(new URL(record.file,base));
  if(!response.ok)throw new Error('无法读取随包固件文件');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const details=await inspectFirmware(bytes);
  if(details.size!==record.bytes||details.version!==record.version||details.sha256!==record.sha256)throw new Error('随包固件与清单不一致，文件可能损坏');
  return {bytes,...details,name:record.file};
}
