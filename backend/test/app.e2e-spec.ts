import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Todo Manager API (e2e)', () => {
  let app: INestApplication;
  let token = '';
  let tagId = '';
  let todoId = '';
  let cardId = '';

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.JWT_SECRET = 'test-jwt-secret';

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

  it('register -> send code -> verify -> login', async () => {
    const registerRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'demo@example.com',
      password: 'Passw0rd123',
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.code).toBe(0);

    const sendCodeRes = await request(app.getHttpServer()).post('/api/v1/auth/send-email-code').send({
      email: 'demo@example.com',
    });
    expect(sendCodeRes.status).toBe(201);
    expect(sendCodeRes.body.code).toBe(0);
    const verifyCode = sendCodeRes.body.data.debugCode as string;
    expect(verifyCode).toHaveLength(6);

    const verifyRes = await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({
      email: 'demo@example.com',
      code: verifyCode,
    });
    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.data.verified).toBe(true);

    const loginRes = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'demo@example.com',
      password: 'Passw0rd123',
    });
    expect(loginRes.status).toBe(201);
    token = loginRes.body.data.access_token as string;
    expect(token.length).toBeGreaterThan(10);
  });

  it('get current user profile', async () => {
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.code).toBe(0);
    expect(meRes.body.data.email).toBe('demo@example.com');
  });

  it('create tag + todo + card and query card todos', async () => {
    const createTagRes = await request(app.getHttpServer())
      .post('/api/v1/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'work', color: '#00AABB' });

    expect(createTagRes.status).toBe(201);
    tagId = createTagRes.body.data.id as string;

    const createTodoRes = await request(app.getHttpServer())
      .post('/api/v1/todos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'finish backend task',
        tagIds: [tagId],
        dueAt: '2026-03-05T10:00:00.000Z',
        executeAt: '2026-03-04T10:00:00.000Z',
      });

    expect(createTodoRes.status).toBe(201);
    todoId = createTodoRes.body.data.id as string;

    const createCardRes = await request(app.getHttpServer())
      .post('/api/v1/cards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Work Card',
        sortBy: 'due_at',
        sortOrder: 'asc',
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        tagIds: [tagId],
      });

    expect(createCardRes.status).toBe(201);
    cardId = createCardRes.body.data.id as string;

    const cardTodosRes = await request(app.getHttpServer())
      .get(`/api/v1/cards/${cardId}/todos`)
      .set('Authorization', `Bearer ${token}`);

    expect(cardTodosRes.status).toBe(200);
    expect(cardTodosRes.body.data).toHaveLength(1);
    expect(cardTodosRes.body.data[0].id).toBe(todoId);
  });

  it('update card layout and dashboard layout', async () => {
    const updateLayoutRes = await request(app.getHttpServer())
      .patch(`/api/v1/cards/${cardId}/layout`)
      .set('Authorization', `Bearer ${token}`)
      .send({ x: 2, y: 3, w: 8, h: 5 });

    expect(updateLayoutRes.status).toBe(200);
    expect(updateLayoutRes.body.data.x).toBe(2);

    const batchLayoutRes = await request(app.getHttpServer())
      .put('/api/v1/dashboard/layout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ id: cardId, x: 1, y: 1, w: 7, h: 6 }],
      });

    expect(batchLayoutRes.status).toBe(200);
    expect(batchLayoutRes.body.data[0].id).toBe(cardId);
    expect(batchLayoutRes.body.data[0].x).toBe(1);
  });
});
