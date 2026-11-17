# 模型与系统提示词可配置化 设计

日期：2026-11-17
状态：待评审

## 1. 背景与目标

模型与系统提示词目前以常量硬编码在 [store.ts](../../../src/services/chat/store.ts)：

```ts
const MODEL: ChatModel = 'deepseek-flash'
const SYSTEM_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'
```

目标：

- 模型改为**在设置里维护一份可增删的列表**，列表中的选项出现在聊天输入区的下拉框中，供随时切换
- 系统提示词改为在设置里编辑
- 两者都保留集中管理的代码默认值，未配置时行为与当前一致

## 2. 范围

**纳入**

- 新增 `src/config.ts`：默认模型列表、默认模型、默认系统提示词
- 设置面板新增「模型」列表管理（添加 / 别名 / 删除 / 恢复默认）与「系统提示词」编辑
- 聊天输入区功能区新增模型下拉框，选项来自已配置列表，按别名展示
- API 地址改为运行时可配置，默认值仍由构建配置注入；语音接口固定用默认地址
- 新增「路径前缀」设置（默认 `/anthropic/v1`），聚合网关（one-api / new-api）可改成 `/v1`
- 网关返回 HTML 兜底页时给出可操作的提示，不再把整段 HTML 当作错误信息
- 新增「兼容模式」：按标准 Anthropic 请求体发送（补 `max_tokens`、带 `anthropic-version`、去掉扩展字段），适配按 schema 校验的聚合网关
- 请求体 `model` / `system` 改为读取生效值

**不纳入**

- 构建期环境变量 / `.env` 注入：默认值只走 `config.ts`
- 每会话或每条消息的独立覆盖（作用域为全局）
- 模型能力探测、模型列表拉取、配置随历史导出

## 3. 配置优先级

```
已配置模型列表（localStorage） > config.ts 默认列表
当前选中模型：选中值（若仍在列表中） > 列表首项 > config.ts 默认模型
系统提示词：用户编辑值 > config.ts 默认值
API 地址：设置里的覆盖值 > 构建期注入的默认地址
```

## 4. 代码默认值（新增 `src/config.ts`）

```ts
/** 已配置模型：id 为请求体 model 字段，label 为展示别名（空串时显示 id） */
export type ModelEntry = { id: string; label: string }

/** 默认模型列表：用户未改动设置时使用，也是「恢复默认」的目标 */
export const DEFAULT_MODELS: readonly ModelEntry[] = [
  { id: 'deepseek-flash', label: '' },
  { id: 'deepseek-v4-pro', label: '' },
]

/** 列表为空或选中项失效时的兜底模型 */
export const DEFAULT_MODEL: string = DEFAULT_MODELS[0].id

/** 默认系统提示词：所有生成请求的 system 字段 */
export const DEFAULT_SYSTEM_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'
```

`store.ts` 中两个常量原有的说明性注释（“助手身份说明”等）随定义迁移到此处。

`API 地址` 的默认值不放在这个文件：沿用构建期注入的 `__API_ORIGIN__`（`rspack.config.ts` 的 `apiOrigin`，默认 `https://api.deepseek.com`），设置里的覆盖值优先。语音接口（`/v1/tools`）不使用覆盖值，始终走该默认地址。

`API 路径前缀` 的默认值放在 `config.ts`（`DEFAULT_API_PATH = '/anthropic/v1'`），因为它属于接口约定而不是部署信息。

## 5. 存储与类型

