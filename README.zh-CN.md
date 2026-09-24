<div align="center">

# DeepPaperNote Connector

**把发现的论文，直接收藏到 Obsidian。**

[English](./README.md) | [简体中文](./README.zh-CN.md)

[快速开始](#快速开始) · [用 DeepPaperNote 深入阅读](https://github.com/917Dhj/DeepPaperNote) · [AGPLv3](./COPYING)

</div>

遇到一篇想留着读的论文？DeepPaperNote Connector 帮你获取 PDF、确认论文信息和保存位置，再归档到你的 Obsidian 论文库，省去手动移动下载文件和重命名的步骤。

准备精读时，把已收藏的 PDF 交给 [DeepPaperNote](https://github.com/917Dhj/DeepPaperNote)。它可以在同一论文目录中生成深度笔记，让原文与理解一起积累。

**打开论文 → 点击扩展 → 确认信息与目录 → 在 Obsidian 中找到 PDF。**

## 为什么使用 Connector？

- **少花时间整理 PDF。** 从支持的论文页面获取 PDF，保存前确认标题、作者、年份和目标位置。
- **把同一篇论文的材料放在一起。** Connector 会帮你查找 Vault 中已有的论文目录；有多个匹配目录时，由你选择保存位置。
- **保留版本，保护已有文件。** 内容相同的 PDF 会被复用；同一篇论文的不同版本 PDF 可以共存，已有 PDF 和笔记会被保留。
- **先收藏，之后再精读。** 浏览时收好原文，想深入理解时再用 DeepPaperNote 生成包含方法、图表、结果和局限的深度笔记。

## 快速开始

当前安装方式支持 **macOS 上的 Chrome**，需要浏览器扩展和一个 **本地保存组件**，由后者将 PDF 写入你的 Vault。还需要 Git、带 npm 的 Node.js **22.12+** 和 Python **3.10+**。以下步骤从源码构建扩展，并通过 Chrome 开发者模式加载。

### 1. 设置 Obsidian 保存位置

Connector 使用 DeepPaperNote 已保存的 Obsidian 位置。如果已经配置好，沿用该位置并继续第 2 步即可。

尚未配置时，先按照 [DeepPaperNote 快速开始](https://github.com/917Dhj/DeepPaperNote/blob/main/README.zh-CN.md#-快速开始)安装，再向 Agent 提出：

```text
请为 DeepPaperNote 配置并保存今后使用的 Obsidian 位置：
Vault：<已有 Vault 的绝对路径>
Vault 内的论文目录：Research/Papers
这次只配置位置，先不要阅读论文。
```

在论文目录中创建至少一个研究领域文件夹，例如 `Research/Papers/机器学习`。收藏新论文时，Connector 使用已有的领域文件夹，不会自行创建领域。

该位置保存在 DeepPaperNote 的设备本地偏好中。手动配置与排查方法见[用户配置说明](https://github.com/917Dhj/DeepPaperNote/blob/develop/skills/deeppapernote/references/user-configuration.md)。

### 2. 构建并加载扩展

```sh
git clone --recurse-submodules https://github.com/917Dhj/DeepPaperNote-Connector.git
cd DeepPaperNote-Connector
npm ci
./build.sh
```

在 Chrome 中：

1. 打开 `chrome://extensions`，开启**开发者模式**。
2. 选择**加载已解压的扩展程序**，选中仓库中的 `build/manifestv3` 文件夹。
3. 复制扩展的 **ID**，下一步会用到。

### 3. 安装本地保存组件

在同一个仓库目录中执行以下命令，将占位符替换为 Chrome 显示的扩展 ID：

```sh
python3 -m pip install -r native_host/requirements.txt
python3 native_host/deeppapernote_host.py install \
  --extension-id "<32-character Chrome extension ID>"
```

两条命令请使用同一个 Python 环境；安装后的组件会使用该解释器。如果使用虚拟环境，安装后请保留该环境。

回到 `chrome://extensions` 重新加载扩展。打开扩展选项，选择 **Default research domain（默认研究领域）** 并点击 **Save**。点击 **Check native host** 可以检查连接、预览保存位置，不会保存 PDF。

### 4. 收藏第一篇论文

打开支持的论文页面，点击扩展，核对标题、作者、年份、领域和最终路径，然后确认保存。直接打开 PDF 时，扩展会要求补充缺失的论文信息。

如果 Vault 中已有这篇论文，确认界面会展示匹配目录及其中的 PDF、笔记数量。保存前请确认推荐的目标位置，尤其留意标题相近的论文。

保存成功后，在 Obsidian 中打开显示的目标位置即可找到 PDF。文件会按作者、年份和论文标题命名。

## 从收藏 PDF 到深度笔记

Connector 负责收藏，[DeepPaperNote](https://github.com/917Dhj/DeepPaperNote) 负责精读。后者通过 Claude Code 或 Codex，将一篇论文整理成值得长期保留的 Obsidian 笔记。

把已保存的 PDF 交给 Agent，例如：

```text
请用 DeepPaperNote 为这篇论文生成深度笔记：<已保存 PDF 的绝对路径>。
将笔记保存到同一个 Obsidian 论文目录。
```

不同版本的 PDF 可以拥有各自对应的笔记，已有笔记仍受保护。收藏 PDF 不会自动启动 Agent 或生成笔记。

## 支持范围与常见问题

**需要安装 Zotero 吗？** 不需要。Connector 直接将论文保存到 Obsidian Vault，无需 Zotero 账号或桌面应用。

**可以只用来收藏 PDF 吗？** 可以，不需要为每篇论文生成笔记。不过，保存前仍需配置共享的 Obsidian 位置。

**支持哪些浏览器和系统？** 当前支持 macOS 上的 Chrome，需要安装本地保存组件。Firefox、Edge、Safari、Windows 和 Linux 不在当前支持范围内。

**所有论文页面都能保存吗？** 获取能力取决于页面能否被识别、PDF 是否可用。每篇论文要求恰好有一个 PDF 附件。目前不提供批量采集、网页快照、Google Docs 集成或 OCR。

**会生成笔记或提取配图吗？** 不会。Connector 负责收藏 PDF；需要包含配图的深度笔记时，再使用 DeepPaperNote。

**无法连接本地组件，或没有可选领域怎么办？** 检查共享 Vault 与论文目录是否已配置、论文目录下是否存在领域文件夹，以及安装组件时是否使用了当前扩展的 ID。共享配置缺失或无效时，保存会停止，不会退回旧位置。配置方法详见[用户配置说明](https://github.com/917Dhj/DeepPaperNote/blob/develop/skills/deeppapernote/references/user-configuration.md)。

**怎样更新？** 更新本地仓库后，执行 `git submodule update --init --recursive`、`npm ci` 和 `./build.sh`。重复第 3 步，更新已安装的本地组件及依赖，再重新加载扩展。如果 Chrome 分配了不同的扩展 ID，请使用新 ID 重新安装组件。

## 开发与贡献

欢迎提交问题反馈和 Pull Request。反馈采集问题时，请提供页面 URL、Chrome/macOS 版本和错误信息；分享前请移除个人路径及未公开的论文信息。

`./build.sh` 将扩展构建到 `build/manifestv3`。运行浏览器测试前，先构建包含测试支持的版本：

```sh
./build.sh -d
npm test
python3 -m unittest discover -s test/native_host
```

共享归档模块 [`native_host/paper_archive.py`](./native_host/paper_archive.py) 来自 DeepPaperNote 的 `skills/deeppapernote/scripts/paper_archive.py`。修改协议时请同步两份实现。Native host 和浏览器测试覆盖归档行为与目录选择。

## 致谢与许可证

DeepPaperNote Connector 基于 [Zotero Connector](https://github.com/zotero/zotero-connectors) 开发，复用了其论文页面识别、论文信息采集和 PDF 获取能力。感谢 Zotero 项目及贡献者提供的基础。

本项目独立维护，与 Zotero 无隶属关系，也未获得 Zotero 背书。仓库沿用 **AGPLv3** 许可证，见 [`COPYING`](./COPYING)。来自 DeepPaperNote 的共享归档模块保留 **MIT** 许可证，见 [`native_host/PAPER_ARCHIVE_LICENSE`](./native_host/PAPER_ARCHIVE_LICENSE)。第三方组件继续适用各自的版权与许可声明。
