# MorphFlow 图片与视频提示词调研

更新时间：2026-08-10
范围：参考图编辑、图生视频、首尾帧视频、VLM 导演。本文区分官方事实与 MorphFlow 的产品推论，不把模型输出当作质量保证。

## 结论

MorphFlow 之前的图片优化和视频导演各只有一段通用短提示词，尚不能算“深度调研过”。本轮将它们升级为基于真实参考图的 VLM 工作流，并将不同任务拆成明确策略：

- 图片编辑：先理解参考图，再约束“必须保留、明确改变、禁止改变、比例不变”。
- 图生视频：只描述相对输入画面发生的变化，避免错误复述既有外观导致身份漂移或切镜。
- 首尾帧视频：把 A 到 B 写成按时间推进的连续微动作，结尾稳定抵达 B。
- 所有视频：动作复杂度与时长匹配；镜头、光线、声音只在用户要求或模式支持时加入。
- 提示词不堆砌所谓“8K、杰作、极致”等空泛词；优先使用可观察、可定位、可执行的描述。

这套规则可以保证“提示词生成流程有约束、有真实视觉输入、可审查”，但无法保证第三方生成模型每次都产出完美结果。后续仍需用真实样本建立回归集，测量身份连续性、构图保持、终帧吻合和指令遵循。

## 资料与判断

### LibTV

- [libtv-labs/libtv-skills](https://github.com/libtv-labs/libtv-skills) 是 MIT 许可的公开 Agent Skill，公开说明要求客户端不要重写用户提示词，而是把原始意图和参考素材 URL 交给 LibTV Backend Agent，由后端负责模型选择、工作流与提示词工程。
- [公开 SKILL.md](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md?plain=1) 没有公开 LibTV 后端内部的图片/视频系统提示词。因此，MorphFlow 可以借鉴“集中式导演层”的职责边界，但不能声称复制了 LibTV 的内部优秀提示词。
- 产品推论：MorphFlow 的 Gemini VLM 导演应当是唯一的提示词增强层；界面提交用户原始意图、模型能力、时长、音频开关和按顺序排列的参考图，由导演输出可编辑的最终提示词。

### GPT Image 2

- [OpenAI Image generation guide](https://developers.openai.com/api/docs/guides/image-generation) 说明 GPT Image 2 支持任意分辨率，但最长边不得超过 3840，两边必须是 16 的倍数，宽高比不超过 3:1，总像素在 655,360 到 8,294,400 之间。
- 同一文档说明 `gpt-image-2` 的输入保真度始终为 high，不需要额外传 input fidelity。
- 产品推论：第一张已选参考图作为比例基准；默认将最长边映射为 2048，另一边就近对齐到 16 的倍数。超出 3:1 或尚未读到尺寸时使用 `auto`，并允许用户显式覆盖。
- 提示词合同：必须保留的身份/构图/物件 → 明确变化及空间位置 → 材质/光线/颜色 → 禁止变化。多图按“参考图 1/2…”分配用途。

### Kling / 可灵

- [可灵 AI 官方提示词指南（快手文档）](https://docs.qingque.cn/d/home/eZQDKi7uTmtUr3iXnALzw6vxp) 给出的基础结构是“主体（主体描述）+ 运动 + 场景（场景描述）”，并可加入镜头语言、光影和氛围；短视频的运动复杂度应与时长匹配。
- 产品推论：Kling 模式优先组织主体动作、环境响应、镜头运动和光线变化，不在 5 秒镜头里塞入多个不连续事件。

### LTX-2

- [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2) 的官方说明建议使用详细、按时间顺序、字面化的动作描述，并明确镜头与光线，提示词控制在 200 词以内。
- [LTX 官方 I2V system prompt](https://github.com/Lightricks/ComfyUI-LTXVideo/blob/master/system_prompts/gemma_i2v_system_prompt.txt) 强调图生视频只补充相对输入图的变化，不重复图中已经确定的视觉细节；不准确的复述可能造成突然切镜。动作应使用主动动词并按时间展开。
- 产品推论：MorphFlow 的通用 I2V 策略采用“变化优先”而不是重新描述整张图片；这对所有接入的视频 Provider 都是较安全的共同基线。

### HunyuanVideo 1.5

- [Tencent-Hunyuan/HunyuanVideo-1.5](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5) 提供官方提示词手册和 rewrite 实现。
- [I2V rewrite prompt](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/main/hyvideo/utils/rewrite/i2v_prompt.py) 使用标准镜头语言、按时间展开的微动作、客观空间方向和明确指代，并要求克制扩写：用户没写的镜头、光线、动作不应擅自补全。
- [英文 Prompt Handbook](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/main/assets/HunyuanVideo_1_5_Prompt_Handbook_EN.md) 提供运镜、运动和构图词汇参考。
- 其代码采用 Tencent Hunyuan Community License；MorphFlow 只提炼公开方法，不复制官方系统提示词原文。

### 视觉上下文增强

- [Hunyuan PromptEnhancer](https://github.com/Hunyuan-PromptEnhancer/PromptEnhancer) 面向文生图与图片编辑指令增强，强调结合视觉上下文、保持用户意图和失败回退。
- 产品推论：图片提示词优化必须把用户选中的真实图片一并交给 VLM。只对文本做“优美词汇润色”会丢失主体、构图和空间约束，不适合作为主流程。

## MorphFlow 的模型适配合同

| 模式 | 必须输入 | 导演重点 | 必须避免 |
| --- | --- | --- | --- |
| 参考图编辑 | 用户意图、参考图、原图比例 | 保留项、改变项、空间/材质/光线、禁止项 | 比例漂移、身份漂移、无关元素、质量词堆砌 |
| 单图生视频 | 用户意图、首帧、时长、模型能力 | 相对变化、时间顺序、主体/环境/镜头运动 | 复述既有外观、突然切镜、超出时长的复杂动作 |
| 首尾帧视频 | 用户意图、A、B、时长、模型能力 | 连续 A→B 阶段、终点稳定吻合 B | 中途换主体、空间跳跃、没落到 B |
| 含音频视频 | 上述输入、audio=true | 在实际发生时间点写声音事件 | 独立音频清单、无依据的对白 |
| 静音视频 | 上述输入、audio=false | 纯视觉动作 | 声音、对白、配乐、音效 |

## 质量门槛与下一步

1. 每次优化结果都保留为可编辑文本，不自动覆盖用户原始意图。
2. 付费优化和生成均在调用前明确确认；不得用 mock 结果冒充真实结果。
3. 建立至少 20 组内部样本：人物连续、产品材质、复杂特效、横/竖/方图、A→B 转场各覆盖。
4. 对每组记录原始意图、导演提示词、Provider、参数和结果，人工按身份、构图、运动连续、尾帧吻合、指令遵循五项评分。
5. 只有经过这些真实测试，才能把某个模型策略从“文档支持”提升为“已验证”。

资料访问日期均为 2026-08-10。
