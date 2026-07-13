<!-- 记忆中心：统计卡片 + 左侧[记忆文件列表 + 待确认记忆] + 右侧详情面板，前端状态实现 -->
<template>
  <div class="memory-center">
    <!-- 顶部统计卡片 -->
    <MemoryStatsCards :stats="store.stats" :pending-count="store.pendingCount" />

    <!-- 主体：左侧列表区 | 右侧详情 -->
    <div class="mc-body">
      <div class="mc-left">
        <MemoryFileList
          class="mc-files"
          :files="store.files"
          :selected-id="store.selectedId"
          @select="onSelectFile"
          @create="onCreate"
          @toggle="onToggle"
        />
        <PendingMemoryList
          class="mc-pending"
          :items="store.pending"
          @confirm="onConfirmPending"
          @ignore="store.ignorePending"
        />
      </div>

      <MemoryDetailPanel
        :file="store.selected"
        @save="onSave"
        @select="onSelectFile"
        @rollback="onRollback"
        @permission-change="store.updatePermission"
        @open-versions="versionVisible = true"
        @open-suggestions="suggestionVisible = true"
        @delete="onDelete"
      />
    </div>

    <!-- 历史版本弹窗 -->
    <MemoryVersionModal
      v-if="store.selected"
      v-model:visible="versionVisible"
      :file-name="store.selected.name"
      :versions="store.selected.versions"
      :current-content="store.originalContent"
      :dirty="store.dirty"
      @rollback="onRollback"
    />

    <!-- 模型建议弹窗 -->
    <MemorySuggestionModal
      v-if="store.selected"
      v-model:visible="suggestionVisible"
      :file-name="store.selected.name"
      :suggestions="store.selected.suggestions"
      @apply="onApplySuggestion"
      @ignore="store.ignoreSuggestion"
    />
  </div>
</template>

<!-- PART_SCRIPT -->

