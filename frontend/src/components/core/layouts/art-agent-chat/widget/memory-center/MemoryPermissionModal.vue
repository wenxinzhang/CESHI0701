<!-- 权限设置 + 关联记忆弹窗：从详情主区移出，把空间让给编辑器 -->
<template>
  <ElDialog
    :model-value="visible"
    :title="`权限与关联 · ${fileName}`"
    width="560px"
    append-to-body
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="pm-section-title">权限设置</div>
    <MemoryPermissionPanel :permission="permission" @change="(p) => emit('permission-change', p)" />

    <div class="pm-section-title pm-mt">关联记忆</div>
    <div v-if="relatedIds.length" class="pm-related">
      <ElTag v-for="rid in relatedIds" :key="rid" class="pm-related-tag" @click="onSelectRelated(rid)">
        {{ rid }}
      </ElTag>
    </div>
    <div v-else class="pm-empty">暂无关联记忆</div>
  </ElDialog>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import { ElDialog, ElTag } from 'element-plus'
  import MemoryPermissionPanel from './MemoryPermissionPanel.vue'
  import type { MemoryPermission } from './memory-constants'

  defineOptions({ name: 'MemoryPermissionModal' })

  defineProps<{
    /** 是否可见 */
    visible: boolean
    /** 文件名 */
    fileName: string
    /** 权限配置 */
    permission: MemoryPermission
    /** 关联记忆 ID 列表 */
    relatedIds: string[]
  }>()

  const emit = defineEmits<{
    'update:visible': [value: boolean]
    /** 权限变更 */
    'permission-change': [patch: Partial<MemoryPermission>]
    /** 选中关联记忆（关闭弹窗后跳转） */
    select: [id: string]
  }>()

  /** 点击关联记忆：跳转并关闭弹窗 */
  const onSelectRelated = (id: string): void => {
    emit('select', id)
    emit('update:visible', false)
  }
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .pm-section-title {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--art-text-gray-900);

    &.pm-mt {
      margin-top: 20px;
    }
  }

  .pm-related {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .pm-related-tag {
      cursor: pointer;
    }
  }

  .pm-empty {
    font-size: 13px;
    color: var(--art-text-gray-400);
  }
</style>
