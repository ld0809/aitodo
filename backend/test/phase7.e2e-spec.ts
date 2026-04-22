import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { URL } from 'node:url';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { OpenClawBinding } from '../src/database/entities/openclaw-binding.entity';
import { OpenClawDispatch } from '../src/database/entities/openclaw-dispatch.entity';
import { User } from '../src/database/entities/user.entity';
import { OpenClawService } from '../src/openclaw/openclaw.service';

describe('Phase 7 - OpenClaw Assistant Integration (e2e)', () => {
  jest.setTimeout(20000);

  let app: INestApplication;
  const baseUrl = '/api/v1';

  const ownerEmail = `phase7_owner_${Date.now()}@test.com`;
  const memberEmail = `phase7_member_${Date.now()}@test.com`;
  const removedMemberEmail = `phase7_removed_${Date.now()}@test.com`;
  const password = 'Passw0rd123';

  let ownerToken = '';
  let memberToken = '';
  let removedMemberToken = '';
  let sharedCardId = '';
  let sharedTodoId = '';
  let memberMentionKey = '';
  let removedMemberMentionKey = '';
  let memberUserId = '';
  let dataSource: DataSource;
  let openClawService: OpenClawService;

  const getHttpApp = () => app.getHttpServer();
  const getData = <T>(body: unknown): T => {
    const payload = body as { data?: T };
    return payload.data ?? (body as T);
  };

  const waitForDispatchCount = async (todoId: string, expectedCount: number) => {
    const dispatchRepository = dataSource.getRepository(OpenClawDispatch);
    for (let index = 0; index < 20; index += 1) {
      const dispatches = await dispatchRepository.find({
        where: { todoId },
        order: { createdAt: 'ASC' },
      });
      if (dispatches.length === expectedCount) {
        return dispatches;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return dispatchRepository.find({
      where: { todoId },
      order: { createdAt: 'ASC' },
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'development';
    process.env.OPENCLAW_PUBLIC_BASE_URL = 'https://aitodo.test/api/v1';
    process.env.OPENCLAW_PLUGIN_WS_URL = 'wss://gateway.aitodo.test/api/v1/openclaw/ws';
    process.env.OPENCLAW_CHANNEL_CODE = 'aitodo_test';
    delete process.env.OPENCLAW_CHANNEL_ACCOUNT_ID;
    process.env.OPENCLAW_PLUGIN_PACKAGE_NAME = '@ld0809/openclaw-channel-aitodo';
    process.env.OPENCLAW_PLUGIN_INSTALL_COMMAND_TEMPLATE = 'openclaw plugins install {{pluginPackageName}}';
    process.env.OPENCLAW_PLUGIN_ENABLE_COMMAND_TEMPLATE =
      "openclaw config set channels.aitodo '{\"enabled\":true,\"url\":\"{{wsUrl}}\",\"token\":\"{{token}}\",\"deviceName\":\"{{deviceLabel}}\"}' --strict-json";
    process.env.AUTH_EXPOSE_VERIFY_CODE = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    dataSource = app.get(DataSource);
    openClawService = app.get(OpenClawService);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (app) {
      await app.close();
    }
  });

  const registerAndLogin = async (email: string) => {
    const registerRes = await request(getHttpApp()).post(`${baseUrl}/auth/register`).send({ email, password });
    expect(registerRes.status).toBe(201);
    const registerData = getData<{ debugVerificationCode?: string }>(registerRes.body);

    const verifyRes = await request(getHttpApp()).post(`${baseUrl}/auth/verify-email`).send({
      email,
      code: registerData.debugVerificationCode,
    });
    expect(verifyRes.status).toBe(201);

    const loginRes = await request(getHttpApp()).post(`${baseUrl}/auth/login`).send({ email, password });
    expect(loginRes.status).toBe(201);
    const loginData = getData<{ accessToken?: string; access_token?: string }>(loginRes.body);
    return loginData.accessToken ?? loginData.access_token ?? '';
  };

  const findUserIdByEmail = async (email: string) => {
    const row = await dataSource.getRepository(User).createQueryBuilder('user')
      .select(['user.id AS id'])
      .where('user.email = :email', { email })
      .getRawOne<{ id: string }>();
    return row?.id ?? '';
  };

  const provisionBinding = async (token: string, deviceLabel: string) => {
    const provisionRes = await request(getHttpApp())
      .post(`${baseUrl}/openclaw/me/provision`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(provisionRes.status).toBe(201);

    const bindRes = await request(getHttpApp())
      .patch(`${baseUrl}/openclaw/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceLabel,
        timeoutSeconds: 120,
        enabled: true,
      });
    expect(bindRes.status).toBe(200);
    return getData<{
      enabled: boolean;
      deviceLabel: string | null;
      timeoutSeconds: number | null;
      connectionStatus: string | null;
    }>(bindRes.body);
  };

  it('register owner/member users and provision openclaw bindings', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    memberToken = await registerAndLogin(memberEmail);
    removedMemberToken = await registerAndLogin(removedMemberEmail);
    memberUserId = await findUserIdByEmail(memberEmail);

    const provisionRes = await request(getHttpApp())
      .post(`${baseUrl}/openclaw/me/provision`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});
    expect(provisionRes.status).toBe(201);

    const provisionData = getData<{
      connectToken: string | null;
      wsUrl: string | null;
      channelCode: string;
      accountId: string;
      pluginPackageName: string;
      pluginInstallCommand: string | null;
      pluginEnableCommand: string | null;
      connectionStatus: string | null;
      sessionStrategy: string;
    }>(provisionRes.body);
    expect((provisionData.connectToken ?? '').length).toBeGreaterThan(10);
    expect(provisionData.wsUrl).toBe('wss://gateway.aitodo.test/api/v1/openclaw/ws');
    expect(provisionData.channelCode).toBe('aitodo');
    expect(provisionData.accountId).toBe('aitodo_test');
    expect(provisionData.pluginPackageName).toBe('@ld0809/openclaw-channel-aitodo');
    expect(provisionData.connectionStatus).toBe('pending');
    expect(String(provisionData.pluginInstallCommand ?? '')).toContain('openclaw plugins install');
    expect(String(provisionData.pluginEnableCommand ?? '')).toContain('openclaw config set channels.aitodo.accounts.aitodo_test');
    expect(provisionData.sessionStrategy).toBe('per_todo');

    const bindingData = await provisionBinding(memberToken, 'member-macbook');
    expect(bindingData.enabled).toBe(true);
    expect(bindingData.deviceLabel).toBe('member-macbook');
    expect(bindingData.timeoutSeconds).toBe(120);
    expect(bindingData.connectionStatus).toBe('pending');

    const removedBindingData = await provisionBinding(removedMemberToken, 'removed-member-macbook');
    expect(removedBindingData.enabled).toBe(true);
    expect(removedBindingData.deviceLabel).toBe('removed-member-macbook');
    expect(removedBindingData.timeoutSeconds).toBe(120);
    expect(removedBindingData.connectionStatus).toBe('pending');
  });

  it('manual ai report works even when auto dispatch is disabled', async () => {
    const bindingRepository = dataSource.getRepository(OpenClawBinding);
    const binding = await bindingRepository.findOneOrFail({ where: { userId: memberUserId } });
    await bindingRepository.update(
      { id: binding.id },
      {
        enabled: false,
        connectionStatus: 'connected',
      },
    );

    const fakeSocket = { readyState: 1 };
    const serviceAsAny = openClawService as unknown as {
      pickActiveSocket: (userId: string) => unknown;
      sendSocketMessage: (socket: unknown, payload: { dispatchId?: string }) => void;
      completePendingAiReportRequest: (dispatchId: string, userId: string, payload: unknown) => boolean;
    };
    const pickActiveSocketSpy = jest.spyOn(serviceAsAny, 'pickActiveSocket').mockReturnValue(fakeSocket);
    const sendSocketMessageSpy = jest.spyOn(serviceAsAny, 'sendSocketMessage').mockImplementation((_socket, payload) => {
      setTimeout(() => {
        if (payload.dispatchId) {
          serviceAsAny.completePendingAiReportRequest(payload.dispatchId, memberUserId, {
            result: 'manual report from openclaw',
          });
        }
      }, 0);
    });

    try {
      await expect(openClawService.requestAiReport(memberUserId, '请生成本周工作报告')).resolves.toContain('manual report');
    } finally {
      pickActiveSocketSpy.mockRestore();
      sendSocketMessageSpy.mockRestore();
      await bindingRepository.update(
        { id: binding.id },
        {
          enabled: true,
          connectionStatus: 'pending',
        },
      );
    }
  });

  it('owner creates shared card and assigned todo dispatches to member openclaw plugin channel', async () => {
    const createCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase7 Shared Card',
        cardType: 'shared',
        pluginType: 'local_todo',
        participantEmails: [memberEmail],
      });
    expect(createCardRes.status).toBe(201);
    const cardData = getData<{
      id: string;
      participants: Array<{ email: string; mentionKey: string }>;
    }>(createCardRes.body);
    sharedCardId = cardData.id;
    memberMentionKey = cardData.participants.find((item) => item.email.toLowerCase() === memberEmail.toLowerCase())?.mentionKey ?? '';
    expect(memberMentionKey.length).toBeGreaterThan(0);

    const createTodoRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cardId: sharedCardId,
        content: `请 @${memberMentionKey} 完成第七阶段方案设计`,
      });
    expect(createTodoRes.status).toBe(201);
    const createdTodo = getData<{ id: string; assignees?: Array<{ email: string }> }>(createTodoRes.body);
    sharedTodoId = createdTodo.id;
    expect((createdTodo.assignees ?? []).map((item) => item.email.toLowerCase())).toContain(memberEmail.toLowerCase());

    const createdDispatches = await waitForDispatchCount(sharedTodoId, 1);
    expect(createdDispatches).toHaveLength(1);
    const firstDispatch = createdDispatches[0];
    const payload = JSON.parse(firstDispatch?.requestPayloadJson ?? '{}') as {
      type?: string;
      transport?: string;
      channel?: string;
      sessionKey?: string;
      callbackUrl?: string;
      task?: {
        message?: string;
        meta?: {
          cardId?: string | null;
        };
      };
    };
    expect(payload).toMatchObject({
      type: 'dispatch.todo',
      transport: 'openclaw_channel_plugin',
      channel: 'aitodo',
    });
    expect(String(payload.sessionKey ?? '')).toContain('aitodo:todo:');
    expect(String(payload.task?.message ?? '')).toContain('第七阶段方案设计');
    expect(payload.task?.meta?.cardId).toBe(sharedCardId);
    expect(String(payload.callbackUrl ?? '')).toContain('/openclaw/callbacks/');
    expect(firstDispatch?.targetDeviceLabel).toBe('member-macbook');
    expect(firstDispatch?.status).toBe('pending');

  });

  it('updating shared todo content supersedes old dispatch and ignores stale callback', async () => {
    const dispatchRepository = dataSource.getRepository(OpenClawDispatch);
    const beforeUpdateDispatches = await dispatchRepository.find({
      where: { todoId: sharedTodoId },
      order: { createdAt: 'ASC' },
    });
    expect(beforeUpdateDispatches).toHaveLength(1);
    const staleDispatch = beforeUpdateDispatches[0];

    const updateTodoRes = await request(getHttpApp())
      .patch(`${baseUrl}/todos/${sharedTodoId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        content: `请 @${memberMentionKey} 完成第七阶段方案设计，并补充风险清单`,
      });
    expect(updateTodoRes.status).toBe(200);
    const updatedTodo = getData<{ assignees?: Array<{ email: string }> }>(updateTodoRes.body);
    expect((updatedTodo.assignees ?? []).map((item) => item.email.toLowerCase())).toContain(memberEmail.toLowerCase());

    const dispatches = await waitForDispatchCount(sharedTodoId, 2);
    expect(dispatches).toHaveLength(2);
    expect(dispatches[0]?.status).toBe('superseded');
    const latestDispatch = dispatches[1];
    const latestPayload = JSON.parse(latestDispatch?.requestPayloadJson ?? '{}') as { task?: { message?: string } };
    expect(String(latestPayload.task?.message ?? '')).toContain('补充风险清单');

    const staleCallbackPath = new URL(String(staleDispatch?.callbackUrl ?? '')).pathname;
    const staleCallbackRes = await request(getHttpApp())
      .post(staleCallbackPath)
      .send({
        result: '这是旧版本方案，不应该再写入进度',
      });
    expect(staleCallbackRes.status).toBe(201);
    expect(getData<{ status: string }>(staleCallbackRes.body).status).toBe('ignored');

    const callbackPath = new URL(String(latestDispatch?.callbackUrl ?? '')).pathname;
    const callbackRes = await request(getHttpApp())
      .post(callbackPath)
      .send({
        summary: '同步返回的方案总结',
      });
    expect(callbackRes.status).toBe(201);

    const progressRes = await request(getHttpApp())
      .get(`${baseUrl}/todos/${sharedTodoId}/progress`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(progressRes.status).toBe(200);
    const progressEntries = getData<Array<{ content: string }>>(progressRes.body);
    expect(progressEntries.some((entry) => entry.content.includes('这是旧版本方案'))).toBe(false);
    expect(progressEntries.some((entry) => entry.content.includes('同步返回的方案总结'))).toBe(true);
  });

  it('removing an assignee supersedes their queued dispatches', async () => {
    const createCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase7 Reassignment Card',
        cardType: 'shared',
        pluginType: 'local_todo',
        participantEmails: [memberEmail, removedMemberEmail],
      });
    expect(createCardRes.status).toBe(201);
    const cardData = getData<{
      id: string;
      participants: Array<{ email: string; mentionKey: string }>;
    }>(createCardRes.body);
    const reassignmentCardId = cardData.id;
    memberMentionKey = cardData.participants.find((item) => item.email.toLowerCase() === memberEmail.toLowerCase())?.mentionKey ?? '';
    removedMemberMentionKey =
      cardData.participants.find((item) => item.email.toLowerCase() === removedMemberEmail.toLowerCase())?.mentionKey ?? '';
    expect(memberMentionKey.length).toBeGreaterThan(0);
    expect(removedMemberMentionKey.length).toBeGreaterThan(0);

    const createTodoRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cardId: reassignmentCardId,
        content: `请 @${memberMentionKey} 和 @${removedMemberMentionKey} 一起准备实施方案`,
      });
    expect(createTodoRes.status).toBe(201);
    const createdTodo = getData<{ id: string }>(createTodoRes.body);

    const initialDispatches = await waitForDispatchCount(createdTodo.id, 2);
    expect(initialDispatches).toHaveLength(2);
    expect(initialDispatches.every((dispatch) => dispatch.status === 'pending')).toBe(true);

    const updateTodoRes = await request(getHttpApp())
      .patch(`${baseUrl}/todos/${createdTodo.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        content: `请 @${memberMentionKey} 独立完成实施方案`,
      });
    expect(updateTodoRes.status).toBe(200);

    const dispatchRepository = dataSource.getRepository(OpenClawDispatch);
    const allDispatches = await dispatchRepository.find({
      where: { todoId: createdTodo.id },
      order: { createdAt: 'ASC' },
    });
    const removedMemberDispatches = allDispatches.filter(
      (dispatch) => dispatch.targetDeviceLabel === 'removed-member-macbook',
    );
    expect(removedMemberDispatches.length).toBeGreaterThan(0);
    expect(removedMemberDispatches.every((dispatch) => dispatch.status === 'superseded')).toBe(true);
  });
});
