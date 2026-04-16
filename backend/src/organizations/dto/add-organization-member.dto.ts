import { IsEmail } from 'class-validator';

export class AddOrganizationMemberDto {
  @IsEmail()
  email!: string;
}
