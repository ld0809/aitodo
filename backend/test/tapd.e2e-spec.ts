import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('TAPD API (e2e)', () => {
  let app: INestApplication;
  let configId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TAPD Configuration API', () => {
    it('should create a TAPD config', () => {
      return request(app.getHttpServer())
        .post('/api/tapd/configs')
        .send({
          name: 'Test TAPD',
          apiUrl: 'https://api.tapd.cn',
          workspaceId: '12345',
          isDefault: true,
        })
        .expect(201)
        .expect((res: request.Response) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('Test TAPD');
          expect(res.body.apiUrl).toBe('https://api.tapd.cn');
          expect(res.body.workspaceId).toBe('12345');
          expect(res.body.isDefault).toBe(true);
          configId = res.body.id;
        });
    });

    it('should get all TAPD configs', () => {
      return request(app.getHttpServer())
        .get('/api/tapd/configs')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });

    it('should get a specific TAPD config', () => {
      return request(app.getHttpServer())
        .get(`/api/tapd/configs/${configId}`)
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.id).toBe(configId);
        });
    });

    it('should update a TAPD config', () => {
      return request(app.getHttpServer())
        .put(`/api/tapd/configs/${configId}`)
        .send({
          name: 'Updated TAPD',
        })
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.name).toBe('Updated TAPD');
        });
    });

    it('should delete a TAPD config', () => {
      return request(app.getHttpServer())
        .post('/api/tapd/configs')
        .send({
          name: 'To Delete',
          apiUrl: 'https://api.tapd.cn',
          workspaceId: '99999',
        })
        .expect(201)
        .then((res: request.Response) => {
          const deleteConfigId = res.body.id;
          return request(app.getHttpServer())
            .delete(`/api/tapd/configs/${deleteConfigId}`)
            .expect(200);
        });
    });
  });

  describe('TAPD Data API (without real API)', () => {
    it('should return empty array for projects when API fails', () => {
      return request(app.getHttpServer())
        .get('/api/projects')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should return 400 for requirements without projectId', () => {
      return request(app.getHttpServer())
        .get('/api/requirements')
        .expect(400);
    });

    it('should return 400 for bugs without projectId', () => {
      return request(app.getHttpServer())
        .get('/api/bugs')
        .expect(400);
    });
  });

  describe('Iterations API', () => {
    it('should return empty array when API is called (with config)', () => {
      return request(app.getHttpServer())
        .get('/api/projects/test-project-id/iterations')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should get iterations with workspaceId query param', () => {
      return request(app.getHttpServer())
        .get('/api/projects/test-project-id/iterations')
        .query({ workspaceId: '12345' })
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('Users API', () => {
    it('should return empty array when API is called (with config)', () => {
      return request(app.getHttpServer())
        .get('/api/projects/test-project-id/users')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should get users with workspaceId query param', () => {
      return request(app.getHttpServer())
        .get('/api/projects/test-project-id/users')
        .query({ workspaceId: '12345' })
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('Versions API', () => {
    it('should return empty array when API is called (with config)', () => {
      return request(app.getHttpServer())
        .get('/api/projects/test-project-id/versions')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should get versions with workspaceId query param', () => {
      return request(app.getHttpServer())
        .get('/api/projects/test-project-id/versions')
        .query({ workspaceId: '12345' })
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('Requirements API', () => {
    it('should return empty array when API is called (with config)', () => {
      return request(app.getHttpServer())
        .get('/api/requirements?projectId=123')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should require projectId parameter', () => {
      return request(app.getHttpServer())
        .get('/api/requirements')
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toContain('projectId is required');
        });
    });

    it('should accept optional query parameters', () => {
      return request(app.getHttpServer())
        .get('/api/requirements?projectId=123&iterationId=456&ownerIds=user1,user2&status=open')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('Bugs API', () => {
    it('should return empty array when API is called (with config)', () => {
      return request(app.getHttpServer())
        .get('/api/bugs?projectId=123')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should require projectId parameter', () => {
      return request(app.getHttpServer())
        .get('/api/bugs')
        .expect(400)
        .expect((res: request.Response) => {
          expect(res.body.message).toContain('projectId is required');
        });
    });

    it('should accept optional query parameters', () => {
      return request(app.getHttpServer())
        .get('/api/bugs?projectId=123&title=login&versionId=456&ownerIds=user1&status=open')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('Todos API', () => {
    it('should return empty array when API is called (with config)', () => {
      return request(app.getHttpServer())
        .get('/api/todos/user123')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should get todos with workspaceId query param', () => {
      return request(app.getHttpServer())
        .get('/api/todos/user123')
        .query({ workspaceId: '12345' })
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should return 404 for empty userId', () => {
      return request(app.getHttpServer())
        .get('/api/todos/')
        .expect(404);
    });
  });
});