| 项 | 变更 |
| --- | --- |
| `ChatModel` | 由字面量联合放宽为 `string`（保留类型名以缩小改动面），补充注释说明取值由配置决定 |
| `CreateMessageRequest.model` | 随 `ChatModel` 变为 `string`，结构不变 |
| `AssistantMessage.model` | 变为 `string \| null`；`null` 仍表示历史/导入回复未记录模型 |
| 设置状态 | 新增 `models: ModelEntry[] \| null`、`model: string \| null`、`systemPrompt: string \| null` |
| 语义 | `models === null` 表示未改动过列表（用默认列表）；`model === null` 表示用列表首项；`systemPrompt === null` 表示用默认提示词；`entry.label` 为空串表示展示 `id` |
| localStorage 键 | `chat-demo:models`（`[{ id, label }]` 的 JSON 数组）、`chat-demo:model`、`chat-demo:system-prompt` |
| 读取 | JSON 解析失败、非数组或条目缺少字符串 `id` 时按 `null` 处理；`id` / `label` 读入时 `trim()`，空 `id` 丢弃 |
| 写入 | `setModels` 归一化：`id` 去空、按首次出现去重、`label` 一并 `trim`；结果为空则置 `null`。`setModel` / `setSystemPrompt`：`trim` 后为空则删除键并置 `null` |
| 派生读取 | `getModelOptions()` → `models ?? DEFAULT_MODELS`；`getModelLabel(entry)` → `entry.label \|\| entry.id`；`getEffectiveModel()` → 选中值若在选项中则用之，否则取列表首项，列表为空时用 `DEFAULT_MODEL`；`getEffectiveSystemPrompt()` → `systemPrompt ?? DEFAULT_SYSTEM_PROMPT` |
| 联动 | `setModels` 时若当前 `model` 已不在新列表中，将 `model` 置为 `null`（自动回落到首项） |
| API 地址 | 新增 `apiOrigin: string \| null`，键 `chat-demo:api-origin`；读入时校验 http/https、去掉末尾斜杠；`null` 表示未覆盖 |
| 派生读取（续） | `getEffectiveApiOrigin()` → `apiOrigin ?? DEFAULT_API_ORIGIN`；`DEFAULT_API_ORIGIN` 即 `__API_ORIGIN__` |
| 路径前缀 | 新增 `apiPath: string \| null`，键 `chat-demo:api-path`；统一补前导斜杠、去末尾斜杠；`null` 表示未覆盖 |
| 派生读取（再续） | `getEffectiveApiPath()` → `apiPath ?? DEFAULT_API_PATH`；接口基址为 `origin + path` |
| 兼容模式 | 新增 `compatMode: boolean`，键 `chat-demo:compat-mode`，默认 `false` |

`AssistantMessage.model` 不做数据迁移：旧数据为具体模型名或 `null`，两者都兼容。

## 6. 生效点

只改 `store.ts` 中的四处：

| 位置 | 变更 |
| --- | --- |
| `createReply()` | `model: getEffectiveModel()` |
| `streamReply()` 请求体 | `system: getEffectiveSystemPrompt()` |
| `streamReply()` 请求体 | `model: initial.model ?? getEffectiveModel()` |
| `continueReply()` | `model: previous.model ?? getEffectiveModel()` |

`regenerateReply` / `editMessage` / `retryUpload` 经由 `createReply` 或复用已有回复，自动跟随，无需单独修改。

请求地址：`client.ts` 里 `anthropicBaseUrl()` 与 `/models` 调用改为每次取 `getEffectiveApiOrigin()`（原本是模块级常量），因此改地址后下一次请求立即生效；`speech.ts` 的 `/v1/tools` 仍用构建期常量，避免自定义网关不支持语音接口。

语义：

- **模型**按回复记录。已生成的回复续写时沿用其原有 `model`，不会被切换后的模型改写；新建回复使用当时的生效值。
- **系统提示词**不随消息落库，改动对下一次请求立即生效，包括历史会话的后续请求与继续生成。

## 7. UI 设计

### 7.1 设置 → 数据管理 → 模型（列表管理）

位置：「数据管理」中，紧跟 API Key 与 API 地址之后；系统提示词紧随其后。

结构：

```
模型
已配置的模型会出现在输入框旁的下拉框中。
┌ [别名（可选）      ] [deepseek-flash    ] [删除] ┐
┌ [别名（可选）      ] [deepseek-v4-pro   ] [删除] ┐
[ 别名（可选）     ] [ 输入模型名称    ] [添加]
[恢复默认]                                        ← 仅在列表被改动过时显示
```

- 别名与模型名是两个独立输入框，同排显示；别名可空，空时下拉框与列表都显示模型名
- 只剩 1 个时删除按钮禁用，避免出现空列表
- 添加：可同时填别名与模型名，回车或点「添加」提交；成功后清空两个输入
- 改名：非受控输入，失焦或回车时提交（避免输入过程中被归一化裁剪掉空格）；别名与模型名互相独立
- 模型名改成空值或已存在的名称：拒绝提交，输入框回滚为原值，并提示「该模型已存在」
- 被改名的若是当前选中项，选中项跟随新名称，不会被当成「已删除」
- 校验失败提示显示在列表下方（复用 `.error` 样式）
- 「恢复默认」：`models = null`、`model = null`，列表回到 `DEFAULT_MODELS`

### 7.2 聊天输入区的模型下拉

