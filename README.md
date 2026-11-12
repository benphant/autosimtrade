# AutoSimTrade

AutoSimTrade 是一个本地网页控制台，用来按《SimTrade 外贸实习平台实习指导书》的路线自动安排账号、角色、结算方式、贸易术语和真实网页操作。

## 快速使用

1. 双击 `启动 AutoSimTrade.bat`
2. 浏览器会自动打开 `http://localhost:3099`
3. 填账号和密码；密码为空表示无密码
4. 选择轮数，点击“开始运行”
5. 用完后双击 `关闭 AutoSimTrade.bat`

## 发给别人

双击 `打包 AutoSimTrade.bat`，会生成：

```text
dist/autosimtrade-portable.zip
```

把这个 zip 发给别人即可。对方解压后双击 `启动 AutoSimTrade.bat`。

## 对方电脑要求

- Windows
- 已安装 Node.js 20 或更高版本
- 已安装 Microsoft Edge（`Program Files` 或 `Program Files (x86)`）。两边都没有时，脚本会改用 Playwright 自带的 Chromium
- 能访问学校 SimTrade 网站
- 首次启动需要联网安装 npm 依赖

## 站点地址和浏览器

控制台里的「SimTrade 网址」会传给登录脚本，默认仍是 `http://10.14.60.254/simtrade/`。也可以在启动前设置环境变量：

- `AUTOSIMTRADE_BASE_URL`：SimTrade 根地址，例如 `http://10.14.60.254/simtrade/`
- `AUTOSIMTRADE_HEADED`：设为 `1` 时显示浏览器窗口。控制台里的「显示浏览器窗口」同样生效；默认不显示

登录会打开该地址下的 `login.aspx`，并在日志里打印浏览器实际到达的网址。主页面没有 `#txtUsrName` 时，会继续在 iframe / frame 里找。角色优先点击 `#role1`–`#role5`（SimTrade V6.1 的隐藏字段 `#cblUsrCls`），否则再使用下拉框或直接写入该字段。找不到输入框时，错误信息包含当前网址和 frame 列表，并在运行目录保存 `login-timeout.png`。

## 关闭方法

优先双击：

```text
关闭 AutoSimTrade.bat
```

它会根据 `data/server.pid.json` 关闭后台 Node 服务。

## 命令方式

```bash
npm install
npm run start
```

检查语法：

```bash
npm run check
```

## 打包说明

打包脚本会排除：

- `node_modules`
- `data/runs`
- `data/server.pid.json`
- `data/server.out.log`
- `data/server.err.log`

这样压缩包不会带上本机运行记录和临时服务状态。
