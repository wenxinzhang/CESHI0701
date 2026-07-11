/**
 * 模型「当前选择」的本机持久化
 *
 * 供应商配置与模型均已落后端数据库，本机仅保存「当前聊天选用哪个模型」这一非敏感偏好，
 * 便于用户下次进入沿用上次选择。绝不在此存储 apiKey 等敏感信息。
 */
import type { CurrentModelSelection } from '@/types/model'

/** 当前选择模型存储键 */
const KEY_CURRENT = 'ai_current_model'

/**
 * 读取当前选择的模型
 * @returns 当前选择（无或解析失败返回 null）
 */
export function loadCurrentSelection(): CurrentModelSelection | null {
  const raw = localStorage.getItem(KEY_CURRENT)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CurrentModelSelection
    // 校验为数字 ID（旧版本可能存过字符串 ID，非法则视为无选择）
    if (typeof parsed?.providerConfigId === 'number' && typeof parsed?.modelId === 'number') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/**
 * 保存当前选择的模型
 * @param selection 当前选择，传 null 表示清除
 */
export function saveCurrentSelection(selection: CurrentModelSelection | null): void {
  if (selection) {
    localStorage.setItem(KEY_CURRENT, JSON.stringify(selection))
  } else {
    localStorage.removeItem(KEY_CURRENT)
  }
}
