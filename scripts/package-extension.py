#!/usr/bin/env python3
"""Package only the active, dependency-free extension files."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'extension'
manifest = json.loads((source / 'manifest.json').read_text())
output = root / 'dist' / f"mf-devtools-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
paths = sorted(p for p in source.rglob('*') if p.is_file()
               and not p.name.startswith(('.', 'DEPRECATED-')))
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, path.relative_to(source).as_posix())
    archive.writestr('安装说明.txt', '''MF DevTools · 微前端本地调试

1. 解压本安装包。
2. 在 Ego Lite 扩展管理页打开开发者模式，选择“加载未打包的扩展程序”。
3. 选择直接包含 manifest.json 的解压目录。
4. 打开插件“管理配置”，添加主应用地址，并授权此环境。
5. 添加应用标识和本地入口地址，开启映射，保存并刷新主应用。

本插件支持已有 window.APP.router 或可写 window.qiankun.loadMicroApp 的主应用。
本地服务需要正确提供 qiankun 生命周期并允许主应用访问。
Cookie 由浏览器按原站点规则处理，插件不读取 Cookie。
完整使用说明和兼容范围见源码项目 README.md。
''')
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert 'manifest.json' in archive.namelist()
    assert not any('DEPRECATED' in name for name in archive.namelist())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
print(f'{output}\n{len(paths)} extension files; SHA-256 {digest}')
