import type { Organization, OrganizationMember } from '../types';
import apiClient from './client';

export interface CreateOrganizationDto {
  name: string;
}

export interface AddOrganizationMemberDto {
  email: string;
}

export const organizationsApi = {
  getAll: () => apiClient.get<Organization[]>('/organizations'),

  create: (data: CreateOrganizationDto) => apiClient.post<Organization>('/organizations', data),

  getMembers: (organizationId: string) => apiClient.get<OrganizationMember[]>(`/organizations/${organizationId}/members`),

  addMember: (organizationId: string, data: AddOrganizationMemberDto) =>
    apiClient.post<OrganizationMember>(`/organizations/${organizationId}/members`, data),
};