<script setup lang="ts">
  import { ref, watch, onMounted } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useDebounceFn, useEventListener } from '@vueuse/core'
  import { useAgentMemoryStore } from '@/store/modules/agentMemory'
  import { useUserStore } from '@/store/modules/user'
  import MemoryStatsCards from './memory-center/MemoryStatsCards.vue'
  import MemoryFileList from './memory-center/MemoryFileList.vue'
  import PendingMemoryList from './memory-center/PendingMemoryList.vue'
  import MemoryDetailPanel from './memory-center/MemoryDetailPanel.vue'
  import MemoryVersionModal from './memory-center/MemoryVersionModal.vue'
  import MemorySuggestionModal from './memory-center/MemorySuggestionModal.vue'

  defineOptions({ name: 'MemoryCenter' })

  const store = useAgentMemoryStore()
  const userStore = useUserStore()

  /** 历史版本弹窗可见 */
  const versionVisible = ref(false)
  /** 模型建议弹窗可见 */
  const suggestionVisible = ref(false)

  // ——— 本地草稿：memory-draft:{userId}:{fileId} ———
  /** 当前用户 ID（未登录兜底为 anon，仅用于隔离草稿 key） */
  const draftUserId = () => userStore.getUserInfo?.id ?? 'anon'
  /** 生成某文件的草稿存储 key */
  const draftKey = (fileId: string) => `memory-draft:${draftUserId()}:${fileId}`

  /** 写/清草稿：dirty 时存 editingContent，否则移除 */
  const persistDraft = useDebounceFn(() => {
    const id = store.selectedId
    if (!id) return
    try {
      if (store.dirty) localStorage.setItem(draftKey(id), store.editingContent)
      else localStorage.removeItem(draftKey(id))
    } catch {
      // localStorage 不可用（隐私模式/超限）时静默降级，不影响编辑
    }
  }, 1500)

  // 编辑缓冲变化 → 防抖持久化草稿
  watch(() => store.editingContent, persistDraft)

  /** 打开文件后检查本地草稿：存在且与原文不同则询问是否恢复 */
  const checkDraft = async (fileId: string): Promise<void> => {
    let draft: string | null = null
    try {
      draft = localStorage.getItem(draftKey(fileId))
    } catch {
      return
    }
    if (draft === null || draft === store.originalContent) return
    try {
      await ElMessageBox.confirm('检测到未保存的本地草稿，是否恢复？', '恢复草稿', {
        type: 'info',
        confirmButtonText: '恢复草稿',
        cancelButtonText: '放弃草稿'
      })
      store.setEditingContent(draft)
      ElMessage.success('已恢复本地草稿')
    } catch {
      try {
        localStorage.removeItem(draftKey(fileId))
      } catch {
        // 忽略
      }
    }
  }

  // 离开保护：有未保存修改时刷新/关闭标签页给出浏览器原生提示
  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (store.dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  /**
   * 记忆写入安全守卫（fail-closed）：写入前先过安全裁决。
   * - 拒绝：提示 blockedReason 并中止
   * - 需审批：提示需审批并中止（后端亦会拦截）
   * - 需确认：弹二次确认框（展示命中策略），确认后带 confirmed=true 执行；取消则中止
   * - 放行：直接执行
   * @param memoryKey 目标文件 key
   * @param text 拟写入内容
   * @param write 实际写入回调，入参为 confirmed 标记
   * @returns 是否已执行写入
   */
  const guardedWrite = async (
    memoryKey: string,
    text: string,
    write: (confirmed: boolean) => Promise<void>
  ): Promise<boolean> => {
    const decision = await store.checkWrite(memoryKey, text)
    if (!decision) return false
    if (!decision.allowed) {
      ElMessage.error(decision.blockedReason || '安全策略拒绝该记忆写入')
      return false
    }
    if (decision.requireApproval) {
      ElMessage.warning('该记忆写入需审批后执行')
      return false
    }
    if (decision.requireConfirm) {
      const policies = decision.matchedPolicies?.length
        ? `\n命中策略：${decision.matchedPolicies.join('；')}`
        : ''
      try {
        await ElMessageBox.confirm(`该记忆写入命中安全策略，需人工确认。${policies}`, '写入确认', {
          type: 'warning',
          confirmButtonText: '确认写入',
          cancelButtonText: '取消'
        })
      } catch {
        return false // 用户取消
      }
      await write(true)
      return true
    }
    await write(false)
    return true
  }

  /** 保存编辑内容（经安全守卫；内容取自 store 编辑缓冲） */
  const onSave = async () => {
    const file = store.selected
    if (!file) return
    const content = store.editingContent
    if (!store.dirty) {
      ElMessage.info('当前内容没有变化')
      return
    }
    try {
      const done = await guardedWrite(file.id, content, (confirmed) => store.saveContent(content, confirmed))
      if (done) ElMessage.success('已保存')
    } catch {
      // 保存失败：editingContent 不回滚，保留用户编辑
      ElMessage.error('保存失败，当前编辑内容已保留，请检查网络后重试')
    }
  }

  /** 切换文件：有未保存修改先确认放弃 */
  const onSelectFile = async (id: string) => {
    if (id === store.selectedId) return
    if (store.dirty) {
      try {
        await ElMessageBox.confirm('当前有未保存的修改，切换文件将丢失。确定切换？', '未保存的修改', {
          type: 'warning',
          confirmButtonText: '放弃修改并切换',
          cancelButtonText: '继续编辑'
        })
      } catch {
        return // 继续编辑
      }
      store.discardEditing()
    }
    store.select(id)
    await checkDraft(id)
  }

  /** 确认待确认记忆（经安全守卫，可含编辑后文本，提示写入的目标文件） */
  const onConfirmPending = async (payload: { id: string; text?: string }) => {
    const item = store.pending.find((p) => p.id === payload.id)
    if (!item) return
    const text = payload.text ?? item.text
    try {
      const done = await guardedWrite(item.target, text, (confirmed) =>
        store.confirmPending(payload.id, payload.text, confirmed)
      )
      if (done) ElMessage.success(`已写入 ${item.target}`)
    } catch {
      ElMessage.error('确认失败')
    }
  }

  /** 应用模型建议（经安全守卫，可含编辑后文本） */
  const onApplySuggestion = async (payload: { id: string; text?: string }) => {
    const file = store.selected
    if (!file) return
    const sug = file.suggestions.find((s) => s.id === payload.id)
    const text = payload.text ?? sug?.text ?? ''
    try {
      const done = await guardedWrite(file.id, text, (confirmed) =>
        store.applySuggestion(payload.id, payload.text, confirmed)
      )
      if (done) ElMessage.success('已应用建议')
    } catch {
      ElMessage.error('应用失败')
    }
  }

  /** 回滚版本（经安全守卫：回滚即以历史内容覆盖当前，需同等治理） */
  const onRollback = async (version: string) => {
    const file = store.selected
    if (!file) return
    const target = file.versions.find((v) => v.version === version)
    const text = target?.content ?? ''
    try {
      const done = await guardedWrite(file.id, text, (confirmed) => store.rollback(version, confirmed))
      if (done) ElMessage.success(`已回滚到 ${version}`)
    } catch {
      ElMessage.error('回滚失败')
    }
  }

  /** 新建记忆文件：先输入文件名，确认建立后再对未保存修改二次确认，最后创建。
   *  新建内部会 fetchAll 重置选中与编辑缓冲，故有未保存修改时需确认放弃（与切换文件一致，防静默丢弃）；
   *  dirty 确认放在文件名输入之后——只有确定要建时才丢弃，避免"放弃了却又取消文件名导致白丢改动"。 */
  const onCreate = async () => {
    try {
      const { value } = await ElMessageBox.prompt('请输入记忆文件名（须以 .md 结尾）', '新建记忆文件', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPattern: /^[a-zA-Z0-9_-]+\.md$/,
        inputErrorMessage: '文件名须为字母/数字/-/_ 且以 .md 结尾'
      })
      const memoryKey = value.trim()
      // 文件名已确认，创建在即；此时才对未保存修改二次确认（取消抛 'cancel'，由下方 catch 静默处理）。
      // 不在此显式 discardEditing——createMemory 成功后内部会 fetchAll 并 select 新文件，编辑缓冲随之重置（dirty 归零）；
      // 若创建失败则编辑缓冲原样保留，避免"改动已丢却没建成文件"。
      if (store.dirty) {
        await ElMessageBox.confirm('当前有未保存的修改，新建文件将丢失。确定新建？', '未保存的修改', {
          type: 'warning',
          confirmButtonText: '放弃修改并新建',
          cancelButtonText: '继续编辑'
        })
      }
      await store.createMemory({ memoryKey, name: memoryKey, description: '自定义记忆文件' })
      ElMessage.success(`已创建 ${memoryKey}`)
    } catch (e) {
      // 用户取消文件名输入或放弃确认（cancel/close）不提示；接口错误由响应拦截器统一提示
      if (e !== 'cancel' && e !== 'close') ElMessage.error('新建失败')
    }
  }

  /** 删除当前记忆文件（二次确认，内置由按钮 disabled 拦截） */
  const onDelete = async () => {
    const file = store.selected
    if (!file) return
    try {
      await ElMessageBox.confirm(`确定删除记忆文件「${file.name}」？此操作不可恢复。`, '删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      })
      await store.removeMemory(file.id)
      ElMessage.success(`已删除 ${file.name}`)
    } catch (e) {
      if (e !== 'cancel' && e !== 'close') ElMessage.error('删除失败')
    }
  }

  /** 启用/停用记忆文件 */
  const onToggle = async (id: string, enabled: boolean) => {
    try {
      await store.toggleFile(id, enabled)
      ElMessage.success(enabled ? '已启用' : '已停用')
    } catch {
      ElMessage.error('操作失败')
    }
  }

  // 首屏拉取记忆文件列表与统计，并检查首个文件是否有本地草稿
  onMounted(async () => {
    // 首次进入统一以只读预览态呈现（覆盖上次持久化的编辑/分屏）
    store.viewMode = 'preview'
    await store.fetchAll()
    if (store.selectedId) await checkDraft(store.selectedId)
  })
</script>

<!-- PART_STYLE -->

<style lang="scss" scoped>
  .memory-center {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .mc-body {
    display: flex;
    flex: 1;
    gap: 12px;
    min-height: 0;
  }

  .mc-left {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 12px;
    width: 264px;
    min-height: 0;

    // 文件列表占上半，待确认占下半，各自内部滚动
    .mc-files {
      flex: 3;
      min-height: 0;
    }

    .mc-pending {
      flex: 2;
      min-height: 0;
    }
  }

  // 窄屏：进一步收窄左栏，把更多空间留给编辑器
  @media (max-width: 1280px) {
    .mc-left {
      width: 220px;
    }
  }
</style>
