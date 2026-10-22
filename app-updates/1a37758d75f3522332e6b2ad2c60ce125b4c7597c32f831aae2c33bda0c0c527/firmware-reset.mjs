// Explicit EN reset with IO0 released. esptool-js 0.7.0's HardReset only
// deasserts RTS; without the assertion edge, an S3 stub can keep running.
export async function resetToApplication(transport, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  await transport.setDTR(false); // IO0 high: normal flash boot, not download.
  await transport.setRTS(true);  // EN low: assert reset.
  await wait(150);
  await transport.setRTS(false); // EN high: boot the installed application.
  await wait(150);
}
