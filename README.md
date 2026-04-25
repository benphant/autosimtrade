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
- 已安装 Microsoft Edge
- 能访问学校 SimTrade 网站
- 首次启动需要联网安装 npm 依赖

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
