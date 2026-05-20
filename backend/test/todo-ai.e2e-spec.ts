import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { OpenClawBinding } from '../src/database/entities/openclaw-binding.entity';
import { TodoAiSession } from '../src/database/entities/todo-ai-session.entity';
import { User } from '../src/database/entities/user.entity';
import { OpenClawService } from '../src/openclaw/openclaw.service';

describe('Todo AI session (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let openClawService: OpenClawService;
  let token = '';
  let userId = '';
  let todoId = '';

  const baseUrl = '/api/v1';
  const email = `todo_ai_${Date.now()}@test.com`;
  const password = 'Passw0rd123';

  const getData = <T>(body: unknown): T => {
    const payload = body as { data?: T };
    return payload.data ?? (body as T);
  };

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'development';
    process.env.AUTH_EXPOSE_VERIFY_CODE = 'true';

    const { AppModule } = await import('../src/app.module');
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

  it('creates a user, todo and openclaw binding', async () => {
    const registerRes = await request(app.getHttpServer())
      .post(`${baseUrl}/auth/register`)
      .send({ email, password });
    expect(registerRes.status).toBe(201);
    const registerData = getData<{ debugVerificationCode?: string }>(registerRes.body);

    const verifyRes = await request(app.getHttpServer())
      .post(`${baseUrl}/auth/verify-email`)
      .send({ email, code: registerData.debugVerificationCode });
    expect(verifyRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer())
      .post(`${baseUrl}/auth/login`)
      .send({ email, password });
    expect(loginRes.status).toBe(201);
    const loginData = getData<{ accessToken?: string; access_token?: string }>(loginRes.body);
    token = loginData.accessToken ?? loginData.access_token ?? '';
    expect(token.length).toBeGreaterThan(10);

    const user = await dataSource.getRepository(User).findOneOrFail({ where: { email } });
    userId = user.id;

    const todoRes = await request(app.getHttpServer())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '梳理 todo AI 对话方案' });
    expect(todoRes.status).toBe(201);
    todoId = getData<{ id: string }>(todoRes.body).id;

    await dataSource.getRepository(OpenClawBinding).save(
      dataSource.getRepository(OpenClawBinding).create({
        userId,
        connectToken: 'todo-ai-token',
        deviceLabel: 'todo-ai-device',
        connectionStatus: 'connected',
        enabled: true,
        timeoutSeconds: 30,
        lastSeenAt: new Date(),
        lastDispatchedAt: null,
        lastCompletedAt: null,
        lastError: null,
      }),
    );
  });

  it('keeps one session per todo and applies AI progress suggestion', async () => {
    const fakeSocket = { readyState: 1 };
    const serviceAsAny = openClawService as unknown as {
      pickActiveSocket: (userId: string) => unknown;
      sendSocketMessage: (socket: unknown, payload: { dispatchId?: string; sessionKey?: string }) => void;
      completePendingAiReportRequest: (dispatchId: string, userId: string, payload: unknown) => boolean;
    };

    const seenSessionKeys: string[] = [];
    const pickActiveSocketSpy = jest.spyOn(serviceAsAny, 'pickActiveSocket').mockReturnValue(fakeSocket);
    const sendSocketMessageSpy = jest.spyOn(serviceAsAny, 'sendSocketMessage').mockImplementation((_socket, payload) => {
      seenSessionKeys.push(String(payload.sessionKey ?? ''));
      setTimeout(() => {
        if (payload.dispatchId) {
          serviceAsAny.completePendingAiReportRequest(payload.dispatchId, userId, {
            result: '可以先拆成接口和前端两步。\n建议沉淀为进度：已完成 AI 对话方案初步拆解，下一步实现接口与前端抽屉。',
          });
        }
      }, 0);
    });

    try {
      const firstRes = await request(app.getHttpServer())
        .post(`${baseUrl}/todos/${todoId}/ai/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ message: '帮我拆一下这个待办' });
      expect(firstRes.status).toBe(201);
      const firstData = getData<{
        session: { id: string; sessionKey: string };
        suggestions: Array<{ id: string; content: string; status: string }>;
      }>(firstRes.body);
      expect(firstData.session.sessionKey).toBe(`aitodo:todo:${todoId}`);
      expect(firstData.suggestions).toHaveLength(1);
      expect(firstData.suggestions[0]?.content).toContain('已完成 AI 对话方案初步拆解');

      const secondRes = await request(app.getHttpServer())
        .get(`${baseUrl}/todos/${todoId}/ai/session`)
        .set('Authorization', `Bearer ${token}`);
      expect(secondRes.status).toBe(200);
      const secondData = getData<{
        session: { id: string; sessionKey: string };
        messages: Array<{ role: string }>;
      }>(secondRes.body);
      expect(secondData.session.id).toBe(firstData.session.id);
      expect(secondData.messages.map((message) => message.role)).toEqual(['user', 'assistant']);

      const sessions = await dataSource.getRepository(TodoAiSession).find({ where: { todoId } });
      expect(sessions).toHaveLength(1);
      expect(seenSessionKeys).toEqual([`aitodo:todo:${todoId}`]);

      const suggestionId = firstData.suggestions[0]?.id ?? '';
      const applyRes = await request(app.getHttpServer())
        .post(`${baseUrl}/todos/${todoId}/ai/suggestions/${suggestionId}/apply`)
        .set('Authorization', `Bearer ${token}`)
        .send({ target: 'progress' });
      expect(applyRes.status).toBe(201);
      const applyData = getData<{
        suggestion: { status: string };
        progress: { content: string; progressCount: number };
      }>(applyRes.body);
      expect(applyData.suggestion.status).toBe('applied');
      expect(applyData.progress.content).toContain('下一步实现接口与前端抽屉');
      expect(applyData.progress.progressCount).toBe(1);
    } finally {
      pickActiveSocketSpy.mockRestore();
      sendSocketMessageSpy.mockRestore();
    }
  });
});
