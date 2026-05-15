import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Todo card move (e2e)', () => {
  let app: INestApplication;
  const baseUrl = '/api/v1';
  const email = `move_${Date.now()}@test.com`;
  const sharedOwnerEmail = `move_owner_${Date.now()}@test.com`;
  const sharedMemberEmail = `move_member_${Date.now()}@test.com`;
  const password = 'Passw0rd123';
  let token = '';

  const getData = <T>(body: unknown): T => {
    const payload = body as { data?: T };
    return payload.data ?? (body as T);
  };

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.NODE_ENV = 'development';
    process.env.AUTH_EXPOSE_VERIFY_CODE = 'true';

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

  const registerAndLogin = async (targetEmail: string) => {
    const registerRes = await request(app.getHttpServer()).post(`${baseUrl}/auth/register`).send({ email: targetEmail, password });
    expect(registerRes.status).toBe(201);
    const registerData = getData<{ debugVerificationCode?: string }>(registerRes.body);
    expect(registerData.debugVerificationCode).toHaveLength(6);

    const verifyRes = await request(app.getHttpServer()).post(`${baseUrl}/auth/verify-email`).send({
      email: targetEmail,
      code: registerData.debugVerificationCode,
    });
    expect(verifyRes.status).toBe(201);

    const loginRes = await request(app.getHttpServer()).post(`${baseUrl}/auth/login`).send({ email: targetEmail, password });
    expect(loginRes.status).toBe(201);
    const loginData = getData<{ accessToken?: string; access_token?: string }>(loginRes.body);
    const accessToken = loginData.accessToken ?? loginData.access_token ?? '';
    expect(accessToken.length).toBeGreaterThan(10);
    return accessToken;
  };

  it('moves a local todo between cards by updating cardId without replacing its tags', async () => {
    token = await registerAndLogin(email);

    const tagRes = await request(app.getHttpServer())
      .post(`${baseUrl}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `move-tag-${Date.now()}`, color: '#3b82f6' });
    expect(tagRes.status).toBe(201);
    const tagId = getData<{ id: string }>(tagRes.body).id;

    const sharedTagRes = await request(app.getHttpServer())
      .post(`${baseUrl}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `move-shared-tag-${Date.now()}`, color: '#f97316' });
    expect(sharedTagRes.status).toBe(201);
    const sharedTagId = getData<{ id: string }>(sharedTagRes.body).id;

    const sourceCardRes = await request(app.getHttpServer())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Move Source',
        pluginType: 'local_todo',
        tagIds: [tagId],
      });
    expect(sourceCardRes.status).toBe(201);
    const sourceCardId = getData<{ id: string }>(sourceCardRes.body).id;

    const targetCardRes = await request(app.getHttpServer())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Move Target',
        pluginType: 'local_todo',
      });
    expect(targetCardRes.status).toBe(201);
    const targetCardId = getData<{ id: string }>(targetCardRes.body).id;

    const sharedCardRes = await request(app.getHttpServer())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Move Shared Target',
        cardType: 'shared',
        pluginType: 'local_todo',
        tagIds: [sharedTagId],
      });
    expect(sharedCardRes.status).toBe(201);
    const sharedCardId = getData<{ id: string }>(sharedCardRes.body).id;

    const todoRes = await request(app.getHttpServer())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: '需要移动的待办',
        tagIds: [tagId],
      });
    expect(todoRes.status).toBe(201);
    const todoId = getData<{ id: string }>(todoRes.body).id;

    const sourceBeforeMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${sourceCardId}/todos`)
      .set('Authorization', `Bearer ${token}`);
    expect(sourceBeforeMoveRes.status).toBe(200);
    expect(getData<Array<{ id: string }>>(sourceBeforeMoveRes.body).map((todo) => todo.id)).toContain(todoId);

    const moveRes = await request(app.getHttpServer())
      .patch(`${baseUrl}/todos/${todoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cardId: targetCardId });
    expect(moveRes.status).toBe(200);
    expect(getData<{ cardId: string }>(moveRes.body).cardId).toBe(targetCardId);

    const sourceAfterMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${sourceCardId}/todos`)
      .set('Authorization', `Bearer ${token}`);
    expect(sourceAfterMoveRes.status).toBe(200);
    expect(getData<Array<{ id: string }>>(sourceAfterMoveRes.body).map((todo) => todo.id)).not.toContain(todoId);

    const targetAfterMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${targetCardId}/todos`)
      .set('Authorization', `Bearer ${token}`);
    expect(targetAfterMoveRes.status).toBe(200);
    expect(getData<Array<{ id: string }>>(targetAfterMoveRes.body).map((todo) => todo.id)).toContain(todoId);

    const moveToSharedRes = await request(app.getHttpServer())
      .patch(`${baseUrl}/todos/${todoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cardId: sharedCardId });
    expect(moveToSharedRes.status).toBe(200);
    const movedToSharedTodo = getData<{ cardId: string; tags: Array<{ id: string }> }>(moveToSharedRes.body);
    expect(movedToSharedTodo.cardId).toBe(sharedCardId);
    expect(movedToSharedTodo.tags.map((tag) => tag.id)).toEqual([tagId]);

    const sharedAfterMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${sharedCardId}/todos`)
      .set('Authorization', `Bearer ${token}`);
    expect(sharedAfterMoveRes.status).toBe(200);
    const sharedTodos = getData<Array<{ id: string; tags: Array<{ id: string }> }>>(sharedAfterMoveRes.body);
    const sharedTodo = sharedTodos.find((todo) => todo.id === todoId);
    expect(sharedTodo?.tags.map((tag) => tag.id)).toEqual([tagId]);
  });

  it('lets a shared card participant move a shared todo to another shared card', async () => {
    const ownerToken = await registerAndLogin(sharedOwnerEmail);
    const memberToken = await registerAndLogin(sharedMemberEmail);

    const sourceTagRes = await request(app.getHttpServer())
      .post(`${baseUrl}/tags`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `shared-source-${Date.now()}`, color: '#22c55e' });
    expect(sourceTagRes.status).toBe(201);
    const sourceTagId = getData<{ id: string }>(sourceTagRes.body).id;

    const targetTagRes = await request(app.getHttpServer())
      .post(`${baseUrl}/tags`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `shared-target-${Date.now()}`, color: '#f97316' });
    expect(targetTagRes.status).toBe(201);
    const targetTagId = getData<{ id: string }>(targetTagRes.body).id;

    const sourceCardRes = await request(app.getHttpServer())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Shared Move Source',
        cardType: 'shared',
        pluginType: 'local_todo',
        tagIds: [sourceTagId],
        participantEmails: [sharedMemberEmail],
      });
    expect(sourceCardRes.status).toBe(201);
    const sourceCard = getData<{
      id: string;
      participants: Array<{ email: string; mentionKey: string }>;
    }>(sourceCardRes.body);
    const memberMentionKey = sourceCard.participants.find(
      (participant) => participant.email.toLowerCase() === sharedMemberEmail.toLowerCase(),
    )?.mentionKey;
    expect(memberMentionKey).toBeDefined();

    const targetCardRes = await request(app.getHttpServer())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Shared Move Target',
        cardType: 'shared',
        pluginType: 'local_todo',
        tagIds: [targetTagId],
        participantEmails: [sharedMemberEmail],
      });
    expect(targetCardRes.status).toBe(201);
    const targetCardId = getData<{ id: string }>(targetCardRes.body).id;

    const todoRes = await request(app.getHttpServer())
      .post(`${baseUrl}/todos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cardId: sourceCard.id,
        content: `请 @${memberMentionKey} 移动这条共享待办`,
      });
    expect(todoRes.status).toBe(201);
    const todoId = getData<{ id: string }>(todoRes.body).id;

    const memberSourceBeforeMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${sourceCard.id}/todos`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberSourceBeforeMoveRes.status).toBe(200);
    expect(getData<Array<{ id: string }>>(memberSourceBeforeMoveRes.body).map((todo) => todo.id)).toContain(todoId);

    const moveRes = await request(app.getHttpServer())
      .patch(`${baseUrl}/todos/${todoId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ cardId: targetCardId });
    expect(moveRes.status).toBe(200);
    const movedTodo = getData<{ cardId: string; assignees: Array<{ email: string }>; tags: Array<{ id: string }> }>(moveRes.body);
    expect(movedTodo.cardId).toBe(targetCardId);
    expect(movedTodo.assignees.map((assignee) => assignee.email.toLowerCase())).toContain(sharedMemberEmail.toLowerCase());
    expect(movedTodo.tags.map((tag) => tag.id)).toEqual([sourceTagId]);

    const memberSourceAfterMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${sourceCard.id}/todos`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberSourceAfterMoveRes.status).toBe(200);
    expect(getData<Array<{ id: string }>>(memberSourceAfterMoveRes.body).map((todo) => todo.id)).not.toContain(todoId);

    const memberTargetAfterMoveRes = await request(app.getHttpServer())
      .get(`${baseUrl}/cards/${targetCardId}/todos`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberTargetAfterMoveRes.status).toBe(200);
    const targetTodos = getData<Array<{ id: string; tags: Array<{ id: string }> }>>(memberTargetAfterMoveRes.body);
    const targetTodo = targetTodos.find((todo) => todo.id === todoId);
    expect(targetTodo).toBeDefined();
    expect(targetTodo?.tags.map((tag) => tag.id)).toEqual([sourceTagId]);
  });
});
