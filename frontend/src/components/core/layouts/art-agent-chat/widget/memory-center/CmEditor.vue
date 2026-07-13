<!-- CodeMirror 6 Markdown 源码编辑器：行号/语法高亮/当前行/查找/撤销重做/浅色主题 + 底部状态栏 -->
<template>
  <div class="cm-editor-wrap">
    <div ref="host" class="cm-host"></div>
    <div class="cm-statusbar">
      <span class="cm-status-pos">行 {{ cursor.line }}, 列 {{ cursor.col }}</span>
      <span class="cm-status-sep">·</span>
      <span class="cm-status-count">共 {{ charCount }} 字</span>
      <span class="cm-status-lang">Markdown</span>
    </div>
  </div>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
  import { EditorState, Prec, type Extension } from '@codemirror/state'
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    type ViewUpdate
  } from '@codemirror/view'
  import { history, historyKeymap, defaultKeymap, indentWithTab, undo as cmUndo, redo as cmRedo } from '@codemirror/commands'
  import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
  import { searchKeymap, openSearchPanel, highlightSelectionMatches } from '@codemirror/search'
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
  import { languages } from '@codemirror/language-data'

  defineOptions({ name: 'CmEditor' })

  const props = defineProps<{
    /** 编辑内容（v-model） */
    modelValue: string
  }>()

  const emit = defineEmits<{
    /** 内容变更 */
    'update:modelValue': [value: string]
    /** 触发保存（Ctrl/Cmd+S） */
    save: []
  }>()

  /** 编辑器挂载宿主 */
  const host = ref<HTMLElement>()
  /** CodeMirror 视图实例 */
  let view: EditorView | null = null
  /** 光标行列（1 基） */
  const cursor = reactive({ line: 1, col: 1 })
  /** 字符数 */
  const charCount = ref(0)

  /** 更新状态栏（光标行列 + 字符数） */
  function syncStatus(): void {
    if (!view) return
    const state = view.state
    const pos = state.selection.main.head
    const line = state.doc.lineAt(pos)
    cursor.line = line.number
    cursor.col = pos - line.from + 1
    charCount.value = state.doc.length
  }

  /** 在光标处/选区两侧插入环绕标记（如 **粗体**）；有选区则包裹，无选区则插入占位并选中 */
  function insertAround(before: string, after: string, placeholder = ''): void {
    if (!view) return
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to) || placeholder
    const insert = before + selected + after
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + before.length, head: from + before.length + selected.length }
    })
    view.focus()
  }

  /** 给光标所在行（或选区覆盖的每一行）行首加前缀（如 `# `、`- `、`> `） */
  function insertLinePrefix(prefix: string): void {
    if (!view) return
    const state = view.state
    const { from, to } = state.selection.main
    const startLine = state.doc.lineAt(from).number
    const endLine = state.doc.lineAt(to).number
    const changes = []
    for (let n = startLine; n <= endLine; n++) {
      const line = state.doc.line(n)
      changes.push({ from: line.from, insert: prefix })
    }
    view.dispatch({ changes })
    view.focus()
  }

  /** 在光标处插入一段文本块（如代码块/表格模板），插入后光标落到 selectOffset 处 */
  function insertBlock(text: string, selectOffset?: number): void {
    if (!view) return
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (selectOffset ?? text.length) }
    })
    view.focus()
  }

  /** 撤销/重做/查找 —— 透传给 CodeMirror 命令 */
  function undo(): void {
    if (view) cmUndo(view)
  }
  function redo(): void {
    if (view) cmRedo(view)
  }
  function openSearch(): void {
    if (view) openSearchPanel(view)
  }

  defineExpose({ insertAround, insertLinePrefix, insertBlock, undo, redo, openSearch })

  /** 自定义快捷键：Ctrl/Cmd+S 保存、B 粗体、I 斜体、F 查找（高优先级，先于默认键位） */
  const customKeymap = Prec.high(
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (emit('save'), true) },
      { key: 'Mod-b', preventDefault: true, run: () => (insertAround('**', '**', '粗体'), true) },
      { key: 'Mod-i', preventDefault: true, run: () => (insertAround('*', '*', '斜体'), true) },
      { key: 'Mod-f', preventDefault: true, run: (v: EditorView) => openSearchPanel(v) }
    ])
  )

  /** 组装扩展集（不用 basicSetup，按需拼装以控体积与浅色主题） */
  function buildExtensions(): Extension[] {
    return [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      history(),
      bracketMatching(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      customKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      EditorView.updateListener.of((u: ViewUpdate) => {
        if (u.docChanged) {
          const text = u.state.doc.toString()
          if (text !== props.modelValue) emit('update:modelValue', text)
        }
        if (u.docChanged || u.selectionSet) syncStatus()
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--art-main-bg-color)' },
        '.cm-scroller': { fontFamily: 'var(--art-font-mono, monospace)', lineHeight: '1.7' },
        '.cm-content': { color: 'var(--art-text-gray-800)' },
        '.cm-gutters': {
          backgroundColor: 'var(--art-gray-100)',
          color: 'var(--art-text-gray-400)',
          border: 'none'
        },
        '.cm-activeLine': { backgroundColor: 'rgba(var(--art-primary), 0.05)' },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(var(--art-primary), 0.08)' }
      })
    ]
  }

  onMounted(() => {
    if (!host.value) return
    view = new EditorView({
      state: EditorState.create({ doc: props.modelValue, extensions: buildExtensions() }),
      parent: host.value
    })
    syncStatus()
  })

  // 外部 modelValue 变化（如恢复草稿/切换文件）时同步进编辑器，避免与内部 emit 造成回环
  watch(
    () => props.modelValue,
    (val) => {
      if (!view) return
      const current = view.state.doc.toString()
      if (val !== current) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: val } })
        syncStatus()
      }
    }
  )

  onBeforeUnmount(() => {
    view?.destroy()
    view = null
  })
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .cm-editor-wrap {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;
  }

  .cm-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;

    // CodeMirror 根节点撑满并允许内部滚动
    :deep(.cm-editor) {
      height: 100%;
    }

    :deep(.cm-editor.cm-focused) {
      outline: none;
    }
  }

  .cm-statusbar {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--art-text-gray-500);
    background: var(--art-gray-100);
    border-top: 1px solid var(--art-border-color);

    .cm-status-sep {
      color: var(--art-text-gray-300);
    }

    .cm-status-lang {
      margin-left: auto;
      font-weight: 600;
      color: var(--art-text-gray-400);
    }
  }
</style>
