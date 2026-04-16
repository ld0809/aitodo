import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Phase 8 - Organization Assisted Shared Card Participants (e2e)', () => {
  let app: INestApplication;
  const baseUrl = '/api/v1';

  const ownerEmail = `phase8_owner_${Date.now()}@test.com`;
  const memberEmail = `phase8_member_${Date.now()}@test.com`;
  const secondMemberEmail = `phase8_member2_${Date.now()}@test.com`;
  const password = 'Passw0rd123';

  let ownerToken = '';
  let memberToken = '';
  let secondMemberToken = '';
  let organizationId = '';

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

  it('registers owner and organization members', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    memberToken = await registerAndLogin(memberEmail);
    secondMemberToken = await registerAndLogin(secondMemberEmail);

    expect(ownerToken.length).toBeGreaterThan(10);
    expect(memberToken.length).toBeGreaterThan(10);
    expect(secondMemberToken.length).toBeGreaterThan(10);
  });

  it('owner creates organization and adds members by email without confirmation flow', async () => {
    const createOrganizationRes = await request(getHttpApp())
      .post(`${baseUrl}/organizations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Phase8 Organization',
      });
    expect(createOrganizationRes.status).toBe(201);
    const organizationData = getData<{
      id: string;
      name: string;
      ownerId: string;
      memberCount: number;
    }>(createOrganizationRes.body);
    organizationId = organizationData.id;
    expect(organizationData.name).toBe('Phase8 Organization');
    expect(organizationData.ownerId).toBeDefined();
    expect(organizationData.memberCount).toBe(1);

    const addMemberRes = await request(getHttpApp())
      .post(`${baseUrl}/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: memberEmail,
      });
    expect(addMemberRes.status).toBe(201);
    const memberData = getData<{ email: string }>(addMemberRes.body);
    expect(memberData.email.toLowerCase()).toBe(memberEmail.toLowerCase());

    const addSecondMemberRes = await request(getHttpApp())
      .post(`${baseUrl}/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: secondMemberEmail,
      });
    expect(addSecondMemberRes.status).toBe(201);

    const memberListRes = await request(getHttpApp())
      .get(`${baseUrl}/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(memberListRes.status).toBe(200);
    const members = getData<Array<{ email: string }>>(memberListRes.body);
    expect(members.map((item) => item.email.toLowerCase())).toEqual(
      expect.arrayContaining([ownerEmail.toLowerCase(), memberEmail.toLowerCase(), secondMemberEmail.toLowerCase()]),
    );
  });

  it('organization members can list accessible organizations and view members, but cannot add new members', async () => {
    const memberOrganizationsRes = await request(getHttpApp())
      .get(`${baseUrl}/organizations`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberOrganizationsRes.status).toBe(200);
    const organizations = getData<Array<{ id: string; name: string; memberCount: number }>>(memberOrganizationsRes.body);
    const targetOrganization = organizations.find((item) => item.id === organizationId);
    expect(targetOrganization?.name).toBe('Phase8 Organization');
    expect(targetOrganization?.memberCount).toBe(3);

    const memberVisibleMembersRes = await request(getHttpApp())
      .get(`${baseUrl}/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberVisibleMembersRes.status).toBe(200);
    const visibleMembers = getData<Array<{ email: string }>>(memberVisibleMembersRes.body);
    expect(visibleMembers.map((item) => item.email.toLowerCase())).toContain(secondMemberEmail.toLowerCase());

    const forbiddenAddMemberRes = await request(getHttpApp())
      .post(`${baseUrl}/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        email: ownerEmail,
      });
    expect(forbiddenAddMemberRes.status).toBe(403);
  });
});
