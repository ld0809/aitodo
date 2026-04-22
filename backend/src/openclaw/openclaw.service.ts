import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { HttpAdapterHost } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { DataSource, In, Repository } from 'typeorm';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { OpenClawBinding } from '../database/entities/openclaw-binding.entity';
import { OpenClawDispatch } from '../database/entities/openclaw-dispatch.entity';
import { TodoProgressEntry } from '../database/entities/todo-progress.entity';
import { Todo } from '../database/entities/todo.entity';
import { User } from '../database/entities/user.entity';
import { UpdateOpenClawBindingDto } from './dto/update-openclaw-binding.dto';

type OpenClawConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'revoked';
const ACTIVE_DISPATCH_STATUSES = ['pending', 'dispatched', 'failed'] as const;

interface OpenClawSetupInfo {
  channelCode: string;
  accountId: string;
  wsUrl: string | null;
  docsUrl: string;
  pairingHint: string;
  pluginPackageName: string;
  pluginInstallCommand: string | null;
  pluginEnableCommand: string | null;
  pluginConfigSnippet: string | null;
  routingHint: string;
  sessionStrategy: 'per_todo';
}

interface OpenClawBindingResponse extends OpenClawSetupInfo {
  bound: boolean;
  connected: boolean;
  enabled: boolean;
  connectToken: string | null;
  deviceLabel: string | null;
  connectionStatus: OpenClawConnectionStatus | null;
  timeoutSeconds: number | null;
  lastSeenAt: string | null;
  lastDispatchedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  suggestedDeviceLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface SocketMeta {
  userId: string;
  bindingId: string;
}

interface PendingAiReportRequest {
  userId: string;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

@Injectable()
export class OpenClawService implements OnModuleInit, OnModuleDestroy {
  private webSocketServer: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();
  private readonly socketMeta = new WeakMap<WebSocket, SocketMeta>();
  private readonly pendingAiReportRequests = new Map<string, PendingAiReportRequest>();

  private resolveChannelCode() {
    return 'aitodo';
  }

  private resolveAccountId() {
    const explicitAccountId = process.env.OPENCLAW_CHANNEL_ACCOUNT_ID?.trim();
    if (explicitAccountId && /^[A-Za-z0-9_-]+$/.test(explicitAccountId)) {
      return explicitAccountId;
    }

    const legacyChannelCode = process.env.OPENCLAW_CHANNEL_CODE?.trim();
    if (legacyChannelCode && legacyChannelCode !== 'aitodo' && /^[A-Za-z0-9_-]+$/.test(legacyChannelCode)) {
      return legacyChannelCode;
    }

    return 'default';
  }

  constructor(
    @InjectRepository(OpenClawBinding)
    private readonly bindingRepository: Repository<OpenClawBinding>,
    @InjectRepository(OpenClawDispatch)
    private readonly dispatchRepository: Repository<OpenClawDispatch>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  onModuleInit() {
    const httpServer = this.httpAdapterHost.httpAdapter?.getHttpServer?.();
    if (!httpServer || typeof httpServer.on !== 'function' || this.webSocketServer) {
      return;
    }

    this.httpServer = httpServer as HttpServer;
    this.webSocketServer = new WebSocketServer({ noServer: true });
    this.webSocketServer.on('connection', (socket: WebSocket, request: IncomingMessage, binding: unknown, deviceLabel: string | null) => {
      void this.handleSocketConnected(socket, request, binding as OpenClawBinding, deviceLabel);
    });
    httpServer.on('upgrade', this.handleUpgrade);
  }

  onModuleDestroy() {
    if (this.httpServer?.off) {
      this.httpServer.off('upgrade', this.handleUpgrade);
    }
    this.webSocketServer?.close();
    for (const [dispatchId, pendingRequest] of this.pendingAiReportRequests.entries()) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.reject(new Error('openclaw service is shutting down'));
      this.pendingAiReportRequests.delete(dispatchId);
    }
  }

  async requestAiReport(userId: string, prompt: string): Promise<string> {
    const binding = await this.bindingRepository.findOne({ where: { userId } });
    if (!binding) {
      throw new BadRequestException('请先在设置中绑定 OpenClaw，再使用 AI 报告。');
    }

    const socket = this.pickActiveSocket(userId);
    if (!socket) {
      throw new BadRequestException('当前 OpenClaw 未连接，请先在本地 OpenClaw Gateway 中完成连接。');
    }

    const dispatchId = randomUUID();
    const timeoutMs = Math.max(1_000, Number(binding.timeoutSeconds || 900) * 1_000);
    const payload = {
      type: 'dispatch.todo',
      transport: 'openclaw_channel_plugin',
      channel: this.resolveChannelCode(),
      dispatchId,
      deviceLabel: binding.deviceLabel,
      timeoutSeconds: binding.timeoutSeconds,
      sessionKey: `${this.resolveChannelCode()}:report:${userId}`,
      task: {
        message: prompt,
        meta: {
          source: 'aitodo-ai-report',
          userId,
          reportType: 'progress_summary',
          reportMode: true,
          recommendedAgentRoute: 'reporter',
        },
      },
    };

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAiReportRequests.delete(dispatchId);
        reject(new Error('openclaw ai report timed out'));
      }, timeoutMs);

