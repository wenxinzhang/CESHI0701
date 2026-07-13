<!-- 记忆编辑工作区：编辑/预览/分屏 三模式，组合 MdToolbar + CmEditor + MarkdownRenderer，分屏可拖动+同步滚动 -->
<template>
  <div ref="rootRef" class="mew" :class="`is-${mode}`">
    <!-- 编辑模式 / 分屏左侧：工具栏 + 编辑器 -->
    <div v-if="mode !== 'preview'" class="mew-edit" :style="editPaneStyle">
      <MdToolbar @command="onToolbarCommand" />
      <CmEditor
        ref="cmRef"
        :model-value="modelValue"
        @update:model-value="(v: string) => emit('update:modelValue', v)"
        @save="emit('save')"
      />
    </div>

    <!-- 分屏拖动分隔条 -->
    <div v-if="mode === 'split'" class="mew-gutter" @pointerdown="onGutterDown">
      <div class="mew-gutter-bar"></div>
    </div>

    <!-- 预览模式 / 分屏右侧：渲染内容 -->
    <div v-if="mode !== 'edit'" class="mew-preview" :style="previewPaneStyle">
      <div v-if="mode === 'split'" class="mew-preview-head">
        <span>预览</span>
        <ElTooltip content="同步滚动" placement="top" :show-after="300">
          <ElSwitch v-model="syncScroll" size="small" />
        </ElTooltip>
      </div>
      <div v-if="debouncedContent.trim()" class="mew-preview-body markdown-body">
        <MarkdownRenderer :content="debouncedContent" />
      </div>
      <div v-else class="mew-preview-empty">暂无内容，切到编辑模式开始输入</div>
    </div>
  </div>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
  import { ElSwitch, ElTooltip } from 'element-plus'
  import { useDebounceFn } from '@vueuse/core'
  import CmEditor from './CmEditor.vue'
  import MdToolbar from './MdToolbar.vue'
  import MarkdownRenderer from '../ai-chat/markdown/MarkdownRenderer.vue'
  import type { ToolbarCommand } from './md-toolbar-actions'
  import type { MarkdownViewMode } from '@/store/modules/agentMemory'

  defineOptions({ name: 'MemoryEditorWorkspace' })

  const props = defineProps<{
    /** 编辑内容（v-model） */
    modelValue: string
    /** 视图模式 */
    mode: MarkdownViewMode
    /** 分屏比例（编辑区占比 0.3~0.7，v-model:ratio） */
    ratio: number
  }>()

  const emit = defineEmits<{
    'update:modelValue': [value: string]
    'update:ratio': [value: number]
    /** 触发保存 */
    save: []
  }>()

  /** 工作区根节点（DOM 查询限定在本实例内，避免多实例串扰） */
  const rootRef = ref<HTMLElement>()
  /** CmEditor 组件引用（转调其暴露的插入/撤销/查找方法） */
  const cmRef = ref<InstanceType<typeof CmEditor>>()
  /** 同步滚动开关（本地态，切模式不重置由 keep-alive 保证，简单起见默认开） */
  const syncScroll = ref(true)

  /** 防抖后的预览内容（输入 250ms 后才刷新渲染，避免高频渲染） */
  const debouncedContent = ref(props.modelValue)
  const flushPreview = useDebounceFn((v: string) => {
    debouncedContent.value = v
  }, 250)
  watch(
    () => props.modelValue,
    (v) => {
      // 预览模式无需防抖（不在编辑），直接同步；编辑/分屏走防抖
      if (props.mode === 'preview') debouncedContent.value = v
      else flushPreview(v)
    },
    { immediate: false }
  )
  // 切到含预览的模式时，立即对齐一次，避免显示上一次的防抖残留
  watch(
    () => props.mode,
    (m) => {
      if (m !== 'edit') debouncedContent.value = props.modelValue
    }
  )

  /** 编辑区宽度样式（仅分屏模式按比例；编辑模式占满） */
  const editPaneStyle = computed(() =>
    props.mode === 'split' ? { flex: `0 0 ${props.ratio * 100}%` } : {}
  )
  /** 预览区宽度样式（仅分屏模式按剩余比例） */
  const previewPaneStyle = computed(() =>
    props.mode === 'split' ? { flex: `1 1 ${(1 - props.ratio) * 100}%` } : {}
  )

  /** 工具栏命令 → 转调 CmEditor 方法 */
  const onToolbarCommand = (cmd: ToolbarCommand): void => {
    const cm = cmRef.value
    if (!cm) return
    switch (cmd.type) {
      case 'around':
        cm.insertAround(cmd.before, cmd.after, cmd.placeholder)
        break
      case 'prefix':
        cm.insertLinePrefix(cmd.prefix)
        break
      case 'block':
        cm.insertBlock(cmd.text, cmd.selectOffset)
        break
      case 'undo':
        cm.undo()
        break
      case 'redo':
        cm.redo()
        break
      case 'search':
        cm.openSearch()
        break
    }
  }

  // ——— 分屏拖动分隔条 ———
  /** 拖动起点缓存 */
  let dragging = false

  /** 分隔条按下：进入拖动，全局监听 move/up */
  const onGutterDown = (e: PointerEvent): void => {
    dragging = true
    e.preventDefault()
    window.addEventListener('pointermove', onGutterMove)
    window.addEventListener('pointerup', onGutterUp, { once: true })
  }

  /** 拖动中：按鼠标 X 相对本实例容器计算编辑区占比，限幅 0.3~0.7 */
  const onGutterMove = (e: PointerEvent): void => {
    if (!dragging || !rootRef.value) return
    const rect = rootRef.value.getBoundingClientRect()
    if (rect.width <= 0) return
    const raw = (e.clientX - rect.left) / rect.width
    const clamped = Math.min(0.7, Math.max(0.3, raw))
    emit('update:ratio', Number(clamped.toFixed(3)))
  }

  /** 拖动结束：清理监听 */
  const onGutterUp = (): void => {
    dragging = false
    window.removeEventListener('pointermove', onGutterMove)
  }

  // ——— 同步滚动 ———
  /** 联动锁：一侧驱动另一侧时置真，避免回弹造成双向死循环 */
  let isSyncing = false
  /** 已绑定滚动监听的两个滚动容器与其解绑函数 */
  let scrollCleanup: (() => void) | null = null

  /** 取编辑区内部 CodeMirror 滚动容器（限定本实例内） */
  function getEditorScroller(): HTMLElement | null {
    return rootRef.value?.querySelector('.mew-edit .cm-scroller') ?? null
  }
  /** 取预览滚动容器（.mew-preview-body 自身滚动，限定本实例内） */
  function getPreviewScroller(): HTMLElement | null {
    return rootRef.value?.querySelector('.mew-preview-body') ?? null
  }

  /** 按滚动比例把 source 的位置映射到 target */
  function mirror(source: HTMLElement, target: HTMLElement): void {
    if (isSyncing || !syncScroll.value) return
    const denom = source.scrollHeight - source.clientHeight
    if (denom <= 0) return
    const pct = source.scrollTop / denom
    isSyncing = true
    target.scrollTop = pct * (target.scrollHeight - target.clientHeight)
    // 下一帧释放锁：让本次赋值触发的 scroll 事件先被忽略
    requestAnimationFrame(() => {
      isSyncing = false
    })
  }

  /** 绑定两侧滚动联动（分屏进入时调用） */
  function bindSyncScroll(): void {
    unbindSyncScroll()
    const editor = getEditorScroller()
    const preview = getPreviewScroller()
    if (!editor || !preview) return
    const onEditorScroll = (): void => mirror(editor, preview)
    const onPreviewScroll = (): void => mirror(preview, editor)
    editor.addEventListener('scroll', onEditorScroll, { passive: true })
    preview.addEventListener('scroll', onPreviewScroll, { passive: true })
    scrollCleanup = () => {
      editor.removeEventListener('scroll', onEditorScroll)
      preview.removeEventListener('scroll', onPreviewScroll)
    }
  }
  /** 解绑滚动联动 */
  function unbindSyncScroll(): void {
    scrollCleanup?.()
    scrollCleanup = null
  }

  // 进入/离开分屏时绑定/解绑滚动联动（等 DOM 就绪）
  watch(
    () => props.mode,
    async (m) => {
      unbindSyncScroll()
      if (m === 'split') {
        await nextTick()
        // 预览 body 是 v-if（有内容才渲染），延一帧确保挂载
        requestAnimationFrame(bindSyncScroll)
      }
    },
    { immediate: true }
  )

  // 预览内容从无到有时（body 才挂载），若在分屏则重新绑定
  watch(debouncedContent, () => {
    if (props.mode === 'split' && !scrollCleanup) requestAnimationFrame(bindSyncScroll)
  })

  onBeforeUnmount(() => {
    unbindSyncScroll()
    window.removeEventListener('pointermove', onGutterMove)
    window.removeEventListener('pointerup', onGutterUp)
  })
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .mew {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;

    &.is-edit,
    &.is-preview {
      flex-direction: column;
    }

    &.is-split {
      flex-direction: row;
    }
  }

  // 编辑区：工具栏 + 编辑器竖排
  .mew-edit {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  // 分屏分隔条
  .mew-gutter {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 8px;
    cursor: col-resize;

    &:hover .mew-gutter-bar,
    &:active .mew-gutter-bar {
      background: var(--art-primary);
    }

    .mew-gutter-bar {
      width: 2px;
      height: 100%;
      background: var(--art-border-color);
      transition: background 0.15s;
    }
  }

  // 预览区
  .mew-preview {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--art-gray-100);
    border: 1px solid var(--art-border-color);
    border-radius: 8px;
  }

  .mew-preview-head {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--art-text-gray-500);
    background: var(--art-main-bg-color);
    border-bottom: 1px solid var(--art-border-color);
    border-radius: 8px 8px 0 0;
  }

  .mew-preview-body {
    flex: 1;
    min-height: 0;
    padding: 16px 18px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.7;
    color: var(--art-text-gray-800);
  }

  .mew-preview-empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: var(--art-text-gray-400);
  }

  // 预览排版：在记忆中心内把代码块改浅灰底（覆盖全局 markdown.scss 暗色），补引用块/表格/图片/分割线样式
  .mew-preview-body {
    :deep(h1) {
      margin: 0 0 12px;
      font-size: 20px;
    }
    :deep(h2) {
      margin: 18px 0 10px;
      font-size: 16px;
    }
    :deep(h3) {
      margin: 14px 0 8px;
      font-size: 14px;
    }
    :deep(p) {
      margin: 8px 0;
    }
    :deep(ul),
    :deep(ol) {
      padding-left: 20px;
      margin: 8px 0;
    }
    :deep(li) {
      margin: 4px 0;
    }

    // 引用块：蓝色左竖线 + 浅底
    :deep(.md-quote),
    :deep(blockquote) {
      padding: 8px 14px;
      margin: 10px 0;
      color: var(--art-text-gray-600);
      background: rgba(var(--art-primary), 0.05);
      border-left: 3px solid var(--art-primary);
      border-radius: 0 6px 6px 0;

      p {
        margin: 4px 0;
      }
    }

    // 分割线
    :deep(.md-hr),
    :deep(hr) {
      height: 1px;
      margin: 16px 0;
      background: var(--art-border-color);
      border: none;
    }

    // 代码块：浅灰底、横向滚动（覆盖全局暗色）
    :deep(pre) {
      padding: 12px 14px;
      overflow-x: auto;
      background: var(--art-gray-100) !important;
      border: 1px solid var(--art-border-color);
      border-radius: 6px;

      code {
        background: transparent !important;
        border: none;
      }
    }
    :deep(code) {
      font-family: var(--art-font-mono, monospace);
      font-size: 13px;
    }
    // 行内代码
    :deep(.md-inline-code) {
      padding: 2px 5px;
      background: var(--art-gray-200) !important;
      border-radius: 4px;
    }

    // 表格：边框 + 表头浅灰
    :deep(.md-table),
    :deep(table) {
      width: 100%;
      margin: 10px 0;
      border-collapse: collapse;

      th,
      td {
        padding: 6px 10px;
        border: 1px solid var(--art-border-color);
      }
      th {
        background: var(--art-gray-100);
      }
    }

    // 图片自适应、长链接换行
    :deep(.md-img),
    :deep(img) {
      max-width: 100%;
      height: auto;
    }
    :deep(a) {
      word-break: break-all;
    }
  }
</style>