- 位置：输入框下方功能区左侧，作为 `.toggles` 容器的第一个子元素（`深度思考` / `智能搜索` 之前）
- 组件：复用 [Select.tsx](../../../src/components/base/Select.tsx)，选项来自 `getModelOptions()`，展示名为 `getModelLabel()`（别名优先、否则 id），`value` 使用生效模型的 id
- 新增 `align?: 'start' | 'end'` 参数（默认 `'end'` 保持现有调用不变），此处传 `'start'`，菜单向左对齐触发按钮
- 切换即写入 `settings.model` 并立即生效；不中断正在生成的回复
- 窄屏收缩：外面包一层 `.modelSelect`（`flex-shrink: 1`、`min-width: 72px`、`max-width: 150px`，≤767px 时 108px），用后代选择器覆盖其内部按钮的 `min-width` / `height` / `font-size`——比直接给 `Select` 传限制宽度的 `className` 更可靠，避免与 `Select` 自身的 `.trigger` 同等权重竞争。文字超长省略。现有 `ResizeObserver` 会在溢出时自动隐藏两个开关的文字，无需新增逻辑
- 桌面与移动端、欢迎页与会话页共用同一组件，位置一致

### 7.3 设置 → 数据管理 → 系统提示词

- 多行 textarea（`rows=4`，可纵向拉伸，`maxLength=20000`）
- 初始内容为生效值（未配置时即默认提示词原文），让用户始终看到实际发送的内容
- 提交时机：失焦；或弹窗卸载时由 ref 兜底提交一次，避免点关闭按钮丢改动
- 提交规则：`trim()` 后为空 → 回落默认
- 「恢复默认」按钮：仅在已配置时显示，点击后删除键并把文本域恢复为默认内容
- 说明文字：「作为请求的 system 字段，对所有新对话与继续生成生效」

### 7.4 设置 → 数据管理 → API 地址与路径前缀

- 两个单行输入：地址（占位符显示默认地址）、路径前缀（占位符显示 `DEFAULT_API_PATH`），留空即用默认
- 提交时机：失焦或回车；地址只接受 `http:` / `https:` 绝对地址，路径需以 `/` 开头且不含空格
- 地址里若带了路径（含直接粘贴的完整接口地址），提交时把路径移到「路径前缀」，例如 `https://host/v1/messages` → 地址 `https://host` + 路径 `/v1`
- 非法输入不写入，输入框保留原文并在下方提示
- 与默认值相同视为未覆盖，不写入 localStorage；「恢复默认」清空两项
- 说明文字给出默认组合，并注明「语音接口固定用默认地址」
- 网关对未知路径返回 HTML 兜底页时（聚合网关常见），报错文案带上实际请求地址，提示检查地址与路径前缀，而不是把整段 HTML 抛给用户
- 「兼容模式」勾选框：请求体转成标准 Anthropic 协议（`max_tokens` 补 8192、带 `anthropic-version: 2023-06-01`），不发 `thinking` / `tools` / `safety_check` / `title`，`latest_reminder` 正文并入 system 保留日期上下文

### 7.5 文案（i18n）

zh / en 各新增 18 个键：

| key | zh-CN | en-US |
| --- | --- | --- |
| `settingsModel` | 模型 | Model |
| `settingsModelDescription` | 已配置的模型会出现在输入框旁的下拉框中 | Configured models appear in the selector beside the chat input |
| `settingsModelAlias` | 别名 | Alias |
| `settingsModelAliasPlaceholder` | 别名（可选） | Alias (optional) |
| `settingsModelAdd` | 添加 | Add |
| `settingsModelPlaceholder` | 输入模型名称 | Enter a model name |
| `settingsModelDuplicate` | 该模型已存在 | This model is already configured |
| `settingsSystemPrompt` | 系统提示词 | System prompt |
| `settingsSystemPromptDescription` | 作为请求的 system 字段，对所有新对话与继续生成生效 | Sent as the `system` field for new and continued requests |
| `settingsApiOrigin` | API 地址 | API endpoint |
| `settingsApiOriginDescription` | 留空使用默认地址；需以 http:// 或 https:// 开头。仅影响对话与文件接口，语音接口仍用默认地址 | Leave empty to use the default; must start with http:// or https://. Applies to chat and file requests only — speech keeps the default |
| `settingsApiOriginInvalid` | 请输入以 http:// 或 https:// 开头的地址 | Enter an address starting with http:// or https:// |
| `settingsApiPath` | 路径前缀 | Path prefix |
| `settingsApiPathInvalid` | 路径需以 / 开头，且不能包含空格 | Path must start with / and contain no spaces |
| `apiHtmlResponse` | 服务返回了 HTML 页面而不是接口响应，请检查…：{url} | The service returned an HTML page instead of an API response. Check…：{url} |
| `settingsCompatMode` | 兼容模式（标准 Anthropic 请求体） | Compatibility mode (strict Anthropic body) |
| `settingsCompatModeDescription` | 适配 one-api / new-api 这类聚合网关… | For aggregator gateways such as one-api / new-api… |
| `settingsRestoreDefault` | 恢复默认 | Restore default |

