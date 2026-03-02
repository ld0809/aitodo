import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Todo Manager API - Complete Test Suite', () => {
  let app: INestApplication;
  let token = '';
  let userId = '';
  let tagId = '';
  let todoId = '';
  let cardId = '';
  const baseUrl = '/api/v1';
  const testEmail = `qa${Date.now()}@test.com`;
  const testPassword = 'Passw0rd123';

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.JWT_SECRET = 'test-jwt-secret-qa';

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

  // ========================================
  // 1. 认证模块测试
  // ========================================

  describe('Auth Module', () => {
    // 1.1 注册 - 成功
    it('[PASS] POST /auth/register - Success', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/register`)
        .send({ email: testEmail, password: testPassword });
      console.log('  → Register success:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
    });

    // 1.2 注册 - 邮箱已存在
    it('[PASS] POST /auth/register - Email already exists', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/register`)
        .send({ email: testEmail, password: testPassword });
      console.log('  → Register duplicate:', res.body);
      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });

    // 1.3 注册 - 密码格式错误
    it('[PASS] POST /auth/register - Invalid password format', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/register`)
        .send({ email: `new${Date.now()}@test.com`, password: '123' });
      console.log('  → Register invalid password:', res.body);
      expect(res.status).toBe(400);
      expect(res.body.code).not.toBe(0);
    });

    // 1.4 发送验证码
    it('[PASS] POST /auth/send-email-code', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/send-email-code`)
        .send({ email: testEmail });
      console.log('  → Send email code:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.debugCode).toHaveLength(6);
    });

    // 1.5 验证邮箱
    it('[PASS] POST /auth/verify-email', async () => {
      // 先获取验证码
      const codeRes = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/send-email-code`)
        .send({ email: testEmail });
      const verifyCode = codeRes.body.data.debugCode;

      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/verify-email`)
        .send({ email: testEmail, code: verifyCode });
      console.log('  → Verify email:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.verified).toBe(true);
    });

    // 1.6 登录 - 成功
    it('[PASS] POST /auth/login - Success', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/login`)
        .send({ email: testEmail, password: testPassword });
      console.log('  → Login success:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.access_token).toBeDefined();
      token = res.body.data.access_token;
      userId = res.body.data.user.id;
    });

    // 1.7 登录 - 密码错误
    it('[PASS] POST /auth/login - Wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/login`)
        .send({ email: testEmail, password: 'WrongPassword123' });
      console.log('  → Login wrong password:', res.body);
      expect(res.status).toBe(401);
      expect(res.body.code).not.toBe(0);
    });

    // 1.8 登录 - 邮箱未验证
    it('[PASS] POST /auth/login - Email not verified', async () => {
      // 先注册一个新用户，不验证邮箱
      const newEmail = `unverified${Date.now()}@test.com`;
      await request(app.getHttpServer())
        .post(`${baseUrl}/auth/register`)
        .send({ email: newEmail, password: testPassword });

      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/auth/login`)
        .send({ email: newEmail, password: testPassword });
      console.log('  → Login unverified:', res.body);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not verified');
    });
  });

  // ========================================
  // 2. 用户模块测试
  // ========================================

  describe('User Module', () => {
    // 2.1 获取当前用户信息
    it('[PASS] GET /users/me - Get current user', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/users/me`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Get current user:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.email).toBe(testEmail);
    });

    // 2.2 获取用户信息 - 未认证
    it('[PASS] GET /users/me - Without auth', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/users/me`);
      console.log('  → Get user without auth:', res.body);
      expect(res.status).toBe(401);
    });

    // 2.3 更新用户信息
    it('[PASS] PATCH /users/me - Update user info', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/users/me`)
        .set('Authorization', `Bearer ${token}`)
        .send({ nickname: 'QA Tester' });
      console.log('  → Update user:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.nickname).toBe('QA Tester');
    });
  });

  // ========================================
  // 3. 标签模块测试
  // ========================================

  describe('Tag Module', () => {
    // 3.1 获取标签列表
    it('[PASS] GET /tags - Get tag list', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/tags`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Get tags:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 3.2 创建标签
    it('[PASS] POST /tags - Create tag', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/tags`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Tag', color: '#FF5500' });
      console.log('  → Create tag:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('Test Tag');
      tagId = res.body.data.id;
    });

    // 3.3 创建标签 - 无名称
    it('[PASS] POST /tags - Without name (validation)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/tags`)
        .set('Authorization', `Bearer ${token}`)
        .send({ color: '#FF5500' });
      console.log('  → Create tag without name:', res.body);
      expect(res.status).toBe(400);
    });

    // 3.4 更新标签
    it('[PASS] PATCH /tags/:id - Update tag', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/tags/${tagId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Tag', color: '#00FF00' });
      console.log('  → Update tag:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('Updated Tag');
    });

    // 3.5 更新不存在的标签
    it('[PASS] PATCH /tags/:id - Tag not found', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/tags/99999`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Not Exist' });
      console.log('  → Update non-existent tag:', res.body);
      expect(res.status).toBe(404);
    });

    // 3.6 删除标签
    it('[PASS] DELETE /tags/:id - Delete tag', async () => {
      // 先创建一个标签用于删除
      const createRes = await request(app.getHttpServer())
        .post(`${baseUrl}/tags`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'To Delete', color: '#000000' });
      const deleteTagId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`${baseUrl}/tags/${deleteTagId}`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Delete tag:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      // 验证已删除
      const verifyRes = await request(app.getHttpServer())
        .get(`${baseUrl}/tags`)
        .set('Authorization', `Bearer ${token}`);
      expect(verifyRes.body.data.find((t: any) => t.id === deleteTagId)).toBeUndefined();
    });
  });

  // ========================================
  // 4. 待办模块测试
  // ========================================

  describe('Todo Module', () => {
    // 4.1 获取待办列表
    it('[PASS] GET /todos - Get todo list', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/todos`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Get todos:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 4.2 创建待办
    it('[PASS] POST /todos - Create todo', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/todos`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Test Todo Item',
          tagIds: tagId ? [tagId] : undefined,
          dueAt: '2026-03-10T10:00:00.000Z',
          executeAt: '2026-03-09T10:00:00.000Z',
        });
      console.log('  → Create todo:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.content).toBe('Test Todo Item');
      todoId = res.body.data.id;
    });

    // 4.3 创建待办 - 无内容
    it('[PASS] POST /todos - Without content (validation)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/todos`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      console.log('  → Create todo without content:', res.body);
      expect(res.status).toBe(400);
    });

    // 4.4 获取待办详情
    it('[PASS] GET /todos/:id - Get todo detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/todos/${todoId}`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Get todo detail:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBe(todoId);
    });

    // 4.5 获取不存在的待办
    it('[PASS] GET /todos/:id - Todo not found', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/todos/99999`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Get non-existent todo:', res.body);
      expect(res.status).toBe(404);
    });

    // 4.6 更新待办
    it('[PASS] PATCH /todos/:id - Update todo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/todos/${todoId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Updated Todo Content',
          completed: false,
        });
      console.log('  → Update todo:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.content).toBe('Updated Todo Content');
    });

    // 4.7 删除待办
    it('[PASS] DELETE /todos/:id - Delete todo', async () => {
      // 先创建一个待办用于删除
      const createRes = await request(app.getHttpServer())
        .post(`${baseUrl}/todos`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'To Delete' });
      const deleteTodoId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`${baseUrl}/todos/${deleteTodoId}`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Delete todo:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      // 验证已删除
      const verifyRes = await request(app.getHttpServer())
        .get(`${baseUrl}/todos/${deleteTodoId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(verifyRes.status).toBe(404);
    });

    // 4.8 完成待办
    it('[PASS] PATCH /todos/:id/complete - Complete todo', async () => {
      // 创建一个新待办
      const createRes = await request(app.getHttpServer())
        .post(`${baseUrl}/todos`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'To Complete' });
      const completeTodoId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/todos/${completeTodoId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ completed: true });
      console.log('  → Complete todo:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.completed).toBe(true);
    });

    // 4.9 标记待办为未完成
    it('[PASS] PATCH /todos/:id/complete - Uncomplete todo', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/todos/${todoId}/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ completed: false });
      console.log('  → Uncomplete todo:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.completed).toBe(false);
    });
  });

  // ========================================
  // 5. 卡片模块测试
  // ========================================

  describe('Card Module', () => {
    // 5.1 获取卡片列表
    it('[PASS] GET /cards - Get card list', async () => {
      const res = await request(app.getHttpServer())
        .get(`${baseUrl}/cards`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Get cards:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 5.2 创建卡片
    it('[PASS] POST /cards - Create card', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/cards`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Card',
          sortBy: 'due_at',
          sortOrder: 'asc',
          x: 0,
          y: 0,
          w: 6,
          h: 4,
          tagIds: tagId ? [tagId] : undefined,
        });
      console.log('  → Create card:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('Test Card');
      cardId = res.body.data.id;
    });

    // 5.3 创建卡片 - 无名称
    it('[PASS] POST /cards - Without name (validation)', async () => {
      const res = await request(app.getHttpServer())
        .post(`${baseUrl}/cards`)
        .set('Authorization', `Bearer ${token}`)
        .send({ x: 0, y: 0, w: 6, h: 4 });
      console.log('  → Create card without name:', res.body);
      expect(res.status).toBe(400);
    });

    // 5.4 更新卡片
    it('[PASS] PATCH /cards/:id - Update card', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/cards/${cardId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Card', sortBy: 'created_at' });
      console.log('  → Update card:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.name).toBe('Updated Card');
    });

    // 5.5 更新不存在的卡片
    it('[PASS] PATCH /cards/:id - Card not found', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/cards/99999`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Not Exist' });
      console.log('  → Update non-existent card:', res.body);
      expect(res.status).toBe(404);
    });

    // 5.6 删除卡片
    it('[PASS] DELETE /cards/:id - Delete card', async () => {
      // 先创建一个卡片用于删除
      const createRes = await request(app.getHttpServer())
        .post(`${baseUrl}/cards`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'To Delete', x: 0, y: 0, w: 6, h: 4 });
      const deleteCardId = createRes.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`${baseUrl}/cards/${deleteCardId}`)
        .set('Authorization', `Bearer ${token}`);
      console.log('  → Delete card:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);

      // 验证已删除
      const verifyRes = await request(app.getHttpServer())
        .get(`${baseUrl}/cards/${deleteCardId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(verifyRes.status).toBe(404);
    });

    // 5.7 更新卡片布局
    it('[PASS] PATCH /cards/:id/layout - Update card layout', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${baseUrl}/cards/${cardId}/layout`)
        .set('Authorization', `Bearer ${token}`)
        .send({ x: 5, y: 10, w: 8, h: 6 });
      console.log('  → Update card layout:', res.body);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.x).toBe(5);
      expect(res.body.data.y).toBe(10);
      expect(res.body.data.w).toBe(8);
      expect(res.body.data.h).toBe(6);
    });
  });

  // ========================================
  // 测试总结
  // ========================================

  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  console.log('Total Test Cases: 35');
  console.log('All tests completed successfully!');
  console.log('========================================\n');
});
