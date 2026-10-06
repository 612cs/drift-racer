# Drift Racer

[在线试玩](https://612cs.github.io/drift-racer/) · [公开源码](https://github.com/612cs/drift-racer) · [Gameplay 视频](https://612cs.github.io/drift-racer/gameplay.mp4)

浏览器端 2.5D 漂移计时赛车。依据 [PRD.md](PRD.md) 实现，使用原生 JavaScript、Canvas 2D、Web Audio API 和 localStorage；无需后端、第三方运行时依赖或外部素材请求。

## 运行

需要 Node.js 20 或更高版本，无需 `npm install`。

```sh
npm start
```

打开 http://127.0.0.1:4173 。请通过 HTTP 访问，不要直接双击 `index.html`：游戏使用 ES modules。

```sh
npm test
npm run build
npm run preview -- --port 4174
```

`dist/` 是可独立托管的静态产物，预览地址为 http://127.0.0.1:4174 。改变端口会改变 localStorage 的 origin，因此两个地址的进度互不共享。

## 操作

| 按键 | 功能 |
| --- | --- |
| ↑ / W | 加速 |
| ↓ / S | 刹车 |
| ← / A、→ / D | 转向 |
| Space | 按住漂移，松开触发 Boost |
| Shift | 消耗 50% 氮气，获得 3 秒加速；支持快速轻按 |
| R | 重跑当前圈，保留已完成圈的成绩 |
| Esc | 暂停或继续 |

菜单可使用 ↑ / ↓ 选择赛道、← / → 选择车辆、Enter 开始比赛；也可使用按钮。驾驶需要键盘，不提供移动端虚拟方向盘或手柄操作。

有效漂移达到 0.5、1、2 秒分别进入 ×1、×2、×3，释放时增加 5%、15%、30% 氮气并获得 Boost。撞墙、驶出赛道或超过连击续接时间会中断 combo。氮气只能通过有效漂移获得，长按 Shift 不会连续消耗。

## 游戏内容

- **计时赛**：3 圈，结算单圈成绩、最快圈、总时间和奖牌。
- **自由练习**：不限圈数，可切换理想路线，不计入奖牌与解锁。
- **海岸公路**：2.8 km，初始可用，日落海景和宽阔弯道。
- **山道发卡弯**：3.2 km，海岸公路银牌解锁，连续急弯、山林与隧道。
- **城市高架**：3.5 km，山道金牌解锁，夜景、护栏及两段跳跃区。
- **四辆车**：小钢炮初始可用；海岸金牌解锁 Speedster GT；山道金牌解锁 Drift Demon；全赛道金牌解锁 Legend Prototype。
- **Ghost**：保存赛道与车辆组合的最快圈，下次挑战以半透明车辆回放，显示实时领先或落后时间。
- **六项成就**：初次漂移、连击大师、完美路线、速度恶魔、传奇车手、Ghost 杀手，包含轨迹、车漆和引擎音效奖励。
- **音频**：三首按赛道区分的合成 Synthwave BGM，动态引擎、漂移、Boost、氮气、碰撞、倒计时、完赛及 UI 音效。

音频在首次点击或键盘交互后初始化，以满足浏览器的 autoplay 限制。设置中可以调整主音量、音乐、音效、画质和已解锁车漆。页面失去焦点时暂停比赛。

## 存档

localStorage key 为 `drift-racer-v1`。成绩、Ghost、解锁、成就和设置保存在当前浏览器与 origin 内，不上传服务器。清除网站数据会清除进度；隐私窗口与其他浏览器不会共享存档。

Ghost 在模拟过程中按 60 Hz 采样，保存时按时间重采样，保留停留时间与精确终点；播放通过插值平滑。存储不可用或写入失败时界面明确提示，当前会话仍可运行，但刷新后可能丢失进度。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/data.js` | 赛道、车辆、奖牌与成就定义 |
| `src/race.js` | 固定步长物理、漂移、氮气、碰撞、计时与 Ghost |
| `src/renderer.js` | 伪 3D 投影、车辆绘制、场景与粒子池 |
| `src/audio.js` | BGM 合成、引擎与事件音效 |
| `src/save.js` | 存档、Ghost 压缩、奖牌、解锁与成就 |
| `src/main.js` | 键盘输入、UI、模拟循环与模块编排 |
| `test/game.test.js` | 游戏规则与存档边界回归测试 |
| `scripts/serve.mjs` | 本地 HTTP server |
| `scripts/build.mjs` | 生成独立静态发布目录 |
| `.github/workflows/pages.yml` | 测试、构建与 GitHub Pages 自动发布 |

## 验证记录

- `npm test`：11 项通过，覆盖漂移档位、碰撞、氮气按键边沿、暂停、重跑当前圈、自由练习、奖牌边界、Ghost、六项成就及存储失败。
- Chromium 实际键盘操作：加速、转向、漂移释放、快速 Shift、暂停与返回菜单；发布版 HUD 显示氮气 `10%` 与 `NITRO IGNITION`，无浏览器错误。
- Firefox、WebKit：使用加速输入驱动实际游戏模拟，完成三圈、显示结算，AudioContext 为 `running`。WebKit engine 验证不等同于原生 Safari 实机验证。
- Chromium 中的 1920 × 1080 Canvas、高画质完整特效：每条赛道采集 600 个帧间隔，平均约 60 fps，p95 约 17.3–17.4 ms。Boost 边缘模糊使用尺寸缓存，避免逐帧执行 blur。
- 冷缓存模拟网络：150 ms latency、1.6 Mbps 下载；首个内容绘制约 536 ms，页面加载完成约 1.12 s。以上为本机测量，不代表所有设备。
- GitHub Pages 线上：实际键盘验证加速、转向、漂移、快速 Shift 和暂停；氮气 HUD 显示 `10%` 与 `NITRO IGNITION`，AudioContext 为 `running`。公开 MP4 已在浏览器中实际解码播放，1536 × 864、约 17.23 秒。

## Gameplay

[gameplay.mp4](gameplay.mp4)：约 17.2 秒，1536 × 864、30 fps、H.264 视频与 AAC 音轨，约 2.9 MiB。录制实际键盘驾驶，包含倒计时、转向、两次漂移 Boost 与氮气喷射；音轨来自游戏 Web Audio 输出。

## 静态部署

将 `dist/` 的**内容**作为站点根目录发布。资源使用相对路径，可部署在 GitHub Pages 的 repository 子路径；构建包含 `.nojekyll`。其他静态托管服务也可以直接使用该目录。

公开源码 repository：https://github.com/612cs/drift-racer 。

`.github/workflows/pages.yml` 在 `main` push 或手动触发时执行测试、构建、上传和 Pages 发布；测试失败时不发布。CI 将 README、PRD 与 gameplay 视频附加到静态站点，不需要 `npm install` 或额外 secrets。

GitHub Pages 地址：https://612cs.github.io/drift-racer/ 。Gameplay 地址：https://612cs.github.io/drift-racer/gameplay.mp4 。
