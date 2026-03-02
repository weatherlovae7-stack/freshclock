## FreshClock TWA 上架准备清单

### 1) 站点必须 HTTPS 且可公网访问

- 你需要把整个 `test fresh food/` 目录部署到一个域名下（例如 `https://freshclock.example.com/`）。
- 确保以下路径可直接访问：
  - `/index.html`
  - `/manifest.webmanifest`
  - `/sw.js`
  - `/privacy.html`
  - `/terms.html`
  - `/.well-known/assetlinks.json`

### 2) Play Console 的“隐私政策网址”

- 填写你的公网隐私政策页面，例如：
  - `https://freshclock.example.com/privacy.html`

### 3) Digital Asset Links（TWA 必须）

- 把本仓库中的 [assetlinks.json](file:///d:/trae%20%E9%A1%B9%E7%9B%AE%E6%B5%8B%E8%AF%950216/test%20fresh%20food/.well-known/assetlinks.json) 部署到：
  - `https://你的域名/.well-known/assetlinks.json`
- 将 `package_name` 改为你的 Android 包名。
- 将 `sha256_cert_fingerprints` 改为你用于签名的证书指纹（发布签名/上传签名以你的流程为准）。

### 4) 生成 Android 包（建议 Bubblewrap）

- 使用 Bubblewrap（`bubblewrap init` / `bubblewrap build`）创建 TWA 包装。
- Launch URL 使用你的站点主页（例如 `https://freshclock.example.com/index.html`）。
- 生成 AAB 后上传到 Google Play。

### 5) 资源与离线策略说明

- 本项目已使用本地 React vendor，减少外网依赖风险。
- Tailwind 仍使用 CDN（`cdn.tailwindcss.com`）。如果你希望更稳过审并提升离线可用性，建议改为构建期生成静态 CSS 再部署（不依赖运行时 CDN）。
