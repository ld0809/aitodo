import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Phase 4 - Shared Card Collaboration (e2e)', () => {
  let app: INestApplication;
  const baseUrl = '/api/v1';

  const ownerEmail = `phase4_owner_${Date.now()}@test.com`;
  const memberEmail = `phase4_member_${Date.now()}@test.com`;
  const password = 'Passw0rd123';

  let ownerToken = '';
  let memberToken = '';
  let sharedCardId = '';
  let hiddenSharedCardId = '';
  let sharedTodoId = '';

  const getHttpApp = () => app.getHttpServer();
  const getData = <T>(body: unknown): T => {
    const payload = body as { data?: T };
    return payload.data ?? (body as T);
  };

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'development';

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

  const registerAndLogin = async (email: string) => {
    const registerRes = await request(getHttpApp()).post(`${baseUrl}/auth/register`).send({ email, password });
    expect(registerRes.status).toBe(201);
    const registerData = getData<{ debugVerificationCode?: string }>(registerRes.body);
    expect(registerData.debugVerificationCode).toHaveLength(6);

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

  it('register owner/member users', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    memberToken = await registerAndLogin(memberEmail);
    expect(ownerToken.length).toBeGreaterThan(10);
    expect(memberToken.length).toBeGreaterThan(10);
  });

  it('owner creates shared cards with participant emails', async () => {
    const externalEmail = 'external-user@test.com';
    const createInvalidCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase4 Invalid Shared Card',
        cardType: 'shared',
        pluginType: 'local_todo',
        participantEmails: [memberEmail, externalEmail],
      });
    expect(createInvalidCardRes.status).toBe(400);
    expect((createInvalidCardRes.body as { message?: string }).message ?? '').toContain('以下参与人邮箱尚未注册');

    const createVisibleCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase4 Shared Card',
        cardType: 'shared',
        pluginType: 'local_todo',
        participantEmails: [memberEmail],
      });
    expect(createVisibleCardRes.status).toBe(201);
    const visibleCardData = getData<{ id: string; cardType: string; participants: Array<{ email: string }> }>(createVisibleCardRes.body);
    sharedCardId = visibleCardData.id;
    expect(visibleCardData.cardType).toBe('shared');
    expect(visibleCardData.participants.map((item) => item.email.toLowerCase())).toContain(memberEmail.toLowerCase());

    const createHiddenCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase4 Hidden Shared Card',
        cardType: 'shared',
        pluginType: 'local_todo',
        participantEmails: [memberEmail],
      });
    expect(createHiddenCardRes.status).toBe(201);
    hiddenSharedCardId = getData<{ id: string }>(createHiddenCardRes.body).id;
  });

  it('creating todos in shared card auto-adds mentioned users as assignees', async () => {
    const memberMentionKey = memberEmail.split('@')[0];

    const createSharedTodoRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cardId: sharedCardId,
        content: `和 @${memberMentionKey} 一起确认第四阶段交付`,
      });
    expect(createSharedTodoRes.status).toBe(201);
    const sharedTodoData = getData<{ id: string; cardId: string; assignees: Array<{ email: string }> }>(createSharedTodoRes.body);
    sharedTodoId = sharedTodoData.id;
    expect(sharedTodoData.cardId).toBe(sharedCardId);
    expect(sharedTodoData.assignees.map((item) => item.email.toLowerCase())).toContain(memberEmail.toLowerCase());

    const createUnmentionedTodoRes = await request(getHttpApp())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cardId: hiddenSharedCardId,
        content: '这个待办没有 @ 提及',
      });
    expect(createUnmentionedTodoRes.status).toBe(201);
    const unmentionedTodoData = getData<{ assignees: Array<{ email: string }> }>(createUnmentionedTodoRes.body);
    expect(unmentionedTodoData.assignees).toHaveLength(0);
  });

  it('mentioned user can see related shared cards and own shared todos only', async () => {
    const memberCardsRes = await request(getHttpApp())
      .get(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberCardsRes.status).toBe(200);
    const memberCards = getData<Array<{ id: string }>>(memberCardsRes.body);

    const memberCardIds = memberCards.map((item) => item.id);
    expect(memberCardIds).toContain(sharedCardId);
    expect(memberCardIds).not.toContain(hiddenSharedCardId);

    const sharedTodosRes = await request(getHttpApp())
      .get(`${baseUrl}/cards/${sharedCardId}/todos`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(sharedTodosRes.status).toBe(200);
    const sharedTodos = getData<Array<{ id: string; content: string }>>(sharedTodosRes.body);
    expect(sharedTodos).toHaveLength(1);
    expect(sharedTodos[0]?.id).toBe(sharedTodoId);
  });

  it('shared todo supports progress update by mentioned user', async () => {
    const createProgressRes = await request(getHttpApp())
      .post(`${baseUrl}/todos/${sharedTodoId}/progress`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ content: '已完成共享待办联调' });
    expect(createProgressRes.status).toBe(201);

    const ownerProgressRes = await request(getHttpApp())
      .get(`${baseUrl}/todos/${sharedTodoId}/progress`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerProgressRes.status).toBe(200);
    const progressEntries = getData<Array<{ content: string }>>(ownerProgressRes.body);
    expect(progressEntries.length).toBeGreaterThan(0);
    expect(progressEntries[0]?.content).toContain('共享待办联调');
  });
});
