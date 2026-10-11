# 开源工作调研报告：多引擎 LLM 性能与参数测试工具

> 调研日期：2026-10-11 ｜ 项目：**llm-windtunnel** ｜ 数据来源：GitHub API / npm API / 官方文档实时抓取
>
> 目标工具定位：覆盖主流推理引擎（vLLM / Ollama / llama.cpp / TGI / OpenAI 兼容端点），测试性能指标（TTFT、ITL、TPOT、吞吐量、延迟百分位数）与参数配置，全参数带中英双语悬停解释，Web GUI，中英文一键切换。
>
> 本工具技术栈决策：**前后端统一 TypeScript**（Node + Fastify 后端、React + Vite 前端）。该决策对复用路线的影响在各模块中标注。

---

## 模块一：测试引擎与指标计算层

### 1.1 重点验证项目主表

| # | 项目 | URL | Stars | License | 最近活跃 | 指标完整度 | 参数扫描 | 可编程 API | 集成难度 |
|---|------|-----|-------|---------|---------|-----------|---------|-----------|---------|
| 1 | GuideLLM | [vllm-project/guidellm](https://github.com/vllm-project/guidellm) | 1,681 | Apache-2.0 | 极活跃（v0.8.1，2026-10-08 发版） | TTFT/ITL/E2E 完整分布 + 吞吐，SLO 导向 | 内置 sweep/constant/poisson 等 6 种流量 profile | CLI + Python API + 容器 | 低 |
| 2 | NVIDIA AIPerf | [ai-dynamo/aiperf](https://github.com/ai-dynamo/aiperf) | 766 | Apache-2.0 | 极活跃（v0.13.0，2026-09-24） | **最全**：TTFT/TTST/ITL/E2E/每用户吞吐 + P50/P90/P99/avg/std + **内置 DCGM GPU 遥测** | request-rate+并发上限、adaptive scale（自动定位 SLA 边界）、trace 回放 | CLI + YAML 配置 + 插件系统 | 中 |
| 3 | vLLM 官方 bench | [vllm-project/vllm](https://github.com/vllm-project/vllm) `vllm bench serve/sweep` | 93,530（母仓库） | Apache-2.0 | 极活跃（v0.31.0） | TTFT/TPOT/ITL/E2EL/排队时间 + 百分位可配 + 吞吐 | sweep：JSON 参数矩阵 + 服务器生命周期管理 + Pareto 图 | 仅 CLI | 高（需装整个 vLLM） |
| 4 | LLMPerf | [ray-project/llmperf](https://github.com/ray-project/llmperf) | 1,124 | Apache-2.0 | **已归档**（2024-12 起） | TTFT/ITL/吞吐（均值为主）+ 正确性校验 | 无 | 无（Ray 脚本） | 中（依赖重且停维护） |
| 5 | perftok | [timsleeper/perftok](https://github.com/timsleeper/perftok) | 1 | Apache-2.0 | 新（2026-04 创建） | TTFT/ITL/E2E + P50~P99 + 吞吐 + 错误率 | 无 | 仅 CLI（JSON/CSV 输出） | 极低（零重依赖） |
| 6 | vllm-tuner | [jranaraki/vllm-tuner](https://github.com/jranaraki/vllm-tuner) | 66 | MIT | 2026-03 后停更 | 间接（依赖被测引擎） | **有**（Optuna 贝叶斯多目标搜索） | 仅 CLI + YAML | 低 |
| 7 | vTune | — | — | — | — | — | — | — | **未验证到，可能不存在或名称有误** |

### 1.2 逐项评估

**GuideLLM —— 最成熟的引擎候选，首选复用对象。**
Neural Magic → Red Hat → vllm-project 官方项目。SLO 感知基准平台，原生 6 种流量 profile（synchronous / concurrent / throughput / constant / poisson / **sweep**），支持 OpenAI-compatible + vLLM 原生 + in-process 后端，多模态数据、HF 数据集与合成数据、trace 回放、多轮对话与 tool calling；输出 console/JSON/CSV/HTML/PLOT。是唯一同时满足"活跃维护 + 双入口（CLI/Python API）+ 内置 sweep + pip 安装简单 + Apache-2.0"的工具。缺口：无内置 GPU 指标；四个目标引擎都需走 OpenAI 兼容协议被测。

**NVIDIA AIPerf —— 指标与 GPU 遥测最强的新生代。**
NVIDIA Dynamo 团队出品（注意仓库在 `ai-dynamo` org 下，小写 `aiperf`），GenAI-Perf 官方继任者（GenAI-Perf 已宣布停更）。指标覆盖最全且**仓库内置 DCGM GPU 遥测**；官方教程覆盖 vLLM、TGI、Ollama、SGLang、TensorRT-LLM；支持 trace 回放、adaptive scale、ramp-up、KV-cache reset、MLflow/OpenTelemetry/W&B 导出、实时 TUI、YAML 配置驱动。顾虑：多进程 + ZMQ 架构偏重、对外以 CLI/插件为主而非稳定 Python API。**适合以"子进程 + YAML 配置 + JSON 产物"方式被编排**。

**vLLM 官方 bench —— 能力标杆，但绑定 vLLM 安装。**
`vllm bench serve` 指标最全且**可测任意 OpenAI 兼容端点**（`--backend openai-chat`、`--base-url`、自定义 header）；负载控制丰富（Poisson/gamma 到达率、burstiness、max-concurrency、ramp-up、warmup）。`vllm bench sweep` 支持 JSON 参数矩阵 + **自动管理 vLLM 服务器进程生命周期** + Pareto 前沿图，但 sweep 编排绑定 vLLM。必须安装 GB 级的 vLLM 包，不适合作为轻量 GUI 工具的进程内依赖。

**LLMPerf —— 已归档，不复用。**
"负载 + 正确性"双测试理念的源头（GuideLLM/AIPerf 都参考过它）。停维护 + Ray 依赖重 + 指标只到均值级。其正确性校验逻辑（乱码/重复/长度异常检测）和 token 分布合成方法（默认 550/150 输入、150/10 输出）值得移植。

**perftok —— 已验证存在，社区体量极小但技术栈同构。**
轻量 OpenAI 兼容端点基准工具：asyncio + aiohttp + tiktoken + pydantic v2 + click，零重依赖，输出 TTFT/ITL/E2E 的 P50~P99 + 吞吐 + 错误率，README 声称 89 个 pytest 测试。1 star、单人维护，不宜作依赖，但**其架构设计（Semaphore 并发 + 精确 token 分布控制 + 百分位统计管线）正是本工具自研引擎的参考蓝本**。

**vllm-tuner —— Optuna 参数调优模式可借鉴。**
Optuna 贝叶斯优化搜索 `batch_size`/`max_num_batched_tokens`/`max_num_seqs`/`gpu_memory_utilization`/`tensor_parallel_size`，自动监控 GPU、解析 vLLM 日志、YAML 定义多目标权重与搜索空间、输出 Plotly Pareto 报告。单人维护已停更，但"Optuna + YAML 目标权重 + 声明式搜索空间"的设计模式直接可借鉴到本工具的 sweep 模块。

**vTune —— 未验证到。**
GitHub 全站多轮搜索无果（注意与 Intel VTune 无关）。描述最接近的实际项目是 `stocklidevs/vllm-optimizer`（0 star，"local cockpit UI、可重复基准、实验规划"），无法确认即认为该项目不存在或名称有误。

### 1.3 补充：其他相关项目

| 项目 | Stars | License | 定位 |
|------|-------|---------|------|
| [sgl-project/sglang](https://github.com/sgl-project/sglang) 内置 `sglang.bench_serving` | 36,969 | Apache-2.0 | 引擎自带压测模块，OpenAI 兼容端点，TTFT/ITL/TPOT/吞吐+百分位 |
| [modelscope/evalscope](https://github.com/modelscope/evalscope) | 3,519 | Apache-2.0 | 阿里出品，质量评测 + `evalscope perf` 推理压测二合一 |
| [Andyyyy64/whichllm](https://github.com/Andyyyy64/whichllm) | 6,744 | MIT | 面向本地硬件的一键式本地 LLM 性能排名（Ollama/llama.cpp），偏消费级 |
| [sgl-project/genai-bench](https://github.com/sgl-project/genai-bench) | 331 | MIT | SGLang 团队 token 级性能评估，xlsx+png 报告 |
| [kubernetes-sigs/inference-perf](https://github.com/kubernetes-sigs/inference-perf) | 260 | Apache-2.0 | K8s SIG 出品，YAML 配置、constant/poisson/sweep 负载 |
| [huggingface/optimum-benchmark](https://github.com/huggingface/optimum-benchmark) | 340 | Apache-2.0 | HF 多后端基准（PyTorch/ORT/OpenVINO/TensorRT-LLM） |
| [aidatatools/ollama-benchmark](https://github.com/aidatatools/ollama-benchmark) | 396 | MIT | 专测 Ollama 本地模型吞吐 |
| [triton-inference-server/perf_analyzer](https://github.com/triton-inference-server/perf_analyzer)（含 GenAI-Perf） | 163 | BSD-3 | NVIDIA 官方，**已宣布停更，由 AIPerf 取代** |
| [huggingface/inference-benchmarker](https://github.com/huggingface/inference-benchmarker) | 175 | — | HF 推理服务器压测 CLI（TGI 已于 2026-03 归档） |
| openshift-psap/llm-load-test | 59 | MIT | Red Hat PSAP 团队，插件式 YAML 配置（注："IBM llm-load-test"未验证到） |

> 社区规律：专做 LLM 推理性能测试的独立项目大多低于 500 star；500+ 的高星"benchmark"项目多为质量评测或数据集合集。

### 1.4 对"统一 TS 技术栈"的影响

GuideLLM（Python 库）与 AIPerf（Python 工具）无法在本工具的 Node 进程内作为库复用。可行路线：
1. **自研核心引擎**（本 MVP 采用）：Node 原生 fetch/undici 流式请求 + `performance.now()` 计时，等价 perftok 的 Python 栈（asyncio + aiohttp），无跨语言成本；
2. **外部引擎适配器**（roadmap）：以子进程方式编排 GuideLLM/AIPerf 的 CLI，解析其 JSON 产物归一化入库——二者均支持 headless 模式与 JSON 输出，适配层成本低。

**✅ 模块一可复用结论**：GuideLLM 与 AIPerf 是指标口径与负载模型设计的主要复用/对齐对象（Apache-2.0）；自研 Node 引擎以 perftok 为架构蓝本、以 vllm bench 的指标 schema 为数据契约；LLMPerf 的正确性校验、vllm-tuner 的 Optuna 模式作为设计参考移植。
**✅ 推荐方案**：MVP 内置自研 Node 压测引擎（并发扫描 sweep + 全套百分位指标）；v0.2 增加外部引擎适配器（GuideLLM 子进程编排优先）；指标字段命名对齐 `vllm bench serve` 的 JSON 输出，保持生态兼容。

---

## 模块二：参数解释与文档层

### 2.1 各引擎参数元数据的程序化获取路线（已核实）

**vLLM**
- `EngineArgs` 定义于 `vllm/engine/arg_utils.py`（约 138 KB dataclass），字段引用 `vllm/config/` 下约 16 个配置组的类属性。
- 关键机制：`get_kwargs(cls)` 自动从 dataclass 注解推导 argparse kwargs；`EngineArgs.add_cli_args(parser)` 注册带分组标题的参数。
- **最佳提取路线**：构造 `argparse.ArgumentParser()` → 调用 `EngineArgs.add_cli_args(parser)` → 遍历 `parser._actions` 拿 option/help/default/choices。官方文档页（docs.vllm.ai/en/latest/configuration/engine_args/）即由此自动生成，vllm.config 类是 types/defaults/docstrings 的 source of truth。
- `SamplingParams`（dataclass）实测字段：temperature(1.0)、top_p(1.0)、top_k(0)、min_p、max_tokens(16)、n、presence_penalty、frequency_penalty、repetition_penalty、seed、stop、ignore_eos、logit_bias、structured_outputs、logprobs 等。
- 运行中服务暴露 `/openapi.json`（FastAPI 自动生成），覆盖请求侧参数但 description 字段偏少。
- **无官方 EngineArgs JSON/YAML schema**，需自行反射生成。

**Ollama**
- 官方文档 `docs.ollama.com/modelfile` 的 PARAMETER 表（11 个）：`num_ctx(2048)`、`repeat_last_n(64)`、`repeat_penalty`、`temperature(0.8)`、`seed(0)`、`stop`、`num_predict(-1)`、`draft_num_predict`、`top_k(40)`、`top_p(0.9)`、`min_p(0.0)`。
- ⚠️ **文档表已被精简**：`mirostat/mirostat_eta/mirostat_tau`、`num_gpu`、`main_gpu`、`num_thread`、`num_keep`、`num_batch` 等运行时仍接受（官方 api.md 示例可见）但不在此表——参数浏览器需按"文档表 + 引擎实际接受值"两层处理。
- `/api/generate` 与 `/api/chat` 均经 `options` 对象透传全部参数；`/api/show` 可查模型已设参数。

**llama.cpp（llama-server）**
- `tools/server/README.md` 本身是高度结构化的 markdown 表格（Common/Sampling/Server params 分节，`| --flag | 说明+默认值+(env: LLAMA_ARG_*) |`），机器可解析性好；真正的 source of truth 是 `common/arg.cpp`。
- Sampling 参数丰富度最高：temp/top-k/top-p/min-p/typical/xtc/dry/mirostat/dynatemp/adaptive-p/samplers 等，含 vLLM/Ollama 没有的采样器。
- 内置 React+TS 的 WebUI（`tools/ui`，`--ui/--no-ui` 控制）；server 暴露 OpenAI 兼容 + Anthropic 兼容 API 及 `/props`、`/slots`、`/metrics`。

**TGI（text-generation-inference）**
- ⚠️ **仓库已归档**（10,880 stars，Apache-2.0，最后推送 2026-03-21），新工具应将其标注为"遗留/只读"。
- 文档仍在线：huggingface.co/docs/text-generation-inference/reference/launcher 是 `text-generation-launcher` 的完整 CLI 参考，每参数含 flag/英文说明/`[env: XXX]`/`[default: ...]`/possible values，格式规整**可直接解析为结构化数据**。

### 2.2 跨引擎参数 registry 现状

多轮搜索（"vllm parameters json schema"、"llm inference engine parameters yaml"、"parameter mapping across vllm llama.cpp ollama" 等）**未找到任何把各引擎参数统一结构化为 JSON/YAML（含参数名/类型/默认值/描述/引擎归属）的开源项目。这是确证的空白地带，自建 registry 即是本工具的核心差异化资产。**

可直接复用的结构化源：
- **OpenAI**: [openai/openai-openapi](https://github.com/openai/openai-openapi)（持续更新）——temperature/top_p/n/stop/seed/response_format 等请求参数带英文描述，可作"OpenAI 兼容公共子集"的元数据基线；
- **LiteLLM**: 最接近"跨 provider 参数翻译层"的项目，其 provider params 文档可当映射参考（面向请求路由而非引擎启动参数）。

建议架构（本工具已采用）：自维护 YAML registry（`engine → 参数: {flag/api 字段, 类型, 默认值, 取值范围, 英文描述, 中文描述, 分类, 引擎归属, 兼容子集标记}`），英文名/类型/默认值用各引擎的程序化通道自动生成，中文描述自译 + 人工审核。

### 2.3 中文参数解释资源

| 资源 | URL | 可复用性 |
|------|-----|---------|
| vLLM 中文站（HyperAI） | [vllm.hyper.ai](https://vllm.hyper.ai/docs/)（源码 [hyperai/vllm-cn](https://github.com/hyperai/vllm-cn)） | 目前最完整的 vLLM 中文翻译，可作中文描述底稿（Apache-2.0 可衍生翻译；注意与上游版本滞后） |
| 华为 MindIE 官方文档 | [hiascend.com/document](https://www.hiascend.com/document) | 中文权威的引擎级参数表（ServerConfig/BackendConfig/AdvancedParameters）；动态渲染抓取受限，可人工摘录；含 NPU 特有注意事项需甄别 |
| vLLM Semantic Router 翻译指南 | [vllm-sr.ai](https://vllm-sr.ai/docs/community/translation-guide) | 中文技术翻译规范（术语表、命令/配置键保持英文），对建立双语术语表有参考价值 |
| Ollama / llama.cpp 中文文档 | — | 未验证到权威官方级中文站，建议自译（两者英文原文简短，工作量可控） |

### 2.4 参数分类体系

调研未发现现成的标准化参数本体（ontology）。本工具采用社区通行的五分类（各引擎文档的自然分组与此高度吻合）：

1. **sampling 生成控制**：temperature、top_p、top_k、min_p、repetition_penalty、max_tokens、seed、stop…
2. **scheduler 调度与批处理**：max_num_seqs、max_num_batched_tokens、scheduler_policy…
3. **memory-parallel 显存与并行**：gpu_memory_utilization、tensor_parallel_size、pipeline_parallel_size、kv_cache_dtype、swap_space…
4. **quantization 量化**：quantization、dtype、load_format…
5. **server 服务**：host、port、api_key、served_model_name、ctx_size（llama.cpp）、parallel…

**✅ 模块二可复用结论**：各引擎参数元数据均可程序化获取（vLLM argparse 反射最完整；llama.cpp/TGI 解析文档表格；Ollama 解析 markdown + 运行时双层标注）；跨引擎统一 registry 是已确证的空白，中文语料 vLLM 部分可直接复用 hyperai/vllm-cn。
**✅ 推荐方案**：`registry/engines/*.yaml` 手工策划首批 + 脚本辅助刷新英文元数据；`registry/openai-compat.yaml` 维护公共子集映射；中文描述随英文上游版本定期同步（标注 source 版本）。

---

## 模块三：国际化（i18n）方案层

### 3.1 i18n 框架对比

| 方案 | Stars | License | 周下载量 | Bundle (gzip) | ICU 复数 | 类型安全 | Key 提取工具 | 结论 |
|---|---|---|---|---|---|---|---|---|
| **react-i18next** | 10,051（i18next 8,641） | MIT | i18next 2,369 万 | ~24KB 合计 | 内置 PluralRules（中英场景足够） | 强（TS 模板字面量推导嵌套 key） | i18next-parser（周下载 54.9 万） | **首选** |
| LinguiJS | 5,908 | MIT | 168 万（core） | ~5-10KB（最小） | 完整 ICU | 强（编译宏） | 内置 @lingui/cli | 次选（资源为编译产物，与 Weblate 协作需 .po 中间格式） |
| vue-i18n | 2,713（monorepo） | MIT | 371 万 | ~21KB | 内置复数 | 强 | vue-i18n-extract | Vue 路线唯一成熟选择（本工具未采用） |
| next-intl | 4,375 | MIT | 712 万 | ~16KB | 完整 ICU | 强 | 无官方提取器 | **排除**（仅 Next.js） |
| react-intl/FormatJS | 14,740（monorepo） | BSD-3 | 322 万 | ~15KB | 完整 ICU（标杆） | 弱（裸 string key） | @formatjs/cli | 被 i18next/Lingui 在 DX 上取代 |

**结论：react-i18next**。理由：① i18next-parser 扫描提取 → i18n Ally 插件（104.6 万安装）实时预览/缺失检测 → Weblate 对 i18next JSON 一等公民，整条翻译链路零胶水代码；② `i18n.changeLanguage()` 运行时热切换 + `useTranslation` 响应式重渲染，一键中英切换最省事；③ 中英双语文档型内容对完整 ICU 无需求；④ 社区最大（生态周下载 4,000 万+）。

### 3.2 Tooltip 组件

| 方案 | Bundle | WAI-ARIA 键盘可访问 | 富文本 | 评估 |
|---|---|---|---|---|
| **shadcn/ui Tooltip（底层 Radix）** | 代码复制进仓库（Radix ~18KB） | **原生符合**（hover+focus 双触发、Esc 关闭、aria-describedby） | 完全可控 | **首选** |
| Radix UI Tooltip | ~18KB | 原生符合 | ReactNode | 同上（无样式版） |
| Floating UI | ~6KB | 无，需自建 a11y | 无组件概念 | 定位引擎底座，非成品 |
| Tippy.js | ~9KB | 较好 | 支持 HTML | **维护停滞（2024-05），排除** |
| Ant Design Tooltip | 全量 445KB gzip | 好 | 好 | 引入整个 antd 体系，对 Tailwind 项目过重 |

**结论：shadcn/ui 风格 Tooltip（Radix 底层）**。参数旁"?"图标是高频、结构化的富文本 tooltip（标题+描述+类型+默认值+取值范围，双语），复制式组件直接写 JSX 富文本、改样式零成本，a11y 已由 Radix 处理。

### 3.3 翻译管理与工具链

- **Weblate**：GPLv3+，自托管免费；**hosted.weblate.org 对满足条件的开源项目免费**（Libre plan，需公开仓库 + OSI 认可许可证）；GitHub OAuth + Webhook 集成，可配置翻译完成后自动 push 或自动开 PR。
- **fastapi-rosetta**：真实存在（PyPI 0.1.4）但基于 gettext(.po) 路线且成熟度低——与本工具的 i18next JSON 路线不匹配，不采用。
- **Intlayer**：Apache-2.0，per-component 内容声明 + AI 翻译 + `content test` 缺失检测；生态尚小。可借鉴其 CI 缺失检测思路。
- **i18next-parser**（周下载 54.9 万）：扫描源码提取 key、与现有 JSON 合并、不覆盖已有译文，可配 GitHub Action。
- **i18n Ally**（VSCode，104.6 万安装）：行内注解、hover 预览、缺失/未使用 key 检测。

**关键设计决策（本工具已采用）**：
- 翻译文件：**JSON**（嵌套命名空间，按语言一份），i18next/i18n Ally/parser/Weblate 全链路支持最好；
- key 结构：`params.<engine>.<param>.<field>`（如 `params.vllm.max_num_seqs.description`）——**与 registry schema 结构对齐，可由 registry 程序化生成资源文件骨架**，新增参数时翻译条目自动出现，不会漏；
- 缺失 key 三层防线：CI 中 i18next-parser 同步新 key → i18next `saveMissing`/`missingKeyHandler` 运行时上报 → 对比脚本（代码 key 集合 vs 资源 key 集合 vs registry key 集合）作 CI 门禁。

**✅ 模块三可复用结论**：react-i18next + shadcn/Radix Tooltip + i18next-parser + i18n Ally + Weblate 的组合是零胶水的成熟链路，全部 MIT/Apache 兼容。
**✅ 推荐方案**：locales JSON 由 registry 生成骨架；接 Weblate Libre plan 做社区翻译协作；CI 加 key 一致性门禁。

---

## 模块四：GUI 与可视化层

### 4.1 现有 benchmark 可视化项目盘点

- **NVIDIA AIPerf**：CLI 为主，3 种 UI 模式（实时 TUI / 进度条 / headless），`aiperf plot` 出 PNG，集成 MLflow/OTel/W&B/DCGM。**无 Web UI、无 HTML 报告**——正是本工具的定位空间。
- **vLLM**：历史 `benchmarks/plot.py` 从结果 JSON 画 TTFT/ITL 箱线图；官方 Performance Dashboard 用于跟踪回归。**可复用的是其结果 JSON 指标 schema**（建议本工具指标面板直接对齐该字段集）。
- **Grafana**：有现成 "vLLM Serving Overview" 社区 dashboard，适合在线监控（Prometheus），不适合离线参数扫描报告的交付形态。
- **ModelSweep**（Ollama 专用，19★ 停更）：测试套件/雷达图/Elo 的 GUI 形态是好的 UX 参考。
- **结论：可复用的主要是数据契约与布局灵感；"参数扫描 → 交互式 HTML 报告"这一层目前生态空白，自建合理。**

### 4.2 前端框架权衡（Streamlit/Gradio vs React/Vue）

| 维度 | Streamlit (45.9k★)/Gradio (~37k★) | React+Vite / Vue3 |
|---|---|---|
| 上手速度 | 极快 | 需前端工程（Vite 模板成本已很低） |
| 精细 Tooltip | **弱**（Streamlit tooltip 仅原始值） | 强（Radix 任意富文本 + a11y） |
| 深度 i18n | **基本无框架支持** | 成熟（响应式一键切换） |
| 图表自由度 | 受组件封装限制 | 全量自定义 |
| 交互模型 | 脚本重跑，参数多时体验差 | SPA 即时响应，适合"调参数→看帮助→跑测试"流 |

本需求的三大核心——参数级富文本双语 tooltip、深度 i18n、丰富图表——恰好是 Streamlit/Gradio 的三大短板；Gradio 只适合内测 MVP。

### 4.3 图表库对比

| 库 | Stars | License | Bundle (gzip) | 雷达图 | 热力图 | 中文文档 |
|---|---|---|---|---|---|---|
| **ECharts** | 67,470 | Apache-2.0 | ~359KB 全量（按需 ~150-200KB） | ✅ 原生 | ✅ 原生 | **一流（官方中文）** |
| Recharts | 27,621 | MIT | ~148KB | ✅ | ❌ 需变通 | 少 |
| Plotly.js | 18,354 | MIT | ~1MB | ✅ | ✅ | 弱 |
| Chart.js | 67,732 | MIT | ~67KB | ✅ | ❌ 需插件 | 一般 |

**结论：ECharts**——唯一四类图（雷达多模型对比 / 折线参数扫描曲线 / 柱状吞吐对比 / 并发×延迟热力图）全部原生内置，中英双语文档、dataZoom、visualMap、暗色主题、SSR 导出 PNG 都齐。

### 4.4 可借鉴的 benchmark HTML 报告

- **Locust**：`--html` 单文件自包含报告（Charts/Statistics/Errors 标签页，ECharts 渲染）——单文件形态与布局最值得借鉴；
- **k6**：Web dashboard + 单文件 HTML 导出，含**阈值（threshold）通过/失败徽章**设计，适合"参数达标判定"；
- **Allure**：测试报告的趋势图/分组视图风格。
- 建议：不整站复用（指标域不同），借鉴结构——单文件自包含 HTML（内联 JS/CSS + 结果 JSON）+ 汇总表 + 图表 + 阈值徽章 + 暗色主题。

**✅ 模块四可复用结论**：React+Vite+TS+Tailwind+shadcn/ui+ECharts + Node(Fastify) 后端的组合覆盖全部需求；报告形态借鉴 Locust/k6 单文件自包含 HTML；数据契约对齐 vllm bench / AIPerf 的 JSON schema。
**✅ 推荐方案**：MVP 实现参数浏览器（tooltip）、压测台（表单+进度+指标卡片）、结果对比（柱状/折线/热力图）三页 + `/api/bench/results/:id/report` 单文件 HTML 报告；雷达图（模型对比）与阈值徽章列入 roadmap。

---

## 模块五：项目评估总表（统一模板）

对全部已验证候选项目按统一模板汇总（★=重点）：

| 项目 | 功能覆盖 | 支持引擎 | 指标完整度 | 可复用程度 | License | 社区活跃度 | 集成难度 | 差异化空间（本工具可新增） |
|------|---------|---------|-----------|-----------|---------|-----------|---------|--------------------------|
| ★ GuideLLM | 性能测试 + 流量模型 | OpenAI-compat/vLLM 原生/in-process | 全套百分位 | 外部编排（v0.2 适配器） | Apache-2.0 | 1.7k★，周更 | 中 | Web GUI、参数解释、双语 |
| ★ AIPerf | 性能测试 + GPU 遥测 | OpenAI-compat（vLLM/TGI/Ollama 教程） | 最全 + DCGM | 外部编排 + GPU 指标源 | Apache-2.0 | 766★，活跃 | 中 | 同上 |
| ★ vllm bench serve/sweep | 性能测试 + sweep 编排 | OpenAI-compat（serve）/ vLLM（sweep） | 最全（serve） | 设计借鉴（sweep/Pareto） | Apache-2.0 | 93.5k★ | 高（依赖重） | 轻量化、GUI 化、多引擎 |
| LLMPerf | 负载 + 正确性 | 多云 API | 均值级 | 思路借鉴（校验逻辑） | Apache-2.0 | 已归档 | — | 正确性校验集成 |
| perftok | 轻量性能测试 | OpenAI-compat | 全套百分位 | 参考实现（架构蓝本） | Apache-2.0 | 1★ | — | GUI、参数浏览器 |
| vllm-tuner | 参数调优（Optuna） | vLLM | 间接 | 思路借鉴（搜索空间声明式） | MIT | 66★ 停更 | — | 引擎无关的 sweep + GUI |
| ★ promptfoo | 质量评估 + 红队 | 几乎全部 provider | 质量维度 | 可选外部集成 | MIT | 25.9k★，日更 | 低 | 性能×质量统一视图 |
| ★ DeepEval | 质量评估（pytest 风格） | 任意模型 | 质量维度 | 可选外部集成 | Apache-2.0 | 18.7k★ 活跃 | 低 | 同上 |
| Harbor | Agent 容器化评测 | 任意模型 + 9 沙箱 | 任务级 | 架构参考（job/runout 抽象） | Apache-2.0 | 6k★ 活跃 | 高 | — |
| JudgeArena | LLM-judge 基准统一 | LangChain 任意模型 | 质量维度 | 观察项（19★） | Apache-2.0 | 19★ 新项目 | — | — |
| OpenJudge | 输出质量评判（Streamlit UI） | 评测对象为 AI 应用 | 质量维度 | 观察项 | Apache-2.0 | 871★ 活跃 | — | — |
| llm-benchmark-toolkit | 质量评测 + Dashboard | OpenAI/Anthropic/Ollama/HF | 质量维度 | 对标对象（2★，无 LICENSE 文件） | 声明 MIT | 极低 | — | 可信度与活跃度 |
| ModelSweep | Ollama 评估工作台 | 仅 Ollama | 质量维度 | UX 参考（雷达图/Elo） | MIT | 19★ 停更 | — | 多引擎支持 |
| microeval | 轻量评估 CLI+WebUI | Ollama/OpenAI/Bedrock/Groq | 质量维度 | 最小实现参考（3★） | MIT | 极低 | — | — |
| evalscope | 质量评测 + perf 压测 | OpenAI-compat | 两者兼有 | 潜在竞品/参照 | Apache-2.0 | 3.5k★ | 中 | 参数解释层、双语、registry |
| whichllm | 本地硬件性能排名 | Ollama/llama.cpp | 基础 | 消费级参照 | MIT | 6.7k★ | — | 专业指标深度 |

---

## 模块六：差异化差距分析（已有工作 vs 本工具）

### 6.1 可以直接复用（依赖库方式）

| 依赖 | 用途 |
|------|------|
| react-i18next / i18next / i18next-parser | 前端 i18n 全链路（MIT） |
| Radix UI（shadcn/ui 风格封装） | "?" 参数 tooltip 的 a11y 底座（MIT） |
| ECharts | 雷达/折线/柱状/热力图（Apache-2.0） |
| Fastify + @fastify/static + zod + js-yaml | Node 后端与 registry 加载（MIT） |
| js-tiktoken / gpt-tokenizer | token 计数（MIT/Apache 兼容） |
| Weblate Libre plan | 社区翻译协作（开源免费） |

### 6.2 需要借鉴现有实现但自行开发

| 模块 | 借鉴来源 | 自研内容 |
|------|---------|---------|
| 压测引擎 | perftok（架构蓝本）、GuideLLM/AIPerf（指标口径与负载模型）、vllm bench（数据契约） | Node 流式压测核心：SSE 计时、并发模型、百分位统计管线 |
| 并发扫描 sweep | vllm bench sweep（参数矩阵 JSON + 生命周期管理 + Pareto 图）、vllm-tuner（声明式搜索空间 + Optuna 模式） | 引擎无关的 sweep 编排器 + 结果归一化 schema |
| 报告生成 | Locust（单文件自包含 HTML）、k6（阈值徽章） | LLM 指标域的交互式报告模板 |
| 正确性校验 | LLMPerf（乱码/重复/长度异常检测） | 内置 sanity checks |
| 质量评估集成 | promptfoo/DeepEval（MIT/Apache，可选外挂） | 统一 GUI 的集成适配层（roadmap） |

### 6.3 现有工具均未覆盖的空白地带（已逐一核实）

1. **跨引擎统一参数 registry**：无任何开源项目将 vLLM/Ollama/llama.cpp/TGI 参数结构化为带描述的 JSON/YAML——本工具的 `registry/` 直接填补；
2. **参数浏览器 + 中英双语 tooltip**：无先例。现有工具的参数帮助至多是 CLI --help 或文档链接；
3. **多引擎统一 Web GUI**：GuideLLM/AIPerf/vllm bench 均 CLI 优先；ModelSweep 仅 Ollama 且停更；
4. **参数扫描 → 交互式 HTML 报告**：vllm bench sweep 只出静态 Pareto 图；AIPerf 无 HTML 报告；
5. **中英双语的 LLM 基准工具 UI**：无先例（中文用户需自行啃英文文档）。

### 6.4 本工具的核心差异化价值主张

> **llm-windtunnel：参数可解释的多引擎推理测试工作台。**
> 像风洞测试发动机一样测试 LLM 推理引擎——一个工作台覆盖 vLLM / Ollama / llama.cpp / TGI / 任意 OpenAI 兼容端点的 TTFT / ITL / TPOT / 吞吐 / 延迟百分位测试，每个参数都有中英双语的"是什么、为什么、调多少"悬停解释，参数扫描结果一键生成交互式报告。

差异化金字塔（由底至上）：
1. **数据层**：跨引擎参数 registry（空白①，双语元数据）；
2. **引擎层**：内置 Node 压测引擎 + 外部引擎适配器路线（GuideLLM/AIPerf）；
3. **表现层**：双语参数浏览器 + 压测台 + 扫描可视化（空白②③④⑤）；
4. **生态层**：对齐 vllm bench 数据契约、Weblate 社区翻译、Apache-2.0。

### 6.5 风险与对策

| 风险 | 对策 |
|------|------|
| GuideLLM/AIPerf 迭代快，外部适配器可能频繁失效 | 适配器隔离在独立模块，锁定版本 + JSON 产物兼容层 |
| 参数文档随引擎版本漂移（Ollama 已出现文档精简） | registry 字段标注 source 版本；CI 定期 diff |
| TGI 已归档 | 标注 archived，仅保留文档级支持 |
| 自研引擎与 vllm bench 口径偏差 | 指标定义严格对齐其 JSON schema，提供对拍用例 |

---

## 附：调研中证伪/存疑的条目

| 条目 | 结论 |
|------|------|
| "vTune"（vLLM 配置实验工具） | **未验证到**，GitHub 全站搜索无果，疑似不存在或名称有误 |
| "IBM 的 llm-load-test" | 未验证到；实际存在的是 Red Hat OpenShift PSAP 团队的同名项目 |
| llm-benchmark-toolkit | 实际 GitHub 名为 NahuelGiudizi/llm-evaluation（PyPI 名 llm-benchmark-toolkit），2★ 且仓库缺 LICENSE 文件 |
| FastAPI Rosetta | 存在（PyPI 0.1.4）但基于 .po 路线，与本工具 i18next JSON 路线不匹配 |
| TGI 活跃维护 | **已归档**（2026-03），文档仍在线 |
| GenAI-Perf | 已宣布停更，由 AIPerf 取代 |