      this.pendingAiReportRequests.set(dispatchId, {
        userId,
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      try {
        this.sendSocketMessage(socket, payload);
        void this.bindingRepository.update(
          { id: binding.id },
          {
            connectionStatus: 'connected',
            lastDispatchedAt: new Date(),
            lastSeenAt: new Date(),
            lastError: null,
          },
        );
      } catch (error) {
        this.rejectPendingAiReportRequest(dispatchId, new Error(this.getErrorMessage(error)));
      }
    });
  }

  async getMyBinding(userId: string): Promise<OpenClawBindingResponse> {
    const user = await this.getUserOrThrow(userId);
    const binding = await this.bindingRepository.findOne({ where: { userId } });
    return this.toBindingResponse(binding, user);
  }

  async provisionMyBinding(userId: string): Promise<OpenClawBindingResponse> {
    const user = await this.getUserOrThrow(userId);
    const binding = await this.ensureBinding(userId, user, { regenerateToken: false });
    return this.toBindingResponse(binding, user);
  }

  async upsertMyBinding(userId: string, dto: UpdateOpenClawBindingDto): Promise<OpenClawBindingResponse> {
    const user = await this.getUserOrThrow(userId);
    const binding = await this.ensureBinding(userId, user, { regenerateToken: dto.rotateToken === true });

    if (dto.deviceLabel !== undefined) {
      binding.deviceLabel = this.normalizeOptionalString(dto.deviceLabel);
    }
    if (dto.enabled !== undefined) {
      binding.enabled = dto.enabled;
    }
    if (dto.timeoutSeconds !== undefined) {
      binding.timeoutSeconds = dto.timeoutSeconds;
    }
    if (!binding.connectionStatus || binding.connectionStatus === 'revoked') {
      binding.connectionStatus = 'pending';
    }
    const saved = await this.bindingRepository.save(binding);

    if (dto.rotateToken === true) {
      this.closeUserSockets(userId);
    }

    return this.toBindingResponse(saved, user);
  }

  async removeMyBinding(userId: string) {
    this.closeUserSockets(userId);
    await this.bindingRepository.delete({ userId });
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return this.toBindingResponse(null, user);
  }

  async onSharedTodoUpsert(todoId: string, triggeredByUserId: string) {
    const todo = await this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assignees', 'assignee')
      .where('todo.id = :todoId', { todoId })
      .getOne();

    if (!todo) {
      return;
    }

    await this.dispatchAssignedSharedTodo(
      {
        todoId: todo.id,
        cardId: todo.cardId ?? null,
        content: todo.content,
        ownerUserId: todo.userId,
      },
      todo.assignees ?? [],
      triggeredByUserId,
    );
  }

  async dispatchAssignedSharedTodo(
    todo: {
      todoId: string;
      cardId?: string | null;
      content: string;
      ownerUserId: string;
    },
    assignees: User[],
    triggeredByUserId: string,
  ) {
    const normalizedContent = todo.content.trim();
    const assigneeIds = assignees.map((item) => item.id);

    await this.supersedeDispatchesForRemovedAssignees(todo.todoId, assigneeIds);
    if (!normalizedContent || assignees.length === 0) {
      return;
    }

    const owner = await this.userRepository.findOne({ where: { id: todo.ownerUserId } });
    if (!owner) {
      return;
    }

    const bindings = (await this.bindingRepository.find({
      where: {
        userId: In(assigneeIds),
      },
    })).filter((item) => item.enabled && item.connectionStatus !== 'revoked');
    if (bindings.length === 0) {
      return;
    }

    const contentHash = this.buildContentHash(todo.content);
    for (const assignee of assignees) {
      const binding = bindings.find((item) => item.userId === assignee.id);
      if (!binding) {
        continue;
      }

      const existing = await this.dispatchRepository.findOne({
        where: {
          userId: assignee.id,
          todoId: todo.todoId,
          requestContentHash: contentHash,
        },
        order: {
          createdAt: 'DESC',
        },
      });
      if (existing && ['pending', 'dispatched', 'completed'].includes(existing.status)) {
        continue;
      }

      await this.supersedeDispatches(
        todo.todoId,
        [assignee.id],
        'todo content updated; newer dispatch created',
      );

      const dispatchId = randomUUID();
      const callbackToken = randomUUID().replace(/-/g, '');
      const callbackUrl = this.buildCallbackUrl(dispatchId, callbackToken);
      const payload = this.buildDispatchPayload(
        dispatchId,
        todo.todoId,
        todo.cardId ?? null,
        todo.content,
        owner,
        assignee,
        binding,
        callbackUrl,
      );

      const dispatch = await this.dispatchRepository.save(
        this.dispatchRepository.create({
          id: dispatchId,
          bindingId: binding.id,
          userId: assignee.id,
          todoId: todo.todoId,
          targetDeviceLabel: binding.deviceLabel,
          triggeredByUserId,
          status: 'pending',
          requestContentHash: contentHash,
          callbackToken,
          callbackUrl,
          requestPayloadJson: JSON.stringify(payload),
          gatewayResponseJson: null,
          resultText: null,
          failureReason: null,
          completedAt: null,
        }),
      );

      await this.tryDeliverDispatch(binding, dispatch, payload);
    }
  }

