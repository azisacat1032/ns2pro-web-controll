# ns2pro-web-controll

NS2 Pro 接收器网页控制台，面向 ESP32-S3 BLE → DualSense USB 固件。

控制台地址：https://azisacat1032.github.io/ns2pro-web-controll/

## 使用

1. 在桌面 Chrome / Edge 打开控制台，插入接收器，点击“连接接收器”并选择配置 HID 接口。
2. 支持按键映射、背键绑定、7 格电量及充电状态、震动强度、混合扳机开关、摇杆死区、校准与纯圆 / 圆角微方模式。功能需要匹配的接收器固件。
3. 点击顶部“固件更新”进入二级烧录面板，选择本项目应用 `.bin`，连接烧录串口后更新。需要 USB 串口烧录连接，不能仅用 DualSense USB 接口。

更新固定写入应用区，保留 NVS 配对与配置。请保持 USB 连接直至校验成功。首次连接时需在浏览器中授权选择设备。

## 部署

纯静态网页，无后台、无运行时 CDN 依赖。保留目录结构，将仓库根目录发布到 HTTPS 静态站点即可。GitHub Pages 发布源为 `main` 分支根目录。

`vendor/` 包含 esptool-js、js-md5 及原许可证；详细版本与来源见 [vendor/README.md](vendor/README.md)。
