/**
 * 前端页面操作工具注册中心（Frontend Action Registry）
 *
 * 页面组件在挂载时注册自身支持的操作，卸载时注销。智能体只能调用当前页面
 * 实际注册、且当前用户有权限的操作。安全边界：
 * - 不提供任意 JS 执行 / 任意接口请求 / 任意 DOM 操作；
 * - 每个操作声明 riskLevel 与 requireConfirmation，high 风险由调用方在执行前二次确认；
 * - 操作实现必须调用页面现有方法，不复制业务逻辑。
 */
import { reactive } from 'vue'

/** 操作风险等级 */
export type ActionRiskLevel = 'low' | 'medium' | 'high'

/** 操作执行结果（统一回传给智能体） */
export interface ActionResult<TData = unknown> {
  /** 是否成功 */
  success: boolean
  /** 操作名称 */
  action: string
  /** 人类可读的结果说明 */
  message: string
  /** 结构化结果数据 */
  data?: TData
}

/** 前端操作定义 */
export interface FrontendAction<TArgs = Record<string, unknown>, TData = unknown> {
  /** 操作名称（与后端 Agent 约定一致，如 ui.search / department.delete） */
  name: string
  /** 操作描述（供模型理解用途） */
  description: string
  /** 参数 JSON Schema（供模型生成参数） */
  parameters: Record<string, unknown>
  /** 所需权限点；为空表示无需权限 */
  permission?: string
  /** 风险等级 */
  riskLevel: ActionRiskLevel
  /** 是否需要用户二次确认（high 风险应为 true） */
  requireConfirmation: boolean
  /** 执行处理器：接收参数，返回执行结果 */
  execute: (args: TArgs) => Promise<ActionResult<TData>> | ActionResult<TData>
}

/** 注册表：name -> action（reactive 以便工具列表随注册/注销响应式更新） */
const registry = reactive(new Map<string, FrontendAction>())

/**
 * 注册一个前端操作（同名覆盖）。
 * @param action 操作定义
 * @returns 注销函数
 */
export function registerAction(action: FrontendAction): () => void {
  registry.set(action.name, action as FrontendAction)
  return () => {
    // 仅当当前注册的仍是本次实例时才删除，避免误删同名新实例
    if (registry.get(action.name) === action) registry.delete(action.name)
  }
}

/**
 * 批量注册操作。
 * @param actions 操作定义数组
 * @returns 一次性注销全部的函数
 */
export function registerActions(actions: FrontendAction[]): () => void {
  const disposers = actions.map((a) => registerAction(a))
  return () => disposers.forEach((d) => d())
}

/** 清空注册表（页面切换兜底，避免残留上个页面的操作） */
export function clearActions(): void {
  registry.clear()
}

/** 按名称获取操作 */
export function getAction(name: string): FrontendAction | undefined {
  return registry.get(name)
}

/**
 * 列出当前用户有权限的操作（无 permission 声明的一律可见）。
 * @param permissions 当前用户权限点集合
 */
export function listAllowedActions(permissions: string[]): FrontendAction[] {
  const permSet = new Set(permissions)
  return Array.from(registry.values()).filter(
    (a) => !a.permission || permSet.has(a.permission)
  )
}

/**
 * 转为 AG-UI 工具定义（随请求 forwardedProps 传给后端 → 模型）。
 * 仅暴露有权限的操作，实现"无权限则不向模型注册该工具"。
 * @param permissions 当前用户权限点集合
 */
export function toToolDefinitions(
  permissions: string[]
): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
  return listAllowedActions(permissions).map((a) => ({
    // 工具名转为合法标识符：OpenAI/DeepSeek 要求 function name 匹配 ^[a-zA-Z0-9_-]{1,64}$，
    // 点号非法，故 registry 里的点号名（ui.search）在传给模型时映射为 ui__search。
    name: toWireName(a.name),
    description: a.description,
    // 深拷贝为纯对象：registry 是 reactive Map，直接透传 reactive 代理会在
    // HttpAgent 的 structuredClone 处抛 DataCloneError（parameters 是 JSON Schema，可安全序列化）
    parameters: JSON.parse(JSON.stringify(a.parameters)) as Record<string, unknown>
  }))
}

/** registry 名 → 传给模型的合法名（点号 → 双下划线） */
export function toWireName(name: string): string {
  return name.replace(/\./g, '__')
}

/** 模型返回的工具名 → registry 名（双下划线 → 点号）；再按名查 action */
export function getActionByWireName(wireName: string): FrontendAction | undefined {
  return getAction(wireName.replace(/__/g, '.'))
}
