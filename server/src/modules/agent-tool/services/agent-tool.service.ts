import { Injectable, OnModuleInit, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';
import { SecurityCheckService } from '@/modules/security-policy/services/security-check.service';
import { TOOL_TYPES, TOOL_HIGH_RISK_LEVELS } from '../catalog/agent-tool.enums';

/** 工具列表筛选条件 */
export interface ToolListFilter {
  keyword?: string;
  type?: string;
  riskLevel?: string;
  status?: number;
  page?: number;
  pageSize?: number;
}

/** 工具动作 → 安全校验 actionType 映射（工具 type 决定校验维度） */
const TOOL_TYPE_TO_ACTION: Record<string, string> = {
  cli: 'cli',
  api: 'api',
  database: 'database',
  filesystem: 'file',
  page: 'page',
  browser: 'page',
  external: 'api',
};

/**
 * 智能体工具服务
 *
 * 管理 SysAgentTool 的 CRUD、统计、分类计数与调用日志。
 * checkToolPermission 委托 SecurityCheckService，使工具校验与安全策略统一（风险等级/黑白名单/敏感词/审批）。
 * 启动时幂等 seed 7 条示例工具（对齐前端 mockAgentTools）。
 */
@Injectable()
export class AgentToolService implements OnModuleInit {
  private readonly logger = new Logger(AgentToolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityCheck: SecurityCheckService,
  ) {}

  /** 启动时幂等初始化示例工具（表为空时写入） */
  async onModuleInit(): Promise<void> {
    try {
      if ((await this.prisma.sysAgentTool.count()) > 0) return;
      await this.seedTools();
      this.logger.log('已初始化示例工具');
    } catch (e) {
      this.logger.error(`工具种子初始化失败: ${(e as Error).message}`);
    }
  }

  /** 幂等 seed 7 条示例工具 */
  private async seedTools(): Promise<void> {
    await this.prisma.sysAgentTool.createMany({
      data: [
        { toolKey: 'backend-generator', name: 'backend-generator', type: 'cli', description: '基于模板生成后端项目结构与代码', riskLevel: 'L3', enabled: true, requireConfirm: true, applicableAgents: ['AG-UI 智能体'], config: { command: 'npm run generate:backend -- --module {{moduleName}}', workDir: '/workspace/project', timeout: 60 }, sort: 1 },
        { toolKey: 'page-generator', name: 'page-generator', type: 'cli', description: '根据需求生成前端页面代码并预览', riskLevel: 'L2', enabled: true, requireConfirm: false, applicableAgents: ['AG-UI 智能体'], config: { command: 'npm run generate:page -- --name {{pageName}}', timeout: 45 }, sort: 2 },
        { toolKey: 'database-query', name: 'database-query', type: 'database', description: '执行只读 SQL 查询并返回结果', riskLevel: 'L1', enabled: true, requireConfirm: false, applicableAgents: ['AG-UI 智能体'], config: { scope: 'read', maxRows: 1000, sqlTimeout: 10 }, sort: 3 },
        { toolKey: 'file-writer', name: 'file-writer', type: 'filesystem', description: '在指定路径写入或更新文件内容', riskLevel: 'L2', enabled: true, requireConfirm: false, applicableAgents: ['AG-UI 智能体'], config: { allowWrite: true, allowDelete: false, maxFileSize: 5 }, sort: 4 },
        { toolKey: 'user-api', name: 'user-api', type: 'api', description: '获取用户信息与权限数据', riskLevel: 'L1', enabled: true, requireConfirm: false, applicableAgents: ['AG-UI 智能体'], config: { method: 'GET', url: '/api/user/info', timeout: 15 }, sort: 5 },
        { toolKey: 'browser-control', name: 'browser-control', type: 'browser', description: '允许智能体控制页面点击、输入、跳转', riskLevel: 'L3', enabled: true, requireConfirm: true, applicableAgents: ['AG-UI 智能体'], config: { allowClick: true, allowInput: true, allowNavigate: true }, sort: 6 },
        { toolKey: 'department-create-api', name: 'department-create-api', type: 'api', description: '创建或编辑部门数据', riskLevel: 'L2', enabled: false, requireConfirm: true, applicableAgents: ['AG-UI 智能体'], config: { method: 'POST', url: '/api/department/save', allowWrite: true }, sort: 7 },
      ],
    });
  }

  /** 工具列表（筛选 + 分页） */
  async listWithFilter(filter: ToolListFilter) {
    const page = Math.max(filter.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filter.pageSize ?? 10, 1), 100);
    const where: Record<string, unknown> = {};
    if (filter.keyword) {
      where.OR = [{ name: { contains: filter.keyword } }, { description: { contains: filter.keyword } }];
    }
    if (filter.type) where.type = filter.type;
    if (filter.riskLevel) where.riskLevel = filter.riskLevel;
    if (filter.status === 0 || filter.status === 1) where.enabled = filter.status === 1;
    const [list, total] = await Promise.all([
      this.prisma.sysAgentTool.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { sort: 'asc' },
      }),
      this.prisma.sysAgentTool.count({ where }),
    ]);
    return { list, pagination: { page, pageSize, total } };
  }

  /** 新建工具 */
  async createTool(data: {
    toolKey: string;
    name: string;
    type: string;
    description?: string;
    riskLevel?: string;
    enabled?: boolean;
    requireConfirm?: boolean;
    applicableAgents?: string[];
    config?: Record<string, unknown>;
    sort?: number;
  }): Promise<{ id: number }> {
    const dup = await this.prisma.sysAgentTool.findUnique({ where: { toolKey: data.toolKey } });
    if (dup) throw new BadRequestException(`工具键已存在: ${data.toolKey}`);
    const created = await this.prisma.sysAgentTool.create({
      data: {
        toolKey: data.toolKey,
        name: data.name,
        type: data.type,
        description: data.description ?? null,
        riskLevel: data.riskLevel ?? 'L1',
        enabled: data.enabled ?? true,
        requireConfirm: data.requireConfirm ?? false,
        applicableAgents: data.applicableAgents ?? [],
        config: (data.config ?? {}) as object,
        sort: data.sort ?? 0,
      },
    });
    return { id: created.id };
  }

  /** 更新工具（不允许改 toolKey） */
  async updateTool(id: number, data: Record<string, unknown>): Promise<void> {
    await this.ensureExists(id);
    const { id: _omitId, toolKey: _omitKey, ...rest }: Record<string, unknown> = data;
    // config 需转 object 满足 Prisma InputJsonValue
    if (rest.config !== undefined) rest.config = rest.config as object;
    await this.prisma.sysAgentTool.update({ where: { id }, data: rest });
  }

  /** 切换启用状态 */
  async toggle(id: number, enabled: boolean): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.sysAgentTool.update({ where: { id }, data: { enabled } });
  }

  /** 删除工具 */
  async remove(id: number): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.sysAgentTool.delete({ where: { id } });
  }

  /** 工具存在性校验 */
  private async ensureExists(id: number) {
    const tool = await this.prisma.sysAgentTool.findUnique({ where: { id } });
    if (!tool) throw new BadRequestException(`工具不存在: ${id}`);
    return tool;
  }

  /** 顶部统计：全部/已启用/高风险(L3·L4)/今日调用 */
  async stats() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [total, enabled, highRisk, callsToday] = await Promise.all([
      this.prisma.sysAgentTool.count(),
      this.prisma.sysAgentTool.count({ where: { enabled: true } }),
      this.prisma.sysAgentTool.count({ where: { riskLevel: { in: TOOL_HIGH_RISK_LEVELS as string[] } } }),
      this.prisma.sysAgentToolCallLog.count({ where: { createTime: { gte: start } } }),
    ]);
    return { total, enabled, highRisk, callsToday };
  }

  /** 左侧分类计数：每种类型的工具数 */
  async categoryCounts() {
    const grouped = await this.prisma.sysAgentTool.groupBy({ by: ['type'], _count: { _all: true } });
    const map = new Map(grouped.map((g) => [g.type, g._count._all]));
    return TOOL_TYPES.map((key) => ({ key, count: map.get(key) ?? 0 }));
  }

  /** 记录一次工具调用日志（按 toolKey 反查工具 ID） */
  async recordCall(
    data: { toolKey: string; agent?: string; skill?: string; params?: Record<string, unknown>; success: boolean; durationMs?: number },
    operatorId?: number,
  ): Promise<void> {
    const tool = await this.prisma.sysAgentTool.findUnique({ where: { toolKey: data.toolKey } });
    if (!tool) return; // 无归属工具，不记录
    await this.prisma.sysAgentToolCallLog.create({
      data: {
        toolId: tool.id,
        toolKey: data.toolKey,
        agent: data.agent ?? null,
        skill: data.skill ?? null,
        params: (data.params ?? undefined) as object | undefined,
        success: data.success,
        durationMs: data.durationMs ?? 0,
        operatorId: operatorId ?? null,
      },
    });
  }

  /** 某工具的调用日志分页列表 */
  async callLogList(toolKey: string, page = 1, pageSize = 10) {
    const p = Math.max(page, 1);
    const ps = Math.min(Math.max(pageSize, 1), 100);
    const [list, total] = await Promise.all([
      this.prisma.sysAgentToolCallLog.findMany({
        where: { toolKey },
        skip: (p - 1) * ps,
        take: ps,
        orderBy: { createTime: 'desc' },
      }),
      this.prisma.sysAgentToolCallLog.count({ where: { toolKey } }),
    ]);
    return { list, pagination: { page: p, pageSize: ps, total } };
  }

  /**
   * 工具权限校验：委托统一安全策略校验（SecurityCheckService）。
   * 按工具 type 映射 actionType，把工具风险等级与载荷交给安全策略统一判定，
   * 使工具校验与安全策略（风险等级默认行为/黑白名单/敏感词/审批）保持一致。
   * @param toolKey 工具 key
   * @param action 调用动作（read/write/delete/execute，delete 强制确认）
   * @param payload 调用载荷（含 command/sql 等，供危险内容检测）
   * @param userId 发起用户 ID（写审计用）
   */
  async checkToolPermission(
    toolKey: string,
    action = 'execute',
    payload?: Record<string, unknown>,
    userId?: number,
  ) {
    const tool = await this.prisma.sysAgentTool.findUnique({ where: { toolKey } });
    if (!tool) {
      return { allowed: false, riskLevel: 'L4', requireConfirm: false, reason: '工具不存在或未注册' };
    }
    if (!tool.enabled) {
      return { allowed: false, riskLevel: tool.riskLevel, requireConfirm: false, reason: '工具已禁用，禁止执行' };
    }
    const actionType = TOOL_TYPE_TO_ACTION[tool.type] ?? 'skill';
    const p = (payload ?? {}) as Record<string, unknown>;
    // 委托安全策略统一校验：把工具风险等级、命令/SQL 从载荷提取交给 check
    const result = await this.securityCheck.check(
      {
        actionType,
        riskLevel: tool.riskLevel,
        command: typeof p.command === 'string' ? p.command : undefined,
        sql: typeof p.sql === 'string' ? p.sql : undefined,
        apiPath: typeof p.apiPath === 'string' ? p.apiPath : undefined,
        filePath: typeof p.filePath === 'string' ? p.filePath : undefined,
        toolKey,
        payload,
      },
      userId,
    );
    // delete 动作或工具自身要求确认 → 强制需确认
    const requireConfirm = result.requireConfirm || action === 'delete' || tool.requireConfirm;
    // 映射回工具权限结果结构（前端 ToolPermissionCheckResult）
    return {
      allowed: result.allowed,
      riskLevel: result.riskLevel,
      requireConfirm,
      reason: result.blockedReason,
    };
  }
}
