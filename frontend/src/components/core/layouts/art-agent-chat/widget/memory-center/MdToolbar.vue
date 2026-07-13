<!-- Markdown 编辑工具栏：格式按钮组 + 撤销/重做 + 更多下拉，发出 command 由父层转调 CmEditor -->
<template>
  <div class="md-toolbar">
    <!-- 撤销/重做 -->
    <div class="mt-group">
      <ElTooltip content="撤销 (Ctrl+Z)" placement="top" :show-after="300">
        <button type="button" class="mt-btn" @click="emit('command', { type: 'undo' })">
          <i class="iconfont-sys">&#xe7a5;</i>
        </button>
      </ElTooltip>
      <ElTooltip content="重做 (Ctrl+Y)" placement="top" :show-after="300">
        <button type="button" class="mt-btn" @click="emit('command', { type: 'redo' })">
          <i class="iconfont-sys">&#xe7a6;</i>
        </button>
      </ElTooltip>
    </div>

    <div class="mt-divider"></div>

    <!-- 主格式按钮（非 more 项） -->
    <div class="mt-group mt-scroll">
      <ElTooltip v-for="item in mainItems" :key="item.key" :content="item.tip" placement="top" :show-after="300">
        <button type="button" class="mt-btn" @click="emit('command', item.command)">
          <i class="iconfont-sys" v-html="item.icon"></i>
        </button>
      </ElTooltip>
    </div>

    <div class="mt-divider"></div>

    <!-- 查找 -->
    <ElTooltip content="查找 (Ctrl+F)" placement="top" :show-after="300">
      <button type="button" class="mt-btn" @click="emit('command', { type: 'search' })">
        <i class="iconfont-sys">&#xe6df;</i>
      </button>
    </ElTooltip>

    <!-- 更多（低频项：代码块/图片/表格/分割线） -->
    <ElDropdown trigger="click" @command="onMoreCommand">
      <button type="button" class="mt-btn"><i class="iconfont-sys">&#xe6e0;</i></button>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem v-for="item in moreItems" :key="item.key" :command="item.key">
            {{ item.tip }}
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<!-- PART_SCRIPT -->
<script setup lang="ts">
  import { computed } from 'vue'
  import { ElTooltip, ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus'
  import { TOOLBAR_ITEMS, type ToolbarCommand } from './md-toolbar-actions'

  defineOptions({ name: 'MdToolbar' })

  const emit = defineEmits<{
    /** 工具栏命令（父层转调 CmEditor） */
    command: [cmd: ToolbarCommand]
  }>()

  /** 主区按钮（常用，直接平铺） */
  const mainItems = computed(() => TOOLBAR_ITEMS.filter((i) => !i.more))
  /** 更多下拉项（低频） */
  const moreItems = computed(() => TOOLBAR_ITEMS.filter((i) => i.more))

  /** 更多下拉命令：按 key 找回对应 command 转发 */
  const onMoreCommand = (key: string): void => {
    const item = TOOLBAR_ITEMS.find((i) => i.key === key)
    if (item) emit('command', item.command)
  }
</script>

<!-- PART_STYLE -->
<style lang="scss" scoped>
  .md-toolbar {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    padding: 6px 8px;
    overflow: hidden;
    background: var(--art-gray-100);
    border: 1px solid var(--art-border-color);
    border-radius: 8px 8px 0 0;
    border-bottom: none;
  }

  .mt-group {
    display: flex;
    gap: 2px;
    align-items: center;

    &.mt-scroll {
      flex: 1;
      overflow-x: auto;
      scrollbar-width: thin;
    }
  }

  .mt-divider {
    flex-shrink: 0;
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: var(--art-border-color);
  }

  .mt-btn {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--art-text-gray-700);
    cursor: pointer;
    background: transparent;
    border: none;
    border-radius: 6px;
    transition: background 0.15s;

    i {
      font-size: 15px;
    }

    &:hover {
      color: var(--art-primary);
      background: var(--art-main-bg-color);
    }
  }
</style>
