<!-- 历史版本弹窗：版本列表 / 单版本 Markdown 预览 / 与当前版本逐行 diff 对比，支持回滚 -->
<template>
  <ElDialog
    :model-value="visible"
    :title="dialogTitle"
    width="820px"
    top="8vh"
    append-to-body
    class="mem-version-modal"
    @update:model-value="emit('update:visible', $event)"
    @closed="onClosed"
  >
    <!-- 列表视图 -->
    <ElTable v-if="mode === 'list'" :data="versions" size="small" max-height="440">
      <ElTableColumn label="版本号" width="130">
        <template #default="{ row }">
          <span class="ver-no">{{ (row as MemoryVersion).version }}</span>
          <ElTag v-if="(row as MemoryVersion).current" type="primary" size="small" effect="light">当前</ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="更新时间" width="150" prop="time" />
      <ElTableColumn label="更新人" width="110" prop="updater" />
      <ElTableColumn label="变更说明" min-width="140" prop="note" show-overflow-tooltip />
      <ElTableColumn label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <ElButton size="small" text type="primary" @click="onView(row as MemoryVersion)">查看</ElButton>
          <ElButton
            v-if="!(row as MemoryVersion).current"
            size="small"
            text
            @click="onDiff(row as MemoryVersion)"
          >
            对比
          </ElButton>
          <ElButton
            v-if="!(row as MemoryVersion).current"
            size="small"
            text
            type="warning"
            @click="onRollback(row as MemoryVersion)"
          >
            回滚
          </ElButton>
        </template>
      </ElTableColumn>
      <template #empty>暂无历史版本</template>
    </ElTable>

    <!-- 单版本预览视图 -->
    <div v-else-if="mode === 'preview'" class="mv-panel">
      <div class="mv-toolbar">
        <ElButton size="small" text @click="backToList">
          <i class="iconfont-sys">&#xe6eb;</i> 返回列表
        </ElButton>
        <ElRadioGroup v-model="previewSource" size="small">
          <ElRadioButton value="rendered">渲染</ElRadioButton>
          <ElRadioButton value="raw">源码</ElRadioButton>
        </ElRadioGroup>
      </div>
      <div class="mv-content">
        <div v-if="previewSource === 'rendered'" class="mv-render markdown-body">
          <MarkdownRenderer :content="activeContent" />
        </div>
        <pre v-else class="mv-raw">{{ activeContent }}</pre>
      </div>
    </div>

    <!-- diff 对比视图 -->
    <div v-else class="mv-panel">
      <div class="mv-toolbar">
        <ElButton size="small" text @click="backToList">
          <i class="iconfont-sys">&#xe6eb;</i> 返回列表
        </ElButton>
        <span class="mv-diff-legend">
          <span class="lg lg-old">{{ activeVersion?.version }}（旧）</span>
          <span class="lg lg-new">当前（新）</span>
        </span>
      </div>
      <div class="mv-diff">
        <div
          v-for="(ln, idx) in diffResult"
          :key="idx"
          class="mv-diff-row"
          :class="`is-${ln.op}`"
        >
          <span class="mv-diff-no">{{ ln.leftNo ?? '' }}</span>
          <span class="mv-diff-no">{{ ln.rightNo ?? '' }}</span>
          <span class="mv-diff-sign">{{ signOf(ln.op) }}</span>
          <span class="mv-diff-text">{{ ln.text || ' ' }}</span>
        </div>
      </div>
    </div>
  </ElDialog>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { ElDialog, ElTable, ElTableColumn, ElButton, ElTag, ElRadioGroup, ElRadioButton, ElMessageBox } from 'element-plus'
  import MarkdownRenderer from '../ai-chat/markdown/MarkdownRenderer.vue'
  import { diffLines, type DiffOp } from '@/utils/diff/lineDiff'
  import type { MemoryVersion } from './memory-constants'

  defineOptions({ name: 'MemoryVersionModal' })

  const props = defineProps<{
    /** 是否可见 */
    visible: boolean
    /** 文件名 */
    fileName: string
    /** 版本列表 */
    versions: MemoryVersion[]
    /** 当前（已保存）内容，用于 diff 对比的新侧 */
    currentContent: string
    /** 是否有未保存修改（回滚确认文案据此警示） */
    dirty?: boolean
  }>()

  const emit = defineEmits<{
    /** 可见性 */
    'update:visible': [value: boolean]
    /** 回滚到指定版本 */
    rollback: [version: string]
  }>()

  /** 视图模式：列表 / 单版本预览 / diff 对比 */
  const mode = ref<'list' | 'preview' | 'diff'>('list')
  /** 当前操作的版本 */
  const activeVersion = ref<MemoryVersion | null>(null)
  /** 预览来源：渲染 / 源码 */
  const previewSource = ref<'rendered' | 'raw'>('rendered')

  /** 当前版本内容 */
  const activeContent = computed(() => activeVersion.value?.content ?? '')

  /** 弹窗标题随视图变化 */
  const dialogTitle = computed(() => {
    if (mode.value === 'preview') return `版本 ${activeVersion.value?.version} · 预览`
    if (mode.value === 'diff') return `版本对比 · ${activeVersion.value?.version} → 当前`
    return `历史版本 · ${props.fileName}`
  })

  /** diff 结果：旧版本内容 → 当前内容 */
  const diffResult = computed(() =>
    mode.value === 'diff' ? diffLines(activeContent.value, props.currentContent) : []
  )

  /** diff 行前的符号 */
  const signOf = (op: DiffOp): string => (op === 'added' ? '+' : op === 'removed' ? '-' : '')

  /** 查看某版本内容（Markdown 预览） */
  const onView = (row: MemoryVersion): void => {
    activeVersion.value = row
    previewSource.value = 'rendered'
    mode.value = 'preview'
  }

  /** 与当前版本 diff 对比 */
  const onDiff = (row: MemoryVersion): void => {
    activeVersion.value = row
    mode.value = 'diff'
  }

  /** 返回列表视图 */
  const backToList = (): void => {
    mode.value = 'list'
    activeVersion.value = null
  }

  /** 回滚：交由父级安全守卫统一处理确认与提示，回滚后关闭 */
  const onRollback = async (row: MemoryVersion): Promise<void> => {
    const extra = props.dirty ? '当前有未保存的修改，回滚将一并丢弃。' : ''
    try {
      await ElMessageBox.confirm(
        `确定回滚到 ${row.version} 吗？当前内容将被该版本替换。${extra}`,
        '回滚确认',
        { type: 'warning' }
      )
      emit('rollback', row.version)
      emit('update:visible', false)
    } catch {
      // 用户取消
    }
  }

  /** 弹窗关闭后复位到列表视图，避免下次打开停留在预览/对比 */
  const onClosed = (): void => {
    mode.value = 'list'
    activeVersion.value = null
  }
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .ver-no {
    margin-right: 6px;
    font-weight: 600;
  }

  .mv-panel {
    display: flex;
    flex-direction: column;
    height: 56vh;
  }

  .mv-toolbar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--art-border-color);
  }

  .mv-diff-legend {
    display: flex;
    gap: 12px;
    font-size: 12px;

    .lg {
      padding: 2px 8px;
      border-radius: 4px;
    }

    .lg-old {
      color: #b42318;
      background: rgba(180, 35, 24, 0.08);
    }

    .lg-new {
      color: #067647;
      background: rgba(6, 118, 71, 0.08);
    }
  }

  .mv-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .mv-render {
    padding: 4px 2px;
  }

  .mv-raw {
    padding: 12px 14px;
    margin: 0;
    font-family: var(--art-font-mono, monospace);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--art-gray-100);
    border-radius: 6px;
  }

  // diff 视图：等宽逐行，左右行号 + 符号 + 文本，增删着色
  .mv-diff {
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-family: var(--art-font-mono, monospace);
    font-size: 13px;
    line-height: 1.6;
    border: 1px solid var(--art-border-color);
    border-radius: 6px;
  }

  .mv-diff-row {
    display: flex;
    align-items: baseline;

    .mv-diff-no {
      flex-shrink: 0;
      width: 40px;
      padding: 0 6px;
      color: var(--art-text-gray-400);
      text-align: right;
      user-select: none;
    }

    .mv-diff-sign {
      flex-shrink: 0;
      width: 16px;
      text-align: center;
      user-select: none;
    }

    .mv-diff-text {
      flex: 1;
      white-space: pre-wrap;
      word-break: break-word;
    }

    &.is-added {
      background: rgba(6, 118, 71, 0.1);
      .mv-diff-sign {
        color: #067647;
      }
    }

    &.is-removed {
      background: rgba(180, 35, 24, 0.1);
      .mv-diff-sign {
        color: #b42318;
      }
    }
  }
</style>
