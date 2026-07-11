<!--
  智能体统一交互入口 AgentWorkspace
  职责：顶层实例化 useAgUiAgent（单实例，D10）、承载全局初始化、按 mode 渲染三种展示模式外壳，
  并托管跨模式共享的弹窗（模型配置 / 历史会话）。切换模式只改 store.mode，绝不触碰会话数据。
-->
<template>
  <!-- 停靠态；移动端下悬浮态降级为停靠抽屉（C4） -->
  <AgentDockedShell
    v-if="mode === 'docked' || (mode === 'floating' && isMobile)"
    :agent-name="AGENT_NAME"
    :agent="agent"
    @open-config="configVisible = true"
    @open-history="historyVisible = true"
    @set-mode="agentMode.setMode"
  />

  <!-- 悬浮态（非移动端，且未关闭） -->
  <AgentFloatingShell
    v-else-if="mode === 'floating' && panel.isPanelOpen"
    :agent-name="AGENT_NAME"
    :agent="agent"
    :mode="agentMode"
    @open-config="configVisible = true"
    @open-history="historyVisible = true"
    @close="panel.setPanelOpen(false)"
    @set-mode="agentMode.setMode"
  />

  <!-- 全屏态（未关闭） -->
  <AgentFullscreenShell
    v-else-if="mode === 'fullscreen' && panel.isPanelOpen"
    :agent-name="AGENT_NAME"
    :agent="agent"
    :mode="agentMode"
    @open-config="configVisible = true"
    @open-history="historyVisible = true"
  />

  <!-- 收起后的展开手柄：悬浮/全屏态关闭后仍可从右缘唤起（停靠态由外壳自带手柄） -->
  <AgentPanelToggle
    v-if="!panel.isPanelOpen && !isDockedLike"
    :open="false"
    placement="handle"
    @toggle="panel.setPanelOpen(true)"
  />

  <!-- 模型配置管理弹窗（跨模式共享） -->
  <ModelConfigDialog v-model:visible="configVisible" />

  <!-- 历史会话抽屉（跨模式共享） -->
  <AgentHistoryDrawer
    v-model:visible="historyVisible"
    :sessions="chatStore.sessionList"
    :current-thread-id="chatStore.threadId"
    @pick="agent.switchSession"
    @remove="agent.removeSession"
  />
</template>

<!-- PART_SCRIPT -->

<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useAgentChatStore } from '@/store/modules/agentChat'
  import { useAiChatStore } from '@/store/modules/aiChat'
  import { useModelConfigStore } from '@/store/modules/modelConfig'
  import { useAgentChatSettingStore } from '@/store/modules/agentChatSetting'
  import { useAgUiAgent } from './composables/useAgUiAgent'
  import { useAgentMode } from './composables/useAgentMode'
  import { syncSkillTools } from '@/agent/skills/skill-tools'
  import { registerNavTools } from '@/agent/nav-tools'
  import { registerMemoryTools } from '@/agent/memory-tools'
  import { registerWebTools } from '@/agent/web-tools'
  import AgentDockedShell from './widget/modes/AgentDockedShell.vue'
  import AgentFloatingShell from './widget/modes/AgentFloatingShell.vue'
  import AgentFullscreenShell from './widget/modes/AgentFullscreenShell.vue'
  import AgentPanelToggle from './widget/AgentPanelToggle.vue'
  import ModelConfigDialog from './widget/ModelConfigDialog.vue'
  import AgentHistoryDrawer from './widget/AgentHistoryDrawer.vue'

  defineOptions({ name: 'ArtAgentChat' })

  /** 移动端断点（与 $device-ipad 一致） */
  const MOBILE_BREAKPOINT = 800
  /** 智能体名称 */
  const AGENT_NAME = 'AG-UI 智能体'

  /** 面板 UI 状态（模式/可见/宽度/移动端） */
  const panel = useAgentChatStore()
  /** 对话内容状态（AG-UI 归约结果） */
  const chatStore = useAiChatStore()
  const modelStore = useModelConfigStore()
  const chatSettingStore = useAgentChatSettingStore()

  /** 当前展示模式 */
  const { mode } = storeToRefs(panel)

  /** 移动端断点（收敛到 store，供布局共享） */
  const isMobile = computed(() => panel.isMobile)

  /**
   * 是否渲染为停靠态外壳：停靠模式，或移动端下的悬浮模式（C4 降级）。
   * 停靠外壳自带展开手柄，故此时顶层不再重复渲染手柄。
   */
  const isDockedLike = computed(() => mode.value === 'docked' || (mode.value === 'floating' && isMobile.value))

  /**
   * 模式编排单实例：模式切换 + 悬浮窗拖动/缩放/几何。
   * 只在此顶层创建一次，供三种外壳共用（悬浮态由 C 阶段接入其拖动/缩放处理器）。
   */
  const agentMode = useAgentMode()

  /**
   * AG-UI 编排单实例（D10）：只在此顶层创建一次，经 props 下发各模式外壳。
   * 切模式时卸载的是外壳组件，本组件不卸载 → abortController 不被中断 → 流式回复不断。
   */
  const agent = useAgUiAgent()

  /** 模型配置弹窗可见性 */
  const configVisible = ref(false)
  /** 历史会话抽屉可见性 */
  const historyVisible = ref(false)

  /** 响应窗口尺寸，切换移动端抽屉模式 */
  const updateViewport = () => {
    panel.setMobile(window.innerWidth <= MOBILE_BREAKPOINT)
  }

  onMounted(() => {
    updateViewport()
    window.addEventListener('resize', updateViewport)
    // 初始化模型配置（从后端拉取配置与模型 / 恢复当前选择）
    void modelStore.init()
    // 初始化聊天个人设置（对话参数 / 界面偏好 / 提示词模板）
    void chatSettingStore.init()
    // 从后端拉取当前用户的历史会话列表（Markdown 文件存储）
    void chatStore.initSessions()
    // 拉取已启用技能的工具并注册进注册中心（全局工具，跨页面可用）
    void syncSkillTools()
    // 注册全局页面导航工具（ui.navigate，跨页面可用）
    registerNavTools()
    // 注册全局记忆建议工具（memory.suggest，跨页面可用）
    registerMemoryTools()
    // 注册全局网页工具（ui.openWeb 打开网页 / web.readPage 读取正文，跨页面可用）
    registerWebTools()
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateViewport)
  })
</script>
