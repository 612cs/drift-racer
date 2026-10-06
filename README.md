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

音频在首次点击或键盘交互后初始化，以满足浏览器的 autoplay 限制。AudioContext 的 resume 在用户手势内发起；PCM 在 module Worker 内合成，主线程只接收可转移缓冲并建立音频节点。首次准备期间显示提示，不阻塞菜单交互。仅生成当前需要的赛道 BGM，其他曲目首次使用时生成并在当前会话缓存。设置中可以调整主音量、音乐、音效、画质和已解锁车漆。页面失去焦点时暂停比赛。

## 存档

localStorage key 为 `drift-racer-v1`。成绩、Ghost、解锁、成就和设置保存在当前浏览器与 origin 内，不上传服务器。清除网站数据会清除进度；隐私窗口与其他浏览器不会共享存档。

Ghost 在模拟过程中按 60 Hz 采样，保存时按时间重采样，保留停留时间与精确终点；播放通过插值平滑。存储不可用或写入失败时界面明确提示，当前会话仍可运行，但刷新后可能丢失进度。

## 性能策略

- **画质**：手动高/低画质保留原有 DPR 上限 2/1；自动画质以约 60 fps 为目标，高档最多 300 万物理像素，低档最多 150 万，按比例缩放，不删减赛道或玩法。尺寸按整数像素取整，预算最低为 1 像素。
- **自动降档**：复用 60 帧的移动窗口；平均帧间隔持续超过 18.5 ms 约 1 秒后降低画质，持续 50 fps 会降档。恢复需平均间隔不超过 17.2 ms 持续 4 秒，并在低档至少停留 5 秒。单次尖峰不会直接降档；暂停与后台长间隔不计入恢复或恶化。
- **静止状态**：暂停和结算保留最后的场景图像，不继续绘制或推进模拟；尺寸或相关设置改变时重绘。恢复比赛不补算暂停时间。
- **主线程**：Canvas 尺寸在 ResizeObserver、窗口尺寸、DPR、画质或像素预算改变时更新，不逐帧读取布局；HUD 缓存节点与显示值，仅更新变化项。
- **存档**：音量拖动实时调整音频；提交、关闭设置、隐藏或离开页面时保存一次，不对每个 input 事件序列化完整存档。
- **生命周期**：离开页面终止 Worker、拒绝未完成请求并关闭 AudioContext；初始化尚未完成时也能关闭。音频失败会明确提示，游戏仍可继续。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/data.js` | 赛道、车辆、奖牌与成就定义 |
| `src/race.js` | 固定步长物理、漂移、氮气、碰撞、计时与 Ghost |
| `src/renderer.js` | 伪 3D 投影、车辆绘制、场景与粒子池 |
| `src/audio.js` | AudioContext 生命周期、按需曲目缓存、引擎与事件音效播放 |
| `src/audio-synth.js` | 不依赖 AudioContext 的 PCM 合成与三首 Synthwave 乐谱 |
| `src/audio-worker.js` | 按需合成、保留鼓采样、Transferable 输出 |
| `src/performance.js` | 像素预算尺寸计算和自适应画质迟滞 |
| `src/save.js` | 存档、Ghost 压缩、奖牌、解锁与成就 |
| `src/main.js` | 键盘输入、UI、模拟循环与模块编排 |
| `test/game.test.js` | 游戏规则与存档边界回归测试 |
| `test/audio-synth.test.js` | PCM 音量、节奏、循环接缝与跨曲目传输回归 |
| `test/performance.test.js` | 像素预算、持续慢帧、尖峰、恢复与暂停边界回归 |
| `scripts/serve.mjs` | 本地 HTTP server |
| `scripts/build.mjs` | 生成独立静态发布目录 |
| `.github/workflows/pages.yml` | 测试、构建与 GitHub Pages 自动发布 |

## 验证记录

- `npm test`：25 项通过，覆盖原有游戏与存档规则，以及 PCM 音量/循环、Worker 跨曲目传输、像素边界与自动画质状态转换；静态构建通过。
- Chromium 实际键盘驾驶：加速、转向和漂移释放，达成 Combo ×1、氮气 5%；HUD 正常更新。三赛道加载 Ghost 和对应 BGM，曲目缓存从 1 首逐步增加到 3 首。
- 音频：缓存资源、四倍 CPU 限速下，新音频引擎准备约 128.8 ms，主线程建图约 3.7 ms，未观测到 long task；音乐总线 RMS 约 0.047。初始化途中关闭后，AudioContext 为 closed、Worker 已终止、未完成请求清空。
- 暂停 2 秒：绘制次数、计时与位置均不变，AudioContext 为 suspended。通过加速调用真实固定步长模拟完成三圈，结算弹窗显示银牌与三圈成绩；结算后 1.5 秒新增绘制为 0。窗口缩放后重绘，随后再次保持静止。
- 音量：连续 80 次 input 实时更新到 49%，期间存档写入 0 次，change 提交后写入 1 次。
- Firefox、WebKit 实际启动 module Worker：首次只生成海岸曲目，随后加载山道和城市曲目，音频保持 running、曲目时长正确且 PCM RMS 约 0.096；暂停期间绘制、计时和位置不变，恢复后重新运行，均无 pageerror。
- 1920 × 1080、DPR 1、Ghost 开启：采样 180 个帧间隔，约 58.1 fps，p95 17.5 ms。Retina DPR 2 下三赛道各采样 180 帧，约 47.9 / 53.9 / 56.7 fps；自动画质实际降至 150 万像素，或保持在 300 万像素以内。实测不是稳定 60 fps，结果受本机负载影响。
- 场景特效和既有 Gameplay 视频保留；漂移/氮气规则、Ghost 逻辑未改写。本机测量不代表所有设备；WebKit engine 验证不等同于原生 Safari 实机验证。

## Gameplay

[gameplay.mp4](gameplay.mp4)：约 17.2 秒，1536 × 864、30 fps、H.264 视频与 AAC 音轨，约 2.9 MiB。录制实际键盘驾驶，包含倒计时、转向、两次漂移 Boost 与氮气喷射；音轨来自游戏 Web Audio 输出。

## 静态部署

将 `dist/` 的**内容**作为站点根目录发布。资源使用相对路径，可部署在 GitHub Pages 的 repository 子路径；构建包含 `.nojekyll`。其他静态托管服务也可以直接使用该目录。

公开源码 repository：https://github.com/612cs/drift-racer 。

`.github/workflows/pages.yml` 在 `main` push 或手动触发时执行测试、构建、上传和 Pages 发布；测试失败时不发布。CI 将 README、PRD 与 gameplay 视频附加到静态站点，不需要 `npm install` 或额外 secrets。

GitHub Pages 地址：https://612cs.github.io/drift-racer/ 。Gameplay 地址：https://612cs.github.io/drift-racer/gameplay.mp4 。