删除按钮复用已有的 `delete` 键；模型下拉的 `aria-label` 复用 `settingsModel`。

### 7.6 样式

设置面板复用 `cell` / `label` / `description` / `row`，新增：

| 类 | 用途 |
| --- | --- |
| `.field` | 纵向字段栈（标签 + 控件 + 说明）；API Key 字段一并改用，随后删除原 `.apiKey` |
| `.promptInput` | 多行文本域：边框、圆角、内边距、聚焦品牌色边框 |
| `.fieldActions` | 右对齐操作区，承载「恢复默认」 |
| `.modelList` / `.modelItem` / `.modelField` / `.modelAdd` / `.modelAddInput` | 模型列表、别名与模型名输入、添加行 |

聊天输入区新增 `.modelSelect` 包裹层（限制宽度与 `flex-shrink`）及其内部按钮覆盖（高度 34px、字号 13px、内距适配箭头、省略号），避免与 `Select` 的 `.trigger` 同权重冲突。

顺带一处小整理：`.apiKeyInput` 重命名为 `.textInput`，供 API Key、模型添加输入框共用，避免借用带 API Key 语义的类名。

> 两个组件目录下的 `.module.css.d.ts` 均为手工维护的 `readonly` 类名表，新增或重命名类名必须同步，否则 TypeScript 直接报错。

## 8. 边界与一致性

| 场景 | 行为 |
| --- | --- |
| 删除当前选中的模型 | `model` 置 `null`，下拉自动显示列表首项 |
| 删除到只剩 1 个 | 删除按钮禁用 |
| 添加重复模型 | 不写入，输入框下提示 |
| 手动清掉 localStorage 的 `models` 但保留 `model` | `getModelOptions()` 回退默认列表；选中值不在其中则用首项 |
| 模型名改成已存在的名称 / 空值 | 拒绝提交，输入框回滚原值；重名时提示「该模型已存在」 |
| 改名当前选中的模型 | 选中项跟随新名称，不触发回落 |
| 生成过程中切换模型 | 不影响进行中的请求，下一次请求生效 |
| localStorage 不可用 | 沿用现有 `try/catch`，仅内存生效 |

## 9. 兼容性

| 场景 | 结果 |
| --- | --- |
| 旧用户无新键 | `models` / `model` / `systemPrompt` / `apiOrigin` 均为 `null`，使用默认值，行为不变 |
| 自定义 API 地址 | 仅对话、文件与 `/models` 走覆盖值；语音 `/v1/tools` 仍走构建期默认地址 |
| 已存在的会话与回复 | `model` 字段原样保留；继续生成沿用原模型 |
| 导入的历史回复 | `model` 为 `null`，续写时使用当前生效值（既有逻辑） |
| 历史导出 | 不含配置，格式版本不变 |
| 刷新 / 重新打开 | 列表、选中项、提示词均从 localStorage 恢复 |

## 10. 受影响文件

| 文件 | 变更 |
| --- | --- |
| `src/config.ts` | 新增：`ModelEntry` 类型、默认模型列表（含别名位）、默认模型、默认系统提示词、默认 API 路径前缀 |
| `src/services/api/types.ts` | `ChatModel` 放宽为 `string` |
| `src/services/settings.ts` | 新增四项状态、键、setter 与 `getModelOptions` / `getEffectiveModel` / `getEffectiveSystemPrompt`；新增 `apiOrigin` / `apiPath` / `getEffectiveApiOrigin` / `getEffectiveApiPath` / `isValidApiOrigin` / `isValidApiPath` / `parseApiAddress` 与 `DEFAULT_API_ORIGIN` |
| `src/services/api/client.ts` | 基址改为 `origin + path` 按请求取值；`/models` 校验失败时按路径前缀重试；HTML 响应统一转成 `apiHtmlResponse` 提示；兼容模式下改用标准请求体 |
| `src/services/api/compat.ts` | 新增：`toCompatibleBody`（补 `max_tokens`、去扩展字段、合并 `latest_reminder`）与常量 |
| `src/services/api/speech.ts` | 语音接口继续用构建期 `__API_ORIGIN__`，不跟随设置里的覆盖值 |
| `src/services/chat/store.ts` | 删除两个常量，四处改为读取生效值 |
| `src/components/settings/ChatBehaviorSettings.tsx` | 新增：模型列表管理（别名 + 模型名双输入）、系统提示词编辑 |
| `src/components/settings/ApiOriginSetting.tsx` | 新增：API 地址输入、校验与恢复默认 |
| `src/components/settings/SettingsDialog.tsx` | 三项配置放入「数据管理」，紧跟 API Key |
| `src/components/settings/Settings.module.css` | 新增 `.field` / `.promptInput` / `.fieldActions` / `.modelList` / `.modelItem` / `.modelField` / `.modelAdd` / `.modelAddInput`；删除 `.apiKey`；`.apiKeyInput` → `.textInput` |
| `src/components/settings/Settings.module.css.d.ts` | 同步类名表 |
| `src/components/settings/ApiKeyField.tsx` | 改用 `.field` 与 `.textInput` |
| `src/components/chatInput/ChatInput.tsx` | 功能区左侧加入模型下拉 |
| `src/components/chatInput/ChatInput.module.css` | 新增 `.modelSelect` |
| `src/components/chatInput/ChatInput.module.css.d.ts` | 同步类名表 |
| `src/components/base/Select.tsx` | 新增 `align` 参数（默认 `'end'`） |
| `src/i18n/zh.ts`、`src/i18n/en.ts` | 各新增 16 个键 |
| `README.md`、`README.zh-CN.md` | 说明模型列表、提示词与 API 地址可在设置中配置、默认值来源，以及语音接口不跟随覆盖 |

