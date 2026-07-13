<!-- 记忆详情头部：文件信息 + 元信息 + 版本下拉 + 未保存标签 + 操作按钮 + 模式切换 -->
<template>
  <div class="mdh">
    <!-- 上行：文件标题 + 未保存标签 + 模式切换 -->
    <div class="mdh-top">
      <div class="mdh-title">
        <i class="iconfont-sys mdh-file-icon">&#xe816;</i>
        <div class="mdh-title-text">
          <div class="mdh-name-row">
            <span class="mdh-name">{{ file.name }}</span>
            <ElTag v-if="dirty" type="warning" size="small" effect="light" round>未保存</ElTag>
          </div>
          <div class="mdh-subtitle">{{ file.subtitle }}</div>
        </div>
      </div>

      <!-- 模式切换：编辑 | 预览 | 分屏 -->
      <ElRadioGroup
        :model-value="mode"
        size="small"
        class="mdh-mode"
        @update:model-value="(m) => emit('mode-change', m as MarkdownViewMode)"
      >
        <ElRadioButton value="edit">编辑</ElRadioButton>
        <ElRadioButton value="preview">预览</ElRadioButton>
        <ElRadioButton value="split">分屏</ElRadioButton>
      </ElRadioGroup>
    </div>

    <!-- 下行：元信息 + 操作按钮 -->
    <div class="mdh-bottom">
      <div class="mdh-meta">
        <span>版本 {{ file.version }}</span>
        <span>创建人 {{ file.creator }}</span>
        <span>更新 {{ file.lastUpdate }}</span>
        <span>更新人 {{ file.updater }}</span>
      </div>

      <div class="mdh-actions">
        <!-- 版本组：版本下拉 + 历史 -->
        <div class="mdh-group">
          <ElSelect :model-value="file.version" size="small" class="mdh-version" @change="onSelectVersion">
            <ElOption
              v-for="v in file.versions"
              :key="v.version"
              :label="v.current ? `${v.version}（当前）` : v.version"
              :value="v.version"
            />
          </ElSelect>
          <ElButton size="small" text bg @click="emit('open-versions')">
            <i class="iconfont-sys mdh-btn-icon">&#xe6a3;</i>历史
          </ElButton>
        </div>

        <span class="mdh-divider" />

        <!-- 辅助面板组：建议 + 权限 -->
        <div class="mdh-group">
          <ElButton size="small" text bg @click="emit('open-suggestions')">
            <i class="iconfont-sys mdh-btn-icon">&#xe72e;</i>建议
            <ElTag v-if="file.suggestions.length" type="warning" size="small" effect="light" round>
              {{ file.suggestions.length }}
            </ElTag>
          </ElButton>
          <ElButton size="small" text bg @click="emit('open-permission')">
            <i class="iconfont-sys mdh-btn-icon">&#xe6a2;</i>权限
          </ElButton>
        </div>

        <span class="mdh-divider" />

        <!-- 主操作组：保存 + 取消 + 更多。
             编辑/分屏态常显；预览态默认隐藏（无法编辑，避免冗余灰按钮），
             但若带着未保存修改切回预览仍需显示，否则用户无从保存——避免"改了存不了"陷阱。 -->
        <div class="mdh-group">
          <template v-if="mode !== 'preview' || dirty">
            <ElButton type="primary" size="small" :loading="saving" :disabled="!dirty" @click="emit('save')">
              保存
            </ElButton>
            <ElButton size="small" :disabled="!dirty" @click="emit('cancel')">取消</ElButton>
          </template>
          <ElDropdown trigger="click" @command="onMore">
            <ElButton size="small" text bg class="mdh-more"><i class="iconfont-sys">&#xe6df;</i></ElButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem command="copy">复制内容</ElDropdownItem>
                <ElDropdownItem command="delete" :disabled="file.builtin" divided>
                  {{ file.builtin ? '内置不可删除' : '删除文件' }}
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </div>
    </div>
  </div>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import {
    ElTag, ElRadioGroup, ElRadioButton, ElSelect, ElOption,
    ElButton, ElDropdown, ElDropdownMenu, ElDropdownItem, ElMessageBox
  } from 'element-plus'
  import type { MemoryFile } from './memory-constants'
  import type { MarkdownViewMode } from '@/store/modules/agentMemory'

  defineOptions({ name: 'MemoryDetailHeader' })

  const props = defineProps<{
    /** 当前文件 */
    file: MemoryFile
    /** 是否有未保存修改 */
    dirty: boolean
    /** 保存中 */
    saving: boolean
    /** 视图模式 */
    mode: MarkdownViewMode
  }>()

  const emit = defineEmits<{
    /** 切换视图模式 */
    'mode-change': [mode: MarkdownViewMode]
    /** 保存 */
    save: []
    /** 取消 */
    cancel: []
    /** 打开历史版本弹窗 */
    'open-versions': []
    /** 打开模型建议弹窗 */
    'open-suggestions': []
    /** 打开权限与关联弹窗 */
    'open-permission': []
    /** 版本下拉切换（回滚） */
    rollback: [version: string]
    /** 复制内容 */
    copy: []
    /** 删除文件 */
    delete: []
  }>()

  /**
   * 版本下拉切换到非当前版本：二次确认后回滚（回滚会以历史内容覆盖当前，
   * 且丢弃未保存编辑，故 dirty 时文案额外警示）。取消则不回滚——下拉受控绑定
   * file.version，会自动复位为当前版本。
   */
  const onSelectVersion = async (version: string): Promise<void> => {
    if (version === props.file.version) return
    const extra = props.dirty ? '当前有未保存的修改，回滚将一并丢弃。' : ''
    try {
      await ElMessageBox.confirm(
        `确定回滚到 ${version} 吗？当前内容将被该版本替换。${extra}`,
        '回滚确认',
        { type: 'warning', confirmButtonText: '回滚', cancelButtonText: '取消' }
      )
      emit('rollback', version)
    } catch {
      // 用户取消：受控下拉自动复位为当前版本
    }
  }

  /** 更多下拉命令 */
  const onMore = (cmd: string): void => {
    if (cmd === 'copy') emit('copy')
    else if (cmd === 'delete') emit('delete')
  }
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .mdh {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--art-border-color);
  }

  .mdh-top {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .mdh-title {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;

    .mdh-file-icon {
      flex-shrink: 0;
      font-size: 26px;
      color: var(--art-primary);
    }

    .mdh-name-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .mdh-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--art-text-gray-900);
    }

    .mdh-subtitle {
      margin-top: 2px;
      font-size: 12px;
      color: var(--art-text-gray-500);
    }
  }

  .mdh-mode {
    flex-shrink: 0;
  }

  .mdh-bottom {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }

  .mdh-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 12px;
    color: var(--art-text-gray-500);
  }

  .mdh-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;

    // 组内按钮紧凑排布，组间用分隔线拉开层次
    .mdh-group {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .mdh-divider {
      flex-shrink: 0;
      width: 1px;
      height: 18px;
      background: var(--art-border-color);
    }

    .mdh-version {
      width: 132px;
    }

    .mdh-more {
      padding: 0 8px;
    }

    .mdh-btn-icon {
      margin-right: 2px;
      font-size: 13px;
    }
  }

  // 窄屏（弹窗被压窄）：分隔线隐藏，操作区整体靠右换行不至于顶碎标题
  @media (max-width: 1180px) {
    .mdh-divider {
      display: none;
    }
  }
</style>
