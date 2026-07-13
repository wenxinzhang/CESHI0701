/**
 * 零依赖行级 diff 工具
 * 基于 LCS（最长公共子序列）动态规划求两侧行的最长公共子序列，再回溯生成 diff 序列，
 * 用于「历史版本内容」与「当前版本内容」的并排对比。
 * 性能护栏：LCS 为 O(m×n) 时间/空间，当任一侧行数超过 LCS_MAX_LINES 时，
 * 降级为「逐行按最长长度对齐」的朴素对比（同位置行相同则 unchanged，不同则输出
 * 一条 removed + 一条 added，多出的行按 added/removed 处理），避免大文本卡死。
 */

/** LCS 降级阈值：任一侧行数超过此值时改用朴素逐行对齐 */
const LCS_MAX_LINES = 2000

/** diff 行类型：unchanged=两侧都有；added=仅新增（右/目标侧有）；removed=仅删除（左/源侧有） */
export type DiffOp = 'unchanged' | 'added' | 'removed'

/** 一条 diff 结果行 */
export interface DiffLine {
  op: DiffOp
  /** 该行文本（不含换行符） */
  text: string
  /** 源侧行号（1 基）；added 行为 null */
  leftNo: number | null
  /** 目标侧行号（1 基）；removed 行为 null */
  rightNo: number | null
}

/**
 * 归一化换行（\r\n、\r 统一为 \n）后按 \n 拆分，保留空行且不 trim 行内容。
 * 空文本视为「零行」而非「一个空行」，避免空↔非空对比时产生误导性的空行 added/removed。
 */
function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/**
 * 计算 oldText → newText 的行级 diff。
 * @param oldText 源文本（左侧/旧版本）
 * @param newText 目标文本（右侧/当前版本）
 * @returns 按显示顺序排列的 diff 行数组
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const left = splitLines(oldText)
  const right = splitLines(newText)
  // 性能护栏：任一侧超阈值降级为朴素逐行对齐
  if (left.length > LCS_MAX_LINES || right.length > LCS_MAX_LINES) {
    return naiveDiff(left, right)
  }
  return lcsDiff(left, right)
}

/** 基于 LCS 动态规划的行级 diff */
function lcsDiff(left: string[], right: string[]): DiffLine[] {
  const m = left.length
  const n = right.length
  // dp[i][j]：left[i..] 与 right[j..] 的 LCS 长度，多留一行一列作边界（全 0）
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  // 回溯生成 diff：i、j 分别为两侧游标，行号在 push 时取 i+1 / j+1
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (left[i] === right[j]) {
      result.push({ op: 'unchanged', text: left[i], leftNo: i + 1, rightNo: j + 1 })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // 优先输出 removed，保证同一处「删除在新增之前」
      result.push({ op: 'removed', text: left[i], leftNo: i + 1, rightNo: null })
      i++
    } else {
      result.push({ op: 'added', text: right[j], leftNo: null, rightNo: j + 1 })
      j++
    }
  }
  // 收尾：剩余左侧全为 removed，剩余右侧全为 added
  while (i < m) {
    result.push({ op: 'removed', text: left[i], leftNo: i + 1, rightNo: null })
    i++
  }
  while (j < n) {
    result.push({ op: 'added', text: right[j], leftNo: null, rightNo: j + 1 })
    j++
  }
  return result
}

/** 降级策略：逐行按最长长度对齐，同位置行相同则 unchanged，不同则输出 removed + added */
function naiveDiff(left: string[], right: string[]): DiffLine[] {
  const result: DiffLine[] = []
  const max = Math.max(left.length, right.length)
  for (let k = 0; k < max; k++) {
    const hasLeft = k < left.length
    const hasRight = k < right.length
    if (hasLeft && hasRight) {
      if (left[k] === right[k]) {
        result.push({ op: 'unchanged', text: left[k], leftNo: k + 1, rightNo: k + 1 })
      } else {
        // 同位置不同：先删后增
        result.push({ op: 'removed', text: left[k], leftNo: k + 1, rightNo: null })
        result.push({ op: 'added', text: right[k], leftNo: null, rightNo: k + 1 })
      }
    } else if (hasLeft) {
      result.push({ op: 'removed', text: left[k], leftNo: k + 1, rightNo: null })
    } else {
      result.push({ op: 'added', text: right[k], leftNo: null, rightNo: k + 1 })
    }
  }
  return result
}