## 11. 验证

仓库当前没有测试框架，本次不新增，依靠静态检查与手动验证：

1. `pnpm type`、`pnpm lint`、`pnpm build` 全绿
2. `pnpm dev` 手动检查：
   - 设置里添加 `my-model`（同时填别名），输入框旁下拉立即出现该选项
   - 别名与模型名分别编辑：只改别名时下拉显示新别名，只改模型名时请求体随之变化
   - 模型名改成已存在的名称被拒绝并提示，输入框回滚
   - 切换模型发送，请求体 `model` 为该值；改名当前选中项后选中项跟随
   - 删除当前选中的模型，下拉自动切到首项，下一次请求体随之变化
   - 删除到只剩 1 个后删除按钮禁用
   - 「恢复默认」后列表回到两项
   - 修改系统提示词后发送，请求体 `system` 随之变化；点「恢复默认」后回落
   - 填入自建 API 地址后，发送消息与校验 API Key 走新地址；语音朗读仍请求默认地址
   - 聚合网关把地址设为 `https://llm-api.zego.cloud`、路径设为 `/v1` 后能正常发出请求（无密钥时得到 401 而不是 HTML）
   - 路径留默认 `/anthropic/v1` 打聚合网关时，报错文案带实际地址并提示检查路径前缀
   - 勾选「兼容模式」后，请求体含 `max_tokens` 与 `anthropic-version`，不再带 `thinking` / `tools` / `safety_check`，聚合网关返回 200 流式响应
   - 粘贴 `https://host/v1/messages` 提交，地址变成 `https://host`、路径变成 `/v1`
   - 填入非法地址（`abc`、`ftp://x`）或非法路径（`v1`、`/a b`）被拒绝并提示
   - 填默认地址等同未覆盖；「恢复默认」同时清空地址与路径
   - 刷新后配置保留；清除 site data 后回到默认
   - 已生成回复点「继续生成」，`model` 仍为该回复原值
3. 布局：375px 与 320px 宽度下功能行不溢出、开关文字自动收起、下拉文字省略
4. 回归：无新键时请求体与改动前一致（`deepseek-flash` + 原提示词）

## 12. 风险与不做的事

- 功能行空间有限，别名过长依赖省略号与窄屏上限（窄屏 108px），完整名称在设置的列表里可见
- 任意模型名会把服务端 400 直接暴露给用户，错误提示复用现有链路，不做额外引导
- 自定义 API 地址要求服务端允许浏览器跨域（CORS）；上传过的 `file_id` 绑定原地址，换地址后旧附件可能取不到
- 聚合网关（one-api / new-api）多数只实现 Messages / Models，不提供 Files API，附件上传会失败；这类网关的兼容程度不在本仓库控制范围内
- 兼容模式会丢掉联网搜索、链接阅读与思考开关（这些是 Chat Engine 扩展），只会话正文与系统提示词仍完整
- 语音接口不跟随地址覆盖，自建网关想接语音需要改 `src/services/api/speech.ts`
- 系统提示词改动无审计、无长度下限约束，属于本地单机应用的可接受范围
- 全局提示词会立刻影响历史会话的后续请求；若要“会话内固定人格”，需把快照写进 `Session`，属于另一次改动