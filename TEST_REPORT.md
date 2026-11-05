# 0.3.0 验收报告

最终验收在本机 Ego Lite 中操作已加载的真实 MV3 插件。所有数据和登录均为本项目合成数据；未接入实际业务环境。结果文件携带各次运行的时间戳。

## 核心自动断言：13 项通过

`tests/ego-lite/acceptance.js` 的最终运行见 `evidence/v2/acceptance-results.json`：

1. 直接打开 /#/both，两个本地应用同一页面运行，资源来自独立端口。
2. 主应用业务 bundle 不包含插件 resolver 或接入握手。
3. 同源接口 Cookie 认证：Alpha/Beta 各返回 200，credentials:omit 返回 401，JS 无法读取 HttpOnly 会话。
4–7. 每个应用连续两次代码修改，立即热更新；主页面 sentinel、自己和另一个应用的计数器均保持。测试后源码标记已恢复。
8. 本地入口 `/app-alpha/?layout=main` 完整保留并正常加载。
9. 无本地服务的地址会回退到线上版本，状态报告不可用。
10. 单应用关闭后，一本地、另一线上。
11. 总开关关闭后，两个应用均使用线上构建。
12. 三轮路由卸载与重新挂载。
13. 页面刷新后映射正确。

## 补充的真实浏览器检查

| 场景 | 结果 | 证据 |
|---|---|---|
| 250ms 网络延迟下双应用启动；两个 HMR WebSocket | PASS | slow-network.json |
| props 工厂、别名、守卫、baseRoute、额外参数、线上查询参数保留 | PASS | route-fields.json |
| 公开 window.qiankun 的另一主应用，两个本地应用加载 | PASS | public-api-adapter.json |
| 退出后两个接口均返回 401，重新登录后双应用认证恢复 | PASS | logout.json |
| 新增 localhost 环境，拒绝授权提示、授权、正常加载 | PASS | new-origin-permission.json |
| 环境删除并回收其站点授权 | PASS | config-management.json |
| 配置导出、导入，非法 javascript 地址导入被拒绝 | PASS | config-management.json |
| 已删除环境的页面刷新后不再有插件运行时 | PASS | 补充断言执行；同一 localhost 主应用恢复线上 Alpha |
| 无公开接入接口的页面明确显示不支持 | PASS | unsupported-and-matching.json |
| 精确域名/端口匹配，近似恶意域名不匹配 | PASS | unsupported-and-matching.json |
| 插件在扩展管理中完全停用，两个线上应用仍可运行 | PASS | extension-disabled.json |
| 关闭插件前后主应用构建资产相同，重新启用后本地映射恢复 | PASS | extension-disabled.json、host-v2-bundle-checksums.txt |
| 最终只保留已配置主应用的站点授权，无 cookies 权限 | PASS | permission-scope.json |
| 中文设置页、弹窗视觉检查；600px 窄视窗无横向溢出 | PASS | options-final.png、options-narrow.png、popup.png、responsive.json |

原生授权提示的拒绝/允许流程在浏览器自身界面检查；并非声称整个授权流程可无人值守自动运行。开发中的失败记录和早期版本资料未删除。

## 修复的关键问题

- 去掉主应用专用 resolveEntry 依赖，改为插件适配既有路由或公开 qiankun 加载接口。
- 保留正常路由记录身份，不再用不完整的路由重建丢失别名、守卫或当前匹配记录。
- 有界等待配置，处理直接深链接打开和刷新的初始路由时序。
- 精确识别入口 HTML；以实际生命周期注册协调 Vite 开发加载，避免固定延时和全 Origin 请求排队。
- 配置修改需刷新主应用，明确提示 qiankun 缓存带来的生效边界，避免界面显示已切换但实际仍用旧应用。
- 探测本地服务，失败回退；配置 URL 和导入校验；站点权限按需申请与回收。
- 修复 HMR 旧闭包和状态持久化；生产备用应用使用普通 UMD 生命周期，不拿开发模式 ESM 当线上产物。
- 中文卡片式设置页、开关点击区域和弹窗状态展示。

## 限制

本版本只支持 README 列明的可访问、可写的既有运行时入口。没有验证真实业务系统，也不保证完全私有打包项目或所有框架通用可用。Vue Router 4 已实测；其他兼容 API 形态仍应针对目标项目验证。

Vite 加载协调识别 vite-plugin-qiankun 的生命周期约定，等待上限 8 秒，超时后提示并释放队列；它不是任意异步初始化与任意 ESM 沙箱的通用隔离保证。未关闭浏览器安全策略。

Cookie 对照来自 HTTP 回环模拟环境，不能代替真实 HTTPS/Secure、SSO 或跨站策略验收。旧 Playwright 套件未被用作最终验收，也未宣称其当前全部通过。
