// Application-only updates for the current, fixed ESP32-S3 partition layout.
export const APP_OFFSET = 0x10000;
export const APP_SIZE = 0x100000;
const project = 'esp32s3_dualsense_identity_expe';
const text = (b, start, length) => new TextDecoder().decode(b.slice(start, start + length)).split('\0')[0];
export async function inspectFirmware(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 288 || bytes.length > APP_SIZE)
    throw new Error('文件大小不符合应用分区要求（最大 1 MB）');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] !== 0xe9 || bytes[1] < 1 || bytes[1] > 16 || v.getUint16(12, true) !== 9)
    throw new Error('请选择 ESP32-S3 应用固件，不支持整包、其他芯片或引导程序');
  if (v.getUint32(32, true) !== 0xabcd5432 || text(bytes, 80, 32) !== project)
    throw new Error('这不是本接收器项目的应用固件');
  let pos = 24, checksum = 0xef;
  for (let i = 0; i < bytes[1]; ++i) {
    if (pos + 8 > bytes.length) throw new Error('固件段头不完整');
    const size = v.getUint32(pos + 4, true); pos += 8;
    if (!size || pos + size > bytes.length) throw new Error('固件数据段不完整');
    for (let j = pos; j < pos + size; ++j) checksum ^= bytes[j];
    pos += size;
  }
  const end = Math.ceil((pos + 1) / 16) * 16;
  const hashed = bytes[23] === 1;
  if (bytes[23] > 1 || end + (hashed ? 32 : 0) !== bytes.length || bytes[end - 1] !== checksum)
    throw new Error('固件长度或校验和错误，文件可能损坏');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice(0, end)));
  if (hashed && !digest.every((b, i) => b === bytes[end + i])) throw new Error('固件 SHA-256 校验失败');
  const fileHash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { version: text(bytes, 48, 32), size: bytes.length,
    sha256: Array.from(fileHash, b => b.toString(16).padStart(2, '0')).join('') };
}
