import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import request from 'supertest';
import { AppModule } from '../src/app.module';

jest.mock(
  '@iflow-ai/iflow-cli-sdk',
  () => {
    class MockIFlowClient {
      async connect() {
        return Promise.resolve();
      }

      async disconnect() {
        return Promise.resolve();
      }

      async sendMessage(message: string, files?: string[]) {
        void message;
        void files;
        return Promise.resolve();
      }

      async *receiveMessages() {
        yield { type: 'ASSISTANT', chunk: { text: 'iFlow mock report for phase3' } };
        yield { type: 'TASK_FINISH' };
      }
    }

    return {
      IFlowClient: MockIFlowClient,
      MessageType: {
        ASSISTANT: 'ASSISTANT',
        TASK_FINISH: 'TASK_FINISH',
        ERROR: 'ERROR',
      },
    };
  },
  { virtual: true },
);

describe('Phase 3 - Progress and AI Report (e2e)', () => {
  let app: INestApplication;
  let token = '';
  let todoId = '';
  const baseUrl = '/api/v1';
  const testEmail = `phase3_${Date.now()}@test.com`;
  const testPassword = 'Passw0rd123';
  const getHttpApp = () => app.getHttpAdapter().getInstance();
  const getPayload = <T>(body: unknown): T => {
    const typed = body as { data?: T };
    return typed.data ?? (body as T);
  };

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'development';
    process.env.AUTH_EXPOSE_VERIFY_CODE = 'true';
    process.env.AI_REPORT_PROVIDER = 'iflow';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register/login test user', async () => {
    const registerRes = await request(getHttpApp()).post(`${baseUrl}/auth/register`).send({
      email: testEmail,
      password: testPassword,
    });
    expect(registerRes.status).toBe(201);
    const registerPayload = getPayload<{ debugVerificationCode?: string }>(registerRes.body);
    const code = registerPayload.debugVerificationCode;
    expect(typeof code).toBe('string');

    const verifyRes = await request(getHttpApp()).post(`${baseUrl}/auth/verify-email`).send({
      email: testEmail,
      code,
    });
    expect(verifyRes.status).toBe(201);

    const loginRes = await request(getHttpApp()).post(`${baseUrl}/auth/login`).send({
      email: testEmail,
      password: testPassword,
    });
    expect(loginRes.status).toBe(201);
    const loginPayload = getPayload<{ accessToken?: string; access_token?: string }>(loginRes.body);
    token = loginPayload.accessToken ?? loginPayload.access_token ?? '';
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  it('create local todo', async () => {
    const createRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: '第三阶段联调任务',
      });

    expect(createRes.status).toBe(201);
    const createTodoPayload = getPayload<{ id: string; progressCount: number }>(createRes.body);
    todoId = createTodoPayload.id;
    expect(createTodoPayload.progressCount).toBe(0);
  });

  it('add progress and query progress list', async () => {
    const addRes = await request(getHttpApp())
      .post(`${baseUrl}/todos/${todoId}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: '已完成 API 联调，开始补充异常处理',
      });

    expect(addRes.status).toBe(201);
    const addProgressPayload = getPayload<{ progressCount: number }>(addRes.body);
    expect(addProgressPayload.progressCount).toBe(1);

    const listRes = await request(getHttpApp())
      .get(`${baseUrl}/todos/${todoId}/progress`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const progressList = getPayload<Array<{ content: string }>>(listRes.body);
    expect(Array.isArray(progressList)).toBe(true);
    expect(progressList).toHaveLength(1);
    expect(progressList[0]?.content).toContain('API 联调');
  });

  it('reject progress update for non-existing todo', async () => {
    const addRes = await request(getHttpApp())
      .post(`${baseUrl}/todos/00000000-0000-0000-0000-000000000000/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: '不应写入',
      });

    expect(addRes.status).toBe(404);
  });

  it('generate ai report for custom range', async () => {
    const startAt = '2000-01-01T00:00:00.000Z';
    const endAt = '2100-01-01T00:00:00.000Z';

    const reportRes = await request(getHttpApp())
      .post(`${baseUrl}/reports/ai`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        startAt,
        endAt,
      });

    expect(reportRes.status).toBe(201);
    const reportPayload = getPayload<{ provider: string; todoCount: number; progressCount: number; report: string }>(reportRes.body);
    expect(reportPayload.provider).toBe('iflow');
    expect(reportPayload.todoCount).toBe(1);
    expect(reportPayload.progressCount).toBe(1);
    expect(reportPayload.report).toContain('iFlow mock report');
  });

  it('generate ai report by openai when provider is configured', async () => {
    const startAt = '2000-01-01T00:00:00.000Z';
    const endAt = '2100-01-01T00:00:00.000Z';
    const openAiPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        output_text: 'OpenAI mock report for phase3',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as never);

    process.env.AI_REPORT_PROVIDER = 'openai';
    process.env.AI_REPORT_OPENAI_API_KEY = 'test-openai-key';
    process.env.AI_REPORT_OPENAI_MODEL = 'gpt-5-mini';
    process.env.AI_REPORT_OPENAI_BASE_URL = 'https://api.openai.test/v1';

    try {
      const reportRes = await request(getHttpApp())
        .post(`${baseUrl}/reports/ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          startAt,
          endAt,
        });

      expect(reportRes.status).toBe(201);
      const reportPayload = getPayload<{ provider: string; todoCount: number; progressCount: number; report: string }>(reportRes.body);
      expect(reportPayload.provider).toBe('openai');
      expect(reportPayload.todoCount).toBe(1);
      expect(reportPayload.progressCount).toBe(1);
      expect(reportPayload.report).toContain('OpenAI mock report');
      expect(openAiPostSpy).toHaveBeenCalledWith(
        'https://api.openai.test/v1/responses',
        expect.objectContaining({
          model: 'gpt-5-mini',
          input: expect.any(String),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        }),
      );
    } finally {
      openAiPostSpy.mockRestore();
      process.env.AI_REPORT_PROVIDER = 'iflow';
      delete process.env.AI_REPORT_OPENAI_API_KEY;
      delete process.env.AI_REPORT_OPENAI_MODEL;
      delete process.env.AI_REPORT_OPENAI_BASE_URL;
    }
  });

  it('generate ai report by openai chat completions mode when configured', async () => {
    const startAt = '2000-01-01T00:00:00.000Z';
    const endAt = '2100-01-01T00:00:00.000Z';
    const openAiPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: 'OpenAI chat completion mock report for phase3',
            },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    } as never);

    process.env.AI_REPORT_PROVIDER = 'openai';
    process.env.AI_REPORT_OPENAI_API_MODE = 'chat_completions';
    process.env.AI_REPORT_OPENAI_API_KEY = 'test-openai-key';
    process.env.AI_REPORT_OPENAI_MODEL = 'MiniMax-M2.7';
    process.env.AI_REPORT_OPENAI_BASE_URL = 'https://api.openai.test/v1';

    try {
      const reportRes = await request(getHttpApp())
        .post(`${baseUrl}/reports/ai`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          startAt,
          endAt,
        });

      expect(reportRes.status).toBe(201);
      const reportPayload = getPayload<{ provider: string; todoCount: number; progressCount: number; report: string }>(reportRes.body);
      expect(reportPayload.provider).toBe('openai');
      expect(reportPayload.todoCount).toBe(1);
      expect(reportPayload.progressCount).toBe(1);
      expect(reportPayload.report).toContain('OpenAI chat completion mock report');
      expect(openAiPostSpy).toHaveBeenCalledWith(
        'https://api.openai.test/v1/chat/completions',
        expect.objectContaining({
          model: 'MiniMax-M2.7',
          messages: [
            expect.objectContaining({
              role: 'user',
              content: expect.any(String),
            }),
          ],
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        }),
      );
    } finally {
      openAiPostSpy.mockRestore();
      process.env.AI_REPORT_PROVIDER = 'iflow';
      delete process.env.AI_REPORT_OPENAI_API_MODE;
      delete process.env.AI_REPORT_OPENAI_API_KEY;
      delete process.env.AI_REPORT_OPENAI_MODEL;
      delete process.env.AI_REPORT_OPENAI_BASE_URL;
    }
  });
});
