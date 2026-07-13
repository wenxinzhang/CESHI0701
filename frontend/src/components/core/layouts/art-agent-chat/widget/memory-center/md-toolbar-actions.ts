/**
 * Markdown 工具栏动作定义
 * 每个按钮对应一个 ToolbarCommand，由 MemoryDetailPanel 转调 CmEditor 暴露的方法执行。
 * around=环绕选区；prefix=行首前缀；block=插入文本块；undo/redo/search=编辑器命令。
 */

/** 工具栏命令描述 */
export type ToolbarCommand =
  | { type: 'around'; before: string; after: string; placeholder: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'block'; text: string; selectOffset?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'search' }

/** 单个工具栏按钮 */
export interface ToolbarItem {
  /** 唯一键 */
  key: string
  /** iconfont-sys 图标字符实体（如 &#xe70d;） */
  icon: string
  /** 悬浮提示（含快捷键） */
  tip: string
  /** 触发的命令 */
  command: ToolbarCommand
  /** 是否收进「更多」下拉（低频项） */
  more?: boolean
}

/** 代码块模板：三反引号包裹，光标落到语言标识后 */
const CODE_BLOCK = '```\n\n```\n'
/** 表格模板 */
const TABLE_TPL = '| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n'

/** 工具栏按钮清单（图标沿用 iconfont-sys 字体图标） */
export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { key: 'bold', icon: '&#xe7e4;', tip: '加粗 (Ctrl+B)', command: { type: 'around', before: '**', after: '**', placeholder: '粗体' } },
  { key: 'italic', icon: '&#xe7e6;', tip: '斜体 (Ctrl+I)', command: { type: 'around', before: '*', after: '*', placeholder: '斜体' } },
  { key: 'strike', icon: '&#xe7e3;', tip: '删除线', command: { type: 'around', before: '~~', after: '~~', placeholder: '删除线' } },
  { key: 'h1', icon: '&#xe7e8;', tip: '一级标题', command: { type: 'prefix', prefix: '# ' } },
  { key: 'h2', icon: '&#xe7e9;', tip: '二级标题', command: { type: 'prefix', prefix: '## ' } },
  { key: 'h3', icon: '&#xe7ea;', tip: '三级标题', command: { type: 'prefix', prefix: '### ' } },
  { key: 'ul', icon: '&#xe7eb;', tip: '无序列表', command: { type: 'prefix', prefix: '- ' } },
  { key: 'ol', icon: '&#xe7ec;', tip: '有序列表', command: { type: 'prefix', prefix: '1. ' } },
  { key: 'task', icon: '&#xe7f0;', tip: '任务列表', command: { type: 'prefix', prefix: '- [ ] ' } },
  { key: 'quote', icon: '&#xe7ed;', tip: '引用', command: { type: 'prefix', prefix: '> ' } },
  { key: 'code', icon: '&#xe7f2;', tip: '行内代码', command: { type: 'around', before: '`', after: '`', placeholder: 'code' } },
  { key: 'codeblock', icon: '&#xe7b2;', tip: '代码块', command: { type: 'block', text: CODE_BLOCK, selectOffset: 3 }, more: true },
  { key: 'link', icon: '&#xe7ee;', tip: '链接', command: { type: 'around', before: '[', after: '](https://)', placeholder: '链接文字' } },
  { key: 'image', icon: '&#xe7ef;', tip: '图片', command: { type: 'block', text: '![描述](https://)', selectOffset: 2 }, more: true },
  { key: 'table', icon: '&#xe7f1;', tip: '表格', command: { type: 'block', text: TABLE_TPL }, more: true },
  { key: 'hr', icon: '&#xe7f3;', tip: '分割线', command: { type: 'block', text: '\n---\n' }, more: true }
]
