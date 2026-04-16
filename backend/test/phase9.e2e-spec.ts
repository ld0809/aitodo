import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Phase 9 - Card Archive and More Menu Support (e2e)', () => {
  let app: INestApplication;
  const baseUrl = '/api/v1';

  const ownerEmail = `phase9_owner_${Date.now()}@test.com`;
  const memberEmail = `phase9_member_${Date.now()}@test.com`;
  const password = 'Passw0rd123';

  let ownerToken = '';
  let memberToken = '';
  let personalCardId = '';
  let sharedCardId = '';

  const getHttpApp = () => app.getHttpServer();
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

  it('register owner/member users', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    memberToken = await registerAndLogin(memberEmail);
    expect(ownerToken.length).toBeGreaterThan(10);
    expect(memberToken.length).toBeGreaterThan(10);
  });

  it('owner creates personal and shared cards', async () => {
    const personalCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase9 Personal Card',
        cardType: 'personal',
        pluginType: 'local_todo',
      });
    expect(personalCardRes.status).toBe(201);
    personalCardId = getData<{ id: string }>(personalCardRes.body).id;

    const sharedCardRes = await request(getHttpApp())
      .post(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase9 Shared Card',
        cardType: 'shared',
        pluginType: 'local_todo',
        participantEmails: [memberEmail],
      });
    expect(sharedCardRes.status).toBe(201);
    sharedCardId = getData<{ id: string }>(sharedCardRes.body).id;
  });

  it('owner can archive own card and archived cards disappear from active dashboard list', async () => {
    const archiveRes = await request(getHttpApp())
      .patch(`${baseUrl}/cards/${personalCardId}/archive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    expect(archiveRes.status).toBe(200);
    const archivedCard = getData<{ id: string; status: string }>(archiveRes.body);
    expect(archivedCard.id).toBe(personalCardId);
    expect(archivedCard.status).toBe('archived');

    const ownerCardsRes = await request(getHttpApp())
      .get(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerCardsRes.status).toBe(200);
    const ownerCards = getData<Array<{ id: string }>>(ownerCardsRes.body);
    expect(ownerCards.map((card) => card.id)).not.toContain(personalCardId);
    expect(ownerCards.map((card) => card.id)).toContain(sharedCardId);
  });

  it('only owner can see archived cards in archive list', async () => {
    const ownerArchivedRes = await request(getHttpApp())
      .get(`${baseUrl}/cards?status=archived`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerArchivedRes.status).toBe(200);
    const ownerArchivedCards = getData<Array<{ id: string; status: string; userId: string }>>(ownerArchivedRes.body);
    expect(ownerArchivedCards).toHaveLength(1);
    expect(ownerArchivedCards[0]?.id).toBe(personalCardId);
    expect(ownerArchivedCards[0]?.status).toBe('archived');
    expect(ownerArchivedCards[0]?.userId).toBeDefined();

    const memberArchivedRes = await request(getHttpApp())
      .get(`${baseUrl}/cards?status=archived`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberArchivedRes.status).toBe(200);
    const memberArchivedCards = getData<Array<{ id: string }>>(memberArchivedRes.body);
    expect(memberArchivedCards).toHaveLength(0);

    const memberCardsRes = await request(getHttpApp())
      .get(`${baseUrl}/cards`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberCardsRes.status).toBe(200);
    const memberCards = getData<Array<{ id: string }>>(memberCardsRes.body);
    expect(memberCards.map((card) => card.id)).toContain(sharedCardId);
    expect(memberCards.map((card) => card.id)).not.toContain(personalCardId);
  });
});
