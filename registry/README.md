# Parameter Registry

llm-windtunnel 的核心差异化资产：**跨推理引擎的统一参数注册表**。调研（见
[docs/research/opensource-survey-2026-10.md](../docs/research/opensource-survey-2026-10.md) 模块二）
确认目前没有任何开源项目将 vLLM / Ollama / llama.cpp / TGI 的参数统一结构化——本目录填补这个空白。

## 设计要点

1. **单一数据源（single source of truth）**：参数的中英文描述直接存放在每个 YAML 的
   `description.{en,zh}` 字段中，Web GUI 的参数浏览器与 tooltip 从 API 读取，不重复维护。
   UI 上的静态文案（按钮、表单标签等）才放在 `locales/*.json`。
2. **双语描述**：`en` 为英文原文（取自官方文档，可机读渠道自动刷新），
   `zh` 为中文译文（自译 + 人工审核）。
3. **`status` 标注文档置信度**：
   - `documented`：官方文档明确列出；
   - `runtime-only`：运行时接受但官方文档表未列出（如 Ollama 的 `mirostat`、`num_gpu`）；
   - `archived`：引擎已归档冻结（如 TGI），参数不再演进。
4. **`scope` 区分生效位置**：`request`（推理请求体 / options 中）与 `server`
   （引擎进程启动参数，提供 `flag`）。
5. **`since` 记录元数据核对的引擎版本**，便于文档漂移时 diff。

## 文件结构

```
registry/
├── schema.yaml            # 格式说明与模板（人类文档，不参与运行时加载）
└── engines/
    ├── vllm.yaml          # vLLM（EngineArgs + SamplingParams）
    ├── ollama.yaml        # Ollama（Modelfile PARAMETER + 运行时参数）
    ├── llama-cpp.yaml     # llama.cpp（llama-server 参数）
    ├── tgi.yaml           # TGI（已归档，冻结参考）
    └── openai-compat.yaml # OpenAI 兼容公共子集（任意兼容端点的基线）
```

## 如何新增一个引擎

1. 复制 `engines/tgi.yaml` 作为骨架；
2. 填写 `engine` / `displayName` / `homepage` / `apiStyle` / `launchHint`；
3. 从引擎的文档或源码提取参数：优先找程序化通道（argparse/dataclass 反射、
   结构化文档表格），次选手工摘录；
4. 每条参数填写完整字段，英文描述尽量摘自官方 help/docstring，中文自译；
5. `categories` 只保留该引擎用到的分类 id（五个标准分类见 `schema.yaml`）。

## 如何新增/修订参数

- 英文元数据（名称、类型、默认值、范围）务必对照该引擎 `since` 字段标注版本的官方文档；
- 修改后运行 `npm run dev`，参数浏览器页会即时反映（服务端启动时加载并校验全部 YAML）；
- 校验失败（schema 不符、缺少中英文）会阻止服务启动，防止坏数据进入 UI。
