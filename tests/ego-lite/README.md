# Ego Lite 验收

本目录的 acceptance.js 对真实安装的插件执行 13 项核心断言，不注入替代插件。

运行前请先构建并启动本地演示，在 Ego Lite 加载 extension 文件夹，配置 18085 主应用环境、授权该环境，并将 app-alpha / app-beta 映射至 18001 / 18002。

默认项目路径为当前用户的 Desktop/microfrontend-devtools，扩展 ID 为首次验收所用的本地安装 ID；其他电脑需修改脚本顶部 ROOT 和 EXTENSION_ID，或在脚本前设置 globalThis.MF_PROJECT_ROOT 与 globalThis.MF_EXTENSION_ID。扩展 ID 可在 Ego Lite 扩展管理页查看。

```bash
ego-browser nodejs < tests/ego-lite/acceptance.js
```

测试会临时修改两个子应用的标记以验证 HMR，随后恢复，并写入 evidence/v2/acceptance-results.json 和截图。只使用项目的模拟账号 demo-user / demo-pass。

最终执行记录与适用边界见项目根目录 TEST_REPORT.md。
