# dsh-pinned-panel

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![platform](https://img.shields.io/badge/platform-DSH%20Web%20GUI-lightgrey.svg)](#环境要求)

> **给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的侧边栏加一个专门的「置顶区」。**
> 置顶的对话不再只是"在当前工作区里排到前面"：它们会被集中到**侧边栏列表最上方的一个「置顶」分组**里，默认展开；点开任意一条，**仍然回到它本来的工作区**继续。

[English](README.md) | 简体中文

---

## 效果

```
侧边栏
├─ 📌 置顶                       3      ← 新增分组，列表第一个，默认展开
│   ├─ 🔧 修复登录失效            14:32
│   ├─ 📊 接口差异报告            昨天
│   └─ 📝 周报草稿                10-21
├─ 📁 default-workspace                 ← 原有的工作区分组，一行都没动
│   ├─ 会话 A
│   └─ 会话 B
└─ 📁 另一个工作区
```

- **侧边栏列表顶部的「置顶」分组**：行高 32px、表头 34px、`--dsw-radius-md` 圆角、悬停/焦点环都照应用自己的会话行复刻，亮暗色随主题。
- **默认展开**，点表头可收起（选择记在 `localStorage` 里）。
- **点行 = 回到原工作区打开**：走官方 `uiWorkspace.openSession()`，和点侧边栏里那一行完全等价——工作目录、上下文、历史都不变。
- **不另存一份置顶状态**：分组直接读宿主的 `pinnedSessionIds` 与工作区归属；置顶 / 取消置顶仍然是应用原有的 📌 动作（本插件额外提供悬停 ✕）。
- **能看出来源**：每行右侧显示它所属的工作区，悬停显示完整标题。
- **原行保留**：置顶的对话在它原来的工作区分组里照常显示，置顶区只是额外入口，不是"搬家"。
- **图标栏一点直达**：侧边栏图标栏的 📌 直接跳到**最近更新的那条置顶对话**，中间不落页面；没有置顶项时才打开置顶页（空状态里有置顶引导）。
- **整页入口不影响**：「置顶」分组表头右侧的计数点开就是整页「置顶对话」（按工作区分组）。将来 DSH 若重排侧边栏列表，这个页面是不受影响的那一半。

## 安装

### 应用内安装（推荐）

1. 打开 **设置 → 插件**；
2. 点 **添加插件**；
3. 粘贴本仓库的 Git 地址：

   ```
   github:OuQiL/dsh-pinned-panel
   ```

   （对话框也接受完整的 `https://github.com/OuQiL/dsh-pinned-panel`、压缩包地址，或本地绝对路径）

4. 刷新页面。侧边栏图标栏出现 📌，会话列表顶部出现「置顶」分组。

### 命令行安装

```bash
dsh plugin add github:OuQiL/dsh-pinned-panel
# 或显式指定 profile
dsh plugin --profile desktop add github:OuQiL/dsh-pinned-panel
```

### 从本地目录安装

```bash
git clone https://github.com/OuQiL/dsh-pinned-panel.git
dsh plugin add /absolute/path/to/dsh-pinned-panel
```

链接目录安装时，改完 `lib/client.js` 刷新页面（`Ctrl+R`）即可加载新 bundle，无需重装。

### 卸载

设置 → 插件 → *dsh-pinned-panel* → 停用/卸载；或 `dsh plugin remove dsh-pinned-panel`。

## 环境要求

- DeepSeek Harness **Web GUI**（Desktop 应用渲染的是同一套 Web 界面），在 `0.2.1-rc.2` / Windows 上实测。
- 不需要任何宿主权限、凭据或网络端点：Host 半边是空实现，能力全在浏览器侧。
- 只有 Web GUI 有侧边栏；TUI / headless profile 没有可挂载的位置。

## 工作原理

```
置顶状态（宿主）                 uiWorkspace 服务（应用自带）
  pinnedSessionIds  ────┐          openSession(id) ──► 选中该会话并显示对话
  items[].sessionIds ───┴─► 置顶区 ──► unpinSession(id) ──► 写回置顶集合
                             （列表分组 + 整页）   两者都是官方调用
```

两个渲染面板，一份数据来源：

| 面板 | 挂载方式 |
|---|---|
| **置顶对话页** | 原生 slot：`sidebar.panellist` 一个图标 + `main` 同 id 的页面（`ctx.layout.selectPanel('pinned')` 切换）。 |
| **列表里的置顶分组** | 应用的会话浏览器整块占用了**单个** `sidebar.workspaces` slot，插件无法往里插分组。于是本插件在 `sidebar.panellist` 里放一个常驻座位，从**自己的 DOM 节点**向上找到列表滚动容器，把一个宿主节点插入列表第一个子节点，再用 React portal 渲染分组；`MutationObserver`（+ 兜底轮询）在 React 重建列表后自动重新挂载。 |

为什么要动 DOM：替换整块会话浏览器等于重写应用的会话列表，升级必坏；只在顶部**追加**一个分组是入侵最小的做法——只插入，不隐藏、不重排应用自己渲染的任何内容。

图标栏那个按钮本身是应用的"面板按钮"，点击会选中该 id 对应的 `main` 条目——插件没法可靠地拦下这次点击。所以那个条目做成了**跳转入口**：它一挂载就在 layout effect 里（浏览器绘制前）打开最近更新的置顶对话，面板随即被对话替换，所以点下去直接落到对话里。一条置顶都没有时，它才渲染整页（含空状态引导）。整页另有一个独立 key，由侧边栏分组表头的计数直接打开，不经过这次跳转。

### 注入层的防御措施

- 锚点来自插件自己的节点（沿祖先链向上找），**不用**全局选择器盲猜；
- 按构建哈希 class 的**后缀**匹配（`*_listArea`、`*_list`、`*_groupSection`），换哈希不影响；
- 扁平列表（In one list）与搜索态自动不注入（那里没有工作区分组可依附）；
- 结构不符合预期时**什么都不做**，只在控制台打一行：
  `[dsh-pinned-panel] sidebar list seam not found; the Pinned page in the sidebar rail still works.`
- 整页面板完全不依赖注入层。

这里有一个必须注意的 React 细节：**portal 的事件冒泡走 React 树，不走 DOM 树**。这个 portal 挂在侧边栏图标按钮下面，所以注入分组里每个可交互元素都做了 `stopPropagation()`——否则点一行会同时触发图标按钮的"选中置顶面板"，而那个面板的跳转入口会立刻把主区域拽回最新置顶那条（表现为"闪一下又回到第一条"）。

## 已知边界

- 列表分组是**显示层**追加：不改会话顺序、不写额外存储，应用自带"置顶在组内最前"的行为原样保留。
- 不属于任何工作区的置顶对话：整页里归入「未分组」，侧边栏分组里不显示来源标签、混排。
- 整页按工作区分组，组内按最近更新排序。
- 插件沿用应用的置顶语义，不新增自己的置顶存储，所以刷新、换浏览器都一致。
- 若 DSH 未来重构侧边栏浏览器，注入层可能需要适配（契约就是上面那几个 class 后缀）；整页不受影响。

## 开发

```
package.json          bundle 清单：Host patch + 浏览器半边
cordis.patch.yml      插入一行 Host 插件（Host 半边为 no-op）
index.js              Host 半边：空 apply()
lib/client.js         浏览器 bundle：列表分组注入、图标栏图标、置顶页
locale/{zh,en}.json   插件管理里显示的名称与描述
icon.svg              原创建意图标
```

```bash
node --check lib/client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
```

没有构建步骤：`lib/client.js` 就是交付给客户端加载的浏览器模块
（`window.__ModuleLoader__.load({ id, factory })`），页面加载时直接读取。
它把同一个工厂同时注册到当前包名和改名前的 `@local/dsh-pinned-panel` 两个 id 上，
这样仍装着旧包的 profile 不会报 `loaded without registering …` 而加载失败；旧包卸载后第二个注册自然闲置。

## 许可

[MIT](LICENSE) © 2026 OuQiL

与 DeepSeek 官方无隶属关系；"DeepSeek Harness" 是本插件所扩展的宿主应用。
