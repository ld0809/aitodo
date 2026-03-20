import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Phase 6 - Miniapp Binding and Calendar Sync (e2e)', () => {
  let app: INestApplication;
  const baseUrl = '/api/v1';

  const email = `phase6_${Date.now()}@test.com`;
  const password = 'Passw0rd123';
  let accessToken = '';
  let miniOpenId = '';

  let workTagId = '';
  let dueEarlyTodoId = '';
  let dueLateTodoId = '';
  let noDueOldTodoId = '';
  let noDueNewTodoId = '';

  const device = {
    brand: 'Apple',
    model: 'iPhone15,3',
    screenWidth: 393,
    screenHeight: 852,
  };

  const getHttpApp = () => app.getHttpServer();
  const getData = <T>(body: unknown): T => {
    const payload = body as { data?: T };
    return payload.data ?? (body as T);
  };

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'development';
    process.env.AUTH_EXPOSE_VERIFY_CODE = 'true';
    process.env.MINIAPP_WECHAT_MOCK_ENABLED = 'true';

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

  it('register/login user and bind miniapp user', async () => {
    const registerRes = await request(getHttpApp()).post(`${baseUrl}/auth/register`).send({ email, password });
    expect(registerRes.status).toBe(201);

    const sendCodeRes = await request(getHttpApp()).post(`${baseUrl}/auth/send-email-code`).send({ email });
    expect(sendCodeRes.status).toBe(201);
    const sendCodeData = getData<{ debugCode?: string }>(sendCodeRes.body);
    expect(sendCodeData.debugCode).toHaveLength(6);

    const verifyRes = await request(getHttpApp()).post(`${baseUrl}/auth/verify-email`).send({
      email,
      code: sendCodeData.debugCode,
    });
    expect(verifyRes.status).toBe(201);

    const loginRes = await request(getHttpApp()).post(`${baseUrl}/auth/login`).send({ email, password });
    expect(loginRes.status).toBe(201);
    const loginData = getData<{ accessToken?: string; access_token?: string }>(loginRes.body);
    accessToken = loginData.accessToken ?? loginData.access_token ?? '';
    expect(accessToken.length).toBeGreaterThan(10);

    const wxCode = `phase6_wx_code_${Date.now()}`;
    miniOpenId = `mock_openid_${wxCode}`;
    const bindRes = await request(getHttpApp())
      .post(`${baseUrl}/miniapp/wechat/bind-by-code`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: wxCode,
        miniNickname: 'phase6-mini-user',
      });
    expect(bindRes.status).toBe(201);

    const bindingRes = await request(getHttpApp())
      .get(`${baseUrl}/miniapp/binding`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(bindingRes.status).toBe(200);
    const bindingData = getData<{ bound: boolean; binding?: { miniOpenId: string } }>(bindingRes.body);
    expect(bindingData.bound).toBe(true);
    expect(bindingData.binding?.miniOpenId).toBe(miniOpenId);
  });

  it('create tags and todos for miniapp home sorting', async () => {
    const tagRes = await request(getHttpApp())
      .post(`${baseUrl}/tags`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '工作' });
    expect(tagRes.status).toBe(201);
    workTagId = getData<{ id: string }>(tagRes.body).id;

    const noDueOldRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: '无截止时间-旧', tagIds: [workTagId] });
    expect(noDueOldRes.status).toBe(201);
    noDueOldTodoId = getData<{ id: string }>(noDueOldRes.body).id;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const dueLateRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        content: '有截止时间-晚',
        dueAt: '2026-03-18T10:00:00.000Z',
        tagIds: [workTagId],
      });
    expect(dueLateRes.status).toBe(201);
    dueLateTodoId = getData<{ id: string }>(dueLateRes.body).id;

    const dueEarlyRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        content: '有截止时间-早',
        dueAt: '2026-03-17T08:00:00.000Z',
        tagIds: [workTagId],
      });
    expect(dueEarlyRes.status).toBe(201);
    dueEarlyTodoId = getData<{ id: string }>(dueEarlyRes.body).id;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const noDueNewRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: '无截止时间-新', tagIds: [workTagId] });
    expect(noDueNewRes.status).toBe(201);
    noDueNewTodoId = getData<{ id: string }>(noDueNewRes.body).id;

    const homeRes = await request(getHttpApp())
      .get(`${baseUrl}/miniapp/home`)
      .query({ tagId: workTagId })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(homeRes.status).toBe(200);

    const homeData = getData<{ todos: Array<{ id: string }> }>(homeRes.body);
    const todoOrder = homeData.todos.map((todo) => todo.id);
    expect(todoOrder).toEqual([dueEarlyTodoId, dueLateTodoId, noDueNewTodoId, noDueOldTodoId]);
  });

  it('calendar sync should deduplicate by device and deadline and re-sync after deadline changed', async () => {
    const prepare1Res = await request(getHttpApp())
      .post(`${baseUrl}/miniapp/calendar-sync/prepare`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        device,
        tagId: workTagId,
      });
    expect(prepare1Res.status).toBe(201);
    const prepare1Data = getData<{
      totalDueTodos: number;
      alreadySyncedCount: number;
      todosToSync: Array<{ id: string }>;
    }>(prepare1Res.body);

    expect(prepare1Data.totalDueTodos).toBe(2);
    expect(prepare1Data.alreadySyncedCount).toBe(0);
    expect(prepare1Data.todosToSync.map((item) => item.id).sort()).toEqual([dueEarlyTodoId, dueLateTodoId].sort());

    const confirmRes = await request(getHttpApp())
      .post(`${baseUrl}/miniapp/calendar-sync/confirm`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        device,
        todoIds: [dueEarlyTodoId, dueLateTodoId],
      });
    expect(confirmRes.status).toBe(201);

    const prepare2Res = await request(getHttpApp())
      .post(`${baseUrl}/miniapp/calendar-sync/prepare`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        device,
        tagId: workTagId,
      });
    expect(prepare2Res.status).toBe(201);

    const prepare2Data = getData<{
      totalDueTodos: number;
      alreadySyncedCount: number;
      todosToSync: Array<{ id: string }>;
    }>(prepare2Res.body);
    expect(prepare2Data.totalDueTodos).toBe(2);
    expect(prepare2Data.alreadySyncedCount).toBe(2);
    expect(prepare2Data.todosToSync).toHaveLength(0);

    const updateDueRes = await request(getHttpApp())
      .patch(`${baseUrl}/todos/${dueEarlyTodoId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dueAt: '2026-03-19T09:30:00.000Z' });
    expect(updateDueRes.status).toBe(200);

    const prepare3Res = await request(getHttpApp())
      .post(`${baseUrl}/miniapp/calendar-sync/prepare`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        device,
        tagId: workTagId,
      });
    expect(prepare3Res.status).toBe(201);

    const prepare3Data = getData<{
      totalDueTodos: number;
      alreadySyncedCount: number;
      todosToSync: Array<{ id: string }>;
    }>(prepare3Res.body);
    expect(prepare3Data.totalDueTodos).toBe(2);
    expect(prepare3Data.alreadySyncedCount).toBe(1);
    expect(prepare3Data.todosToSync.map((item) => item.id)).toEqual([dueEarlyTodoId]);
  });
});
