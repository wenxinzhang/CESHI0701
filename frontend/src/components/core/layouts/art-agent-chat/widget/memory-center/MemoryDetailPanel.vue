<!-- 记忆详情面板（编排者）：头部 + 三模式编辑工作区 + 权限弹窗；编辑缓冲/模式取自 store -->
<template>
  <div class="mem-detail">
    <div v-if="!file" class="md-empty">选择左侧一个记忆文件查看详情</div>

    <template v-else>
      <MemoryDetailHeader
        :file="file"
        :dirty="store.dirty"
        :saving="store.saving"
        :mode="store.viewMode"
        @mode-change="onModeChange"
        @save="emit('save')"
        @cancel="onCancel"
        @open-versions="emit('open-versions')"
        @open-suggestions="emit('open-suggestions')"
        @open-permission="permissionVisible = true"
        @rollback="(v) => emit('rollback', v)"
        @copy="onCopy"
        @delete="emit('delete')"
      />

      <MemoryEditorWorkspace
        class="md-workspace"
        :model-value="store.editingContent"
        :mode="store.viewMode"
        :ratio="store.splitRatio"
        @update:model-value="store.setEditingContent"
        @update:ratio="(r) => (store.splitRatio = r)"
        @save="emit('save')"
      />

      <MemoryPermissionModal
        v-model:visible="permissionVisible"
        :file-name="file.name"
        :permission="file.permission"
        :related-ids="file.relatedIds"
        @permission-change="(p) => emit('permission-change', p)"
        @select="(id) => emit('select', id)"
      />
    </template>
  </div>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import { ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useAgentMemoryStore, type MarkdownViewMode } from '@/store/modules/agentMemory'
  import MemoryDetailHeader from './MemoryDetailHeader.vue'
  import MemoryEditorWorkspace from './MemoryEditorWorkspace.vue'
  import MemoryPermissionModal from './MemoryPermissionModal.vue'
  import type { MemoryFile, MemoryPermission } from './memory-constants'

  defineOptions({ name: 'MemoryDetailPanel' })

  const props = defineProps<{
    /** 当前选中记忆文件 */
    file: MemoryFile | null
  }>()

  const emit = defineEmits<{
    /** 保存（内容在 store.editingContent，父层经安全守卫写入） */
    save: []
    /** 打开历史版本弹窗 */
    'open-versions': []
    /** 打开模型建议弹窗 */
    'open-suggestions': []
    /** 权限变更 */
    'permission-change': [patch: Partial<MemoryPermission>]
    /** 回滚到某版本 */
    rollback: [version: string]
    /** 选中关联记忆文件 */
    select: [id: string]
    /** 删除该记忆文件 */
    delete: []
  }>()

  const store = useAgentMemoryStore()

  /** 权限与关联弹窗可见 */
  const permissionVisible = ref(false)

  /** 切换视图模式（切模式不改内容，仅换视图） */
  const onModeChange = (mode: MarkdownViewMode): void => {
    store.viewMode = mode
  }

  /** 取消：有未保存修改时二次确认放弃，否则无操作 */
  const onCancel = async (): Promise<void> => {
    if (!store.dirty) return
    try {
      await ElMessageBox.confirm('放弃当前未保存的修改？', '放弃修改', {
        type: 'warning',
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑'
      })
      store.discardEditing()
      ElMessage.info('已放弃修改')
    } catch {
      // 继续编辑
    }
  }

  /** 复制当前编辑内容到剪贴板 */
  const onCopy = async (): Promise<void> => {
    if (!props.file) return
    try {
      await navigator.clipboard.writeText(store.editingContent)
      ElMessage.success('已复制记忆内容')
    } catch {
      ElMessage.error('复制失败')
    }
  }
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .mem-detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    padding: 16px;
    overflow: hidden;
    background: var(--art-main-bg-color);
    border: 1px solid var(--art-border-color);
    border-radius: 10px;
  }

  .md-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 13px;
    color: var(--art-text-gray-400);
  }

  .md-workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    margin-top: 12px;
  }
</style>