  async acceptCallback(dispatchId: string, callbackToken: string, payload: unknown) {
    const dispatch = await this.dispatchRepository.findOne({
      where: { id: dispatchId },
      relations: {
        binding: true,
        todo: true,
      },
    });
    if (!dispatch) {
      throw new NotFoundException('dispatch not found');
    }
    if (dispatch.callbackToken !== callbackToken) {
      throw new BadRequestException('invalid callback token');
    }
    if (dispatch.status === 'completed' || dispatch.status === 'superseded') {
      return { status: 'ignored' };
    }

    const resultText = this.extractResultText(payload);
    if (!resultText) {
      throw new BadRequestException('callback payload does not contain result text');
    }

    const accepted = await this.completeDispatch(dispatch, resultText, payload);
    return { status: accepted ? 'accepted' : 'ignored' };
  }

  private readonly handleUpgrade = async (request: IncomingMessage, socket: Socket, head: Buffer) => {
    if (!this.webSocketServer) {
      socket.destroy();
      return;
    }

    const parsedUrl = this.parseSocketUrl(request.url);
    if (!parsedUrl || parsedUrl.pathname !== '/api/v1/openclaw/ws') {
      return;
    }

    const token = parsedUrl.searchParams.get('token')?.trim();
    if (!token) {
      this.rejectUpgrade(socket, 401, 'missing token');
      return;
    }

    const binding = await this.bindingRepository.findOne({ where: { connectToken: token } });
    if (!binding || binding.connectionStatus === 'revoked') {
      this.rejectUpgrade(socket, 401, 'invalid token');
      return;
    }

    const deviceLabel = this.normalizeOptionalString(parsedUrl.searchParams.get('deviceLabel') ?? undefined);
    this.webSocketServer.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      this.webSocketServer?.emit('connection', ws, request, binding, deviceLabel);
    });
  };

  private async handleSocketConnected(socket: WebSocket, _request: unknown, binding: OpenClawBinding, deviceLabel: string | null) {
    const userSockets = this.socketsByUserId.get(binding.userId) ?? new Set<WebSocket>();
    userSockets.add(socket);
    this.socketsByUserId.set(binding.userId, userSockets);
    this.socketMeta.set(socket, { userId: binding.userId, bindingId: binding.id });

    const nextDeviceLabel = deviceLabel ?? binding.deviceLabel;
    await this.bindingRepository.update(
      { id: binding.id },
      {
        connectionStatus: 'connected',
        deviceLabel: nextDeviceLabel,
        lastSeenAt: new Date(),
        lastError: null,
      },
    );

    this.sendSocketMessage(socket, {
      type: 'aitodo.connected',
      channel: this.resolveChannelCode(),
      sessionStrategy: 'per_todo',
      routingHint: '请在本地 OpenClaw Gateway 中把 aitodo channel 路由到你的规划 agent。',
    });

    socket.on('message', (raw: RawData) => {
      void this.handleSocketMessage(socket, raw);
    });
    socket.on('close', () => {
      void this.handleSocketClose(socket);
    });
    socket.on('error', (error: unknown) => {
      void this.handleSocketError(socket, error);
    });

    await this.flushPendingDispatches(binding.userId);
  }

  private async handleSocketMessage(socket: WebSocket, raw: RawData) {
    const meta = this.socketMeta.get(socket);
    if (!meta) {
      return;
    }

    await this.bindingRepository.update({ id: meta.bindingId }, { lastSeenAt: new Date(), lastError: null });

    const text = this.coerceMessageText(raw);
    if (!text) {
      this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'empty message' });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'message must be valid JSON' });
      return;
    }

    if (!this.isRecord(payload)) {
      this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'invalid message payload' });
      return;
    }

    const type = typeof payload.type === 'string' ? payload.type : '';
    if (type === 'ping') {
      this.sendSocketMessage(socket, { type: 'pong', at: new Date().toISOString() });
      return;
    }

    if (type === 'hello') {
      const deviceLabel = this.normalizeOptionalString(
        typeof payload.deviceLabel === 'string' ? payload.deviceLabel : undefined,
      );
      if (deviceLabel !== undefined) {
        await this.bindingRepository.update({ id: meta.bindingId }, { deviceLabel });
      }
      await this.flushPendingDispatches(meta.userId);
      this.sendSocketMessage(socket, { type: 'hello.ack', status: 'ok' });
      return;
    }

    if (type === 'dispatch.result') {
      const dispatchId = typeof payload.dispatchId === 'string' ? payload.dispatchId : '';
      if (!dispatchId) {
        this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'dispatchId is required' });
        return;
      }

      const pendingReportHandled = this.completePendingAiReportRequest(
        dispatchId,
        meta.userId,
        payload.result ?? payload.payload ?? payload,
      );
      if (pendingReportHandled) {
        this.sendSocketMessage(socket, { type: 'dispatch.ack', dispatchId, status: 'accepted' });
        return;
      }

      const dispatch = await this.dispatchRepository.findOne({
        where: { id: dispatchId, userId: meta.userId },
        relations: {
          binding: true,
          todo: true,
        },
      });
      if (!dispatch) {
        this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'dispatch not found' });
        return;
      }

      const resultText = this.extractResultText(payload.result ?? payload.payload ?? payload);
      if (!resultText) {
        this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'result text is empty' });
        return;
      }

      const accepted = await this.completeDispatch(dispatch, resultText, payload);
      this.sendSocketMessage(socket, { type: 'dispatch.ack', dispatchId, status: accepted ? 'accepted' : 'ignored' });
      return;
    }

    if (type === 'dispatch.failed') {
      const dispatchId = typeof payload.dispatchId === 'string' ? payload.dispatchId : '';
      const reason = this.extractFailureReason(payload);
      if (!dispatchId) {
        this.sendSocketMessage(socket, { type: 'aitodo.error', error: 'dispatchId is required' });
        return;
      }

      const pendingReportFailed = this.failPendingAiReportRequest(dispatchId, meta.userId, reason);
      if (pendingReportFailed) {
        this.sendSocketMessage(socket, { type: 'dispatch.ack', dispatchId, status: 'failed_recorded' });
        return;
      }

      await this.markDispatchFailed(dispatchId, meta.userId, reason);
      this.sendSocketMessage(socket, { type: 'dispatch.ack', dispatchId, status: 'failed_recorded' });
      return;
    }

    this.sendSocketMessage(socket, { type: 'aitodo.error', error: `unsupported message type: ${type || 'unknown'}` });
  }

  private async handleSocketClose(socket: WebSocket) {
    const meta = this.socketMeta.get(socket);
    if (!meta) {
      return;
    }

    const userSockets = this.socketsByUserId.get(meta.userId);
    if (userSockets) {
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        this.socketsByUserId.delete(meta.userId);
        await this.bindingRepository.update(
          { id: meta.bindingId, connectionStatus: 'connected' },
          { connectionStatus: 'disconnected' },
        );
      }
    }
  }

  private async handleSocketError(socket: WebSocket, error: unknown) {
    const meta = this.socketMeta.get(socket);
    if (!meta) {
      return;
    }

    const message = this.getErrorMessage(error);
    await this.bindingRepository.update({ id: meta.bindingId }, { lastError: message });
  }

  private async tryDeliverDispatch(binding: OpenClawBinding, dispatch: OpenClawDispatch, payload: Record<string, unknown>) {
    const socket = this.pickActiveSocket(binding.userId);
    if (!socket) {
      await this.bindingRepository.update(
        { id: binding.id },
        {
          connectionStatus: binding.connectionStatus === 'revoked' ? 'revoked' : 'pending',
          lastError: '本地 OpenClaw 还没有连上 AITodo，任务已保留为待发送。',
        },
      );
      return;
    }

    try {
      this.sendSocketMessage(socket, payload);
      dispatch.status = 'dispatched';
      dispatch.gatewayResponseJson = this.safeStringify({
        transport: 'openclaw_channel_plugin',
        deliveredAt: new Date().toISOString(),
      });
      dispatch.failureReason = null;
      await this.dispatchRepository.save(dispatch);

      await this.bindingRepository.update(
        { id: binding.id },
        {
          connectionStatus: 'connected',
          lastDispatchedAt: new Date(),
          lastSeenAt: new Date(),
          lastError: null,
        },
      );
    } catch (error) {
      const message = this.getErrorMessage(error);
      dispatch.status = 'pending';
      dispatch.failureReason = null;
      dispatch.gatewayResponseJson = this.safeStringify({
        transport: 'openclaw_channel_plugin',
        queued: true,
        reason: message,
      });
      await this.dispatchRepository.save(dispatch);

      await this.bindingRepository.update(
        { id: binding.id },
        {
          connectionStatus: 'disconnected',
          lastError: message,
        },
      );
    }
  }

  private async flushPendingDispatches(userId: string) {
    const socket = this.pickActiveSocket(userId);
    if (!socket) {
      return;
    }

    const pendingDispatches = await this.dispatchRepository.find({
      where: {
        userId,
        status: 'pending',
      },
      relations: {
        binding: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    for (const dispatch of pendingDispatches) {
      if (!dispatch.binding?.enabled) {
        continue;
      }

      const payload = this.safeParseRecord(dispatch.requestPayloadJson);
      if (!payload) {
        await this.markDispatchFailed(dispatch.id, userId, 'dispatch payload is invalid');
        continue;
      }

      await this.tryDeliverDispatch(dispatch.binding, dispatch, payload);
    }
  }

  private async completeDispatch(dispatch: OpenClawDispatch, resultText: string, rawPayload: unknown) {
    const normalizedResult = resultText.trim();
    if (!normalizedResult) {
      throw new BadRequestException('openclaw result is empty');
    }

    return this.dataSource.transaction(async (manager) => {
      const todoRepository = manager.getRepository(Todo);
      const dispatchRepository = manager.getRepository(OpenClawDispatch);
      const bindingRepository = manager.getRepository(OpenClawBinding);
      const progressRepository = manager.getRepository(TodoProgressEntry);

      const latestDispatch = await dispatchRepository.findOne({
        where: { id: dispatch.id },
        relations: {
          binding: true,
          todo: true,
        },
      });
      if (!latestDispatch || latestDispatch.status === 'completed' || latestDispatch.status === 'superseded') {
        return false;
      }

      const todo = await todoRepository.findOne({ where: { id: latestDispatch.todoId } });
      if (!todo) {
        throw new NotFoundException('todo not found');
      }

      await progressRepository.save(
        progressRepository.create({
          userId: latestDispatch.userId,
          todoId: latestDispatch.todoId,
          content: this.buildProgressContent(normalizedResult),
        }),
      );

      todo.progressCount += 1;
      await todoRepository.save(todo);

      latestDispatch.status = 'completed';
      latestDispatch.resultText = normalizedResult;
      latestDispatch.gatewayResponseJson = this.safeStringify(rawPayload);
      latestDispatch.failureReason = null;
      latestDispatch.completedAt = new Date();
      await dispatchRepository.save(latestDispatch);

      const binding = latestDispatch.binding;
      binding.lastDispatchedAt = binding.lastDispatchedAt ?? new Date();
      binding.lastCompletedAt = latestDispatch.completedAt;
      binding.lastSeenAt = new Date();
      binding.connectionStatus = 'connected';
      binding.lastError = null;
      await bindingRepository.save(binding);
      return true;
    });
  }

  private async markDispatchFailed(dispatchId: string, userId: string, reason: string) {
    const dispatch = await this.dispatchRepository.findOne({
      where: { id: dispatchId, userId },
      relations: {
        binding: true,
      },
    });
    if (!dispatch || dispatch.status === 'completed' || dispatch.status === 'superseded') {
      return;
    }

    dispatch.status = 'failed';
    dispatch.failureReason = reason;
    dispatch.gatewayResponseJson = this.safeStringify({
      transport: 'openclaw_channel_plugin',
      failedAt: new Date().toISOString(),
      reason,
    });
    await this.dispatchRepository.save(dispatch);

    if (dispatch.binding) {
      await this.bindingRepository.update(
        { id: dispatch.binding.id },
        {
          lastError: reason,
          lastSeenAt: new Date(),
        },
      );
    }
  }

  private buildDispatchPayload(
    dispatchId: string,
    todoId: string,
    cardId: string | null,
    todoContent: string,
    owner: Pick<User, 'email' | 'nickname'>,
    assignee: Pick<User, 'id' | 'email' | 'nickname'>,
    binding: OpenClawBinding,
    callbackUrl: string | null,
  ) {
    const ownerIdentity = owner.nickname?.trim() || owner.email;
    const assigneeIdentity = assignee.nickname?.trim() || assignee.email;
    const message = [
      '你现在是 AI 待办系统里的执行助理，需要先做任务规划和方案设计，不要直接开始实施。',
      `当前接收人：${assigneeIdentity}`,
      `待办创建人：${ownerIdentity}`,
      `待办内容：${todoContent}`,
      '输出要求：',
      '1. 使用中文输出。',
      '2. 至少包含「目标理解」「实施拆解」「风险与依赖」「建议下一步」四个部分。',
      '3. 聚焦方案设计，不要编造已经完成的事实。',
    ].join('\n');

    return {
      type: 'dispatch.todo',
      transport: 'openclaw_channel_plugin',
      channel: this.resolveChannelCode(),
      dispatchId,
      deviceLabel: binding.deviceLabel,
      timeoutSeconds: binding.timeoutSeconds,
      sessionKey: this.buildSessionKey(todoId),
      callbackUrl: callbackUrl ?? undefined,
      task: {
        message,
        meta: {
          todoId,
          cardId,
          assigneeUserId: assignee.id,
          source: 'aitodo-shared-todo',
          recommendedAgentRoute: 'planner',
        },
      },
    };
  }

  private buildCallbackUrl(dispatchId: string, callbackToken: string) {
    const baseUrl = this.resolvePublicBaseUrl();
    if (!baseUrl) {
      return null;
    }
    return `${baseUrl}/openclaw/callbacks/${dispatchId}/${callbackToken}`;
  }

  private resolvePublicBaseUrl() {
    const rawBaseUrl = process.env.OPENCLAW_PUBLIC_BASE_URL?.trim() || process.env.PUBLIC_API_BASE_URL?.trim();
    if (!rawBaseUrl) {
      return null;
    }
    return rawBaseUrl.replace(/\/$/, '');
  }

  private resolveWebSocketUrl() {
    const explicit = process.env.OPENCLAW_PLUGIN_WS_URL?.trim()
      || process.env.OPENCLAW_WS_URL?.trim()
      || process.env.OPENCLAW_BRIDGE_WS_URL?.trim();
    if (explicit) {
      return this.ensureWsEndpoint(explicit);
    }

    const publicBaseUrl = this.resolvePublicBaseUrl();
    if (!publicBaseUrl) {
      return null;
    }

    return this.ensureWsEndpoint(publicBaseUrl.replace(/^http/i, 'ws'));
  }

  private ensureWsEndpoint(url: string) {
    const normalized = url.replace(/\/$/, '');
    if (normalized.endsWith('/openclaw/ws')) {
      return normalized;
    }
    return `${normalized}/openclaw/ws`;
  }

  private buildProgressContent(resultText: string) {
    return `【OpenClaw方案设计】\n${resultText}`;
  }

  private buildContentHash(content: string) {
    return createHash('sha256').update(content.trim()).digest('hex');
  }

  private async supersedeDispatchesForRemovedAssignees(todoId: string, activeAssigneeIds: string[]) {
    const activeDispatches = await this.dispatchRepository.find({
      where: {
        todoId,
        status: In([...ACTIVE_DISPATCH_STATUSES]),
      },
    });
    const activeAssigneeIdSet = new Set(activeAssigneeIds);
    const removedAssigneeIds = Array.from(
      new Set(
        activeDispatches
          .map((dispatch) => dispatch.userId)
          .filter((userId) => !activeAssigneeIdSet.has(userId)),
      ),
    );

    if (removedAssigneeIds.length === 0) {
      return;
    }

    await this.supersedeDispatches(todoId, removedAssigneeIds, 'assignee removed from todo');
  }

  private async supersedeDispatches(todoId: string, userIds: string[], reason: string) {
    if (userIds.length === 0) {
      return;
    }

    const now = new Date();
    await this.dispatchRepository
      .createQueryBuilder()
      .update(OpenClawDispatch)
      .set({
        status: 'superseded',
        failureReason: reason,
        gatewayResponseJson: JSON.stringify({
          transport: 'openclaw_channel_plugin',
          supersededAt: now.toISOString(),
          reason,
        }),
        updatedAt: now,
      })
      .where('todo_id = :todoId', { todoId })
      .andWhere('user_id IN (:...userIds)', { userIds })
      .andWhere('status IN (:...statuses)', { statuses: [...ACTIVE_DISPATCH_STATUSES] })
      .execute();
  }

  private normalizeOptionalString(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return user;
  }

  private async ensureBinding(
    userId: string,
    user: Pick<User, 'email' | 'nickname'>,
    options?: {
      regenerateToken?: boolean;
    },
  ) {
    let binding = await this.bindingRepository.findOne({ where: { userId } });
    if (!binding) {
      binding = this.bindingRepository.create({
        userId,
        connectToken: this.createConnectToken(),
        deviceLabel: this.buildSuggestedDeviceLabel(user),
        connectionStatus: 'pending',
        enabled: false,
        timeoutSeconds: 900,
        lastSeenAt: null,
        lastDispatchedAt: null,
        lastCompletedAt: null,
        lastError: null,
      });
      return this.bindingRepository.save(binding);
    }

    if (options?.regenerateToken || !binding.connectToken) {
      binding.connectToken = this.createConnectToken();
      binding.connectionStatus = 'pending';
      binding.lastError = null;
    }
    if (!binding.deviceLabel) {
      binding.deviceLabel = this.buildSuggestedDeviceLabel(user);
    }
    return this.bindingRepository.save(binding);
  }

  private createConnectToken() {
    return randomUUID().replace(/-/g, '');
  }

  private toBindingResponse(binding: OpenClawBinding | null, user: Pick<User, 'email' | 'nickname'> | null): OpenClawBindingResponse {
    const setupInfo = this.buildSetupInfo(binding, user);
    if (!binding) {
      return {
        bound: false,
        connected: false,
        enabled: false,
        connectToken: null,
        deviceLabel: null,
        connectionStatus: null,
        timeoutSeconds: null,
        lastSeenAt: null,
        lastDispatchedAt: null,
        lastCompletedAt: null,
        lastError: null,
        suggestedDeviceLabel: this.buildSuggestedDeviceLabel(user),
        createdAt: null,
        updatedAt: null,
        ...setupInfo,
      };
    }

    const connected = binding.connectionStatus === 'connected';
    return {
      bound: connected || binding.connectionStatus === 'disconnected',
      connected,
      enabled: binding.enabled,
      connectToken: binding.connectToken,
      deviceLabel: binding.deviceLabel,
      connectionStatus: binding.connectionStatus,
      timeoutSeconds: binding.timeoutSeconds,
      lastSeenAt: binding.lastSeenAt?.toISOString() ?? null,
      lastDispatchedAt: binding.lastDispatchedAt?.toISOString() ?? null,
      lastCompletedAt: binding.lastCompletedAt?.toISOString() ?? null,
      lastError: binding.lastError,
      suggestedDeviceLabel: this.buildSuggestedDeviceLabel(user),
      createdAt: binding.createdAt?.toISOString() ?? null,
      updatedAt: binding.updatedAt?.toISOString() ?? null,
      ...setupInfo,
    };
  }

  private buildSetupInfo(binding: OpenClawBinding | null, user: Pick<User, 'email' | 'nickname'> | null): OpenClawSetupInfo {
    const channelCode = this.resolveChannelCode();
    const accountId = this.resolveAccountId();
    const pluginPackageName = this.resolvePluginPackageName();
    const wsUrl = this.resolveWebSocketUrl();
    const docsUrl = 'https://docs.openclaw.ai/zh-CN/channels/channel-routing';
    const pairingHint = accountId === 'default'
      ? '不需要公网 IP。请在本地 OpenClaw Gateway 安装并启用 aitodo channel 插件，让本地主动长连 AITodo。'
      : `不需要公网 IP。请在本地 OpenClaw Gateway 的 aitodo channel 下新增 account ${accountId}，让本地主动长连 AITodo。`;
    const suggestedDeviceLabel = this.buildSuggestedDeviceLabel(user);
    const pluginInstallCommand = this.buildPluginInstallCommand(pluginPackageName);
    const pluginEnableCommand = binding?.connectToken && wsUrl
      ? this.buildPluginEnableCommand(
          pluginPackageName,
          wsUrl,
          binding.connectToken,
          binding.deviceLabel ?? suggestedDeviceLabel,
          channelCode,
          accountId,
        )
      : null;

    const pluginConfigSnippet = binding?.connectToken && wsUrl
      ? JSON.stringify(
          accountId === 'default'
            ? {
                channels: {
                  [channelCode]: {
                    enabled: true,
                    url: wsUrl,
                    token: binding.connectToken,
                    deviceName: binding.deviceLabel ?? suggestedDeviceLabel,
                    routingPeerTemplate: '{serverSessionKey}',
                    rules: [
                      {
                        field: 'cardId',
                        pattern: '^shared-card-id$',
                        routingPeerTemplate: `${channelCode}:card:{cardId}`,
                      },
                    ],
                  },
                },
              }
            : {
                channels: {
                  [channelCode]: {
                    accounts: {
                      [accountId]: {
                        enabled: true,
                        url: wsUrl,
                        token: binding.connectToken,
                        deviceName: binding.deviceLabel ?? suggestedDeviceLabel,
                        routingPeerTemplate: '{serverSessionKey}',
                        rules: [
                          {
                            field: 'cardId',
                            pattern: '^shared-card-id$',
                            routingPeerTemplate: `${channelCode}:card:{cardId}`,
                          },
                        ],
                      },
                    },
                  },
                },
              },
          null,
          2,
        )
      : null;

    return {
      channelCode,
      accountId,
      wsUrl,
      docsUrl,
      pairingHint,
      pluginPackageName,
      pluginInstallCommand,
      pluginEnableCommand,
      pluginConfigSnippet,
      routingHint: accountId === 'default'
        ? `默认按 todoId 隔离 session；如需按 cardId 聚合或把指定 cardId 路由到不同 agent，请在 channels.${channelCode}.rules 与顶层 bindings 中配合 peer=${channelCode}:card:{cardId} 使用。`
        : `默认按 todoId 隔离 session；当前建议把环境隔离在 channels.${channelCode}.accounts.${accountId} 下。如需按 cardId 聚合，可继续配 peer=${channelCode}:card:{cardId}。`,
      sessionStrategy: 'per_todo',
    };
  }

  private resolvePluginPackageName() {
    return process.env.OPENCLAW_PLUGIN_PACKAGE_NAME?.trim() || '@ld0809/openclaw-channel-aitodo';
  }

  private buildPluginInstallCommand(pluginPackageName: string) {
    const template = process.env.OPENCLAW_PLUGIN_INSTALL_COMMAND_TEMPLATE?.trim()
      || 'openclaw plugins install {{pluginPackageName}}';
    return template.replaceAll('{{pluginPackageName}}', pluginPackageName);
  }

  private buildPluginEnableCommand(
    pluginPackageName: string,
    wsUrl: string,
    token: string,
    deviceLabel: string | null,
    channelCode: string,
    accountId: string,
  ) {
    const rawTemplate = process.env.OPENCLAW_PLUGIN_ENABLE_COMMAND_TEMPLATE?.trim()
      || "openclaw config set channels.{{channelCode}} '{\"enabled\":true,\"url\":\"{{wsUrl}}\",\"token\":\"{{token}}\",\"deviceName\":\"{{deviceLabel}}\"}' --strict-json";
    if (!rawTemplate) {
      return null;
    }

    const targetPath = accountId === 'default'
      ? `channels.${channelCode}`
      : `channels.${channelCode}.accounts.${accountId}`;
    const template = rawTemplate.includes('{{channelCode}}')
      ? rawTemplate.replace(/channels\.\{\{channelCode\}\}/g, targetPath)
      : rawTemplate.replace(/channels\.aitodo(\.accounts\.[A-Za-z0-9_-]+)?\b/g, targetPath);

    return template
      .replaceAll('{{pluginPackageName}}', pluginPackageName)
      .replaceAll('{{channelCode}}', channelCode)
      .replaceAll('{{accountId}}', accountId)
      .replaceAll('{{wsUrl}}', wsUrl)
      .replaceAll('{{token}}', token)
      .replaceAll('{{deviceLabel}}', deviceLabel ?? 'aitodo-local');
  }

  private buildSuggestedDeviceLabel(user: Pick<User, 'email' | 'nickname'> | null) {
    const base = user?.nickname?.trim() || user?.email?.split('@')[0] || 'aitodo-user';
    return `aitodo-${base.replace(/\s+/g, '-').toLowerCase()}`;
  }

  private buildSessionKey(todoId: string) {
    return `${this.resolveChannelCode()}:todo:${todoId}`;
  }

  private extractResultText(payload: unknown): string | null {
    const visited = new Set<unknown>();

    const visit = (value: unknown): string | null => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      }
      if (!value || typeof value !== 'object') {
        return null;
      }
      if (visited.has(value)) {
        return null;
      }
      visited.add(value);

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = visit(item);
          if (found) {
            return found;
          }
        }
        return null;
      }

      const record = value as Record<string, unknown>;
      const directKeys = ['result', 'text', 'summary', 'output', 'message', 'content', 'finalText', 'finalOutput'];
      for (const key of directKeys) {
        const candidate = record[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          return candidate.trim();
        }
      }

      const nestedKeys = ['data', 'body', 'event', 'response', 'payload'];
      for (const key of nestedKeys) {
        const found = visit(record[key]);
        if (found) {
          return found;
        }
      }

      return null;
    };

    return visit(payload);
  }

  private extractFailureReason(payload: Record<string, unknown>) {
    const value = payload.reason ?? payload.error ?? payload.message;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return 'openclaw dispatch failed';
  }

  private safeStringify(payload: unknown) {
    try {
      return JSON.stringify(payload);
    } catch {
      return null;
    }
  }

  private safeParseRecord(payload: string | null) {
    if (!payload) {
      return null;
    }
    try {
      const parsed = JSON.parse(payload) as unknown;
      return this.isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }
    return 'unknown openclaw error';
  }

  private parseSocketUrl(rawUrl?: string) {
    if (!rawUrl) {
      return null;
    }
    try {
      return new URL(rawUrl, 'http://localhost');
    } catch {
      return null;
    }
  }

  private rejectUpgrade(socket: Socket, statusCode: number, reason: string) {
    if (socket.writable) {
      socket.write(`HTTP/1.1 ${statusCode} Unauthorized\r\nConnection: close\r\n\r\n${reason}`);
    }
    socket.destroy();
  }

  private coerceMessageText(raw: RawData) {
    if (typeof raw === 'string') {
      return raw;
    }
    if (Buffer.isBuffer(raw)) {
      return raw.toString('utf8');
    }
    if (Array.isArray(raw)) {
      return Buffer.concat(raw.filter((item): item is Buffer => Buffer.isBuffer(item))).toString('utf8');
    }
    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private sendSocketMessage(socket: WebSocket, payload: Record<string, unknown>) {
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error('socket is not open');
    }
    socket.send(JSON.stringify(payload));
  }

  private completePendingAiReportRequest(dispatchId: string, userId: string, payload: unknown) {
    const request = this.pendingAiReportRequests.get(dispatchId);
    if (!request || request.userId !== userId) {
      return false;
    }

    const resultText = this.extractResultText(payload);
    if (!resultText) {
      this.rejectPendingAiReportRequest(dispatchId, new Error('openclaw result is empty'));
      return true;
    }

    this.pendingAiReportRequests.delete(dispatchId);
    request.resolve(resultText);
    return true;
  }

  private failPendingAiReportRequest(dispatchId: string, userId: string, reason: string) {
    const request = this.pendingAiReportRequests.get(dispatchId);
    if (!request || request.userId !== userId) {
      return false;
    }

    this.rejectPendingAiReportRequest(dispatchId, new Error(reason));
    return true;
  }

  private rejectPendingAiReportRequest(dispatchId: string, error: Error) {
    const request = this.pendingAiReportRequests.get(dispatchId);
    if (!request) {
      return;
    }

    this.pendingAiReportRequests.delete(dispatchId);
    request.reject(error);
  }

  private pickActiveSocket(userId: string): WebSocket | null {
    const sockets = this.socketsByUserId.get(userId);
    if (!sockets || sockets.size === 0) {
      return null;
    }

    const activeSockets = Array.from(sockets).filter((socket) => socket.readyState === WebSocket.OPEN);
    if (activeSockets.length === 0) {
      return null;
    }
    return activeSockets[activeSockets.length - 1] ?? null;
  }

  private closeUserSockets(userId: string) {
    const sockets = this.socketsByUserId.get(userId);
    if (!sockets) {
      return;
    }
    for (const socket of sockets) {
      try {
        socket.close();
      } catch {
        // Ignore close errors while rotating token or deleting binding.
      }
    }
    this.socketsByUserId.delete(userId);
  }
}
