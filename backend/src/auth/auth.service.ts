import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Repository, IsNull } from 'typeorm';
import { EmailCode } from '../database/entities/email-code.entity';
import { User } from '../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailCodeDto } from './dto/send-email-code.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmailCode)
    private readonly emailCodeRepository: Repository<EmailCode>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existingUser) {
      throw new ConflictException('email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      emailVerified: false,
      status: 'active',
    });

    const savedUser = await this.userRepository.save(user);

    const verificationCode = this.generateVerificationCode();
    const emailCode = this.emailCodeRepository.create({
      userId: savedUser.id,
      email: savedUser.email,
      code: verificationCode,
      purpose: 'verify_email',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await this.emailCodeRepository.save(emailCode);

    const result = this.toSafeUser(savedUser);
    if (!this.shouldExposeVerifyCode()) {
      return result;
    }

    return {
      ...result,
      debugVerificationCode: verificationCode,
    };
  }

  async sendEmailCode(dto: SendEmailCodeDto) {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new NotFoundException('user not found');
    }
    if (user.emailVerified) {
      throw new BadRequestException('email already verified');
    }

    const code = this.generateVerificationCode();
    const emailCode = this.emailCodeRepository.create({
      userId: user.id,
      email: user.email,
      code,
      purpose: 'verify_email',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const savedCode = await this.emailCodeRepository.save(emailCode);

    const result = {
      email: savedCode.email,
      expiresAt: savedCode.expiresAt,
    };
    if (!this.shouldExposeVerifyCode()) {
      return result;
    }

    return {
      ...result,
      debugCode: savedCode.code,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new NotFoundException('user not found');
    }

    const emailCode = await this.emailCodeRepository.findOne({
      where: {
        userId: user.id,
        purpose: 'verify_email',
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!emailCode) {
      throw new BadRequestException('verification code not found');
    }
    if (emailCode.code !== dto.code) {
      throw new BadRequestException('verification code invalid');
    }
    if (emailCode.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('verification code expired');
    }

    emailCode.usedAt = new Date();
    await this.emailCodeRepository.save(emailCode);

    user.emailVerified = true;
    await this.userRepository.save(user);

    return { verified: true };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('invalid credentials');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException('email not verified');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('invalid credentials');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken: accessToken,
      user: this.toSafeUser(user),
    };
  }

  private toSafeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      target: user.target,
      emailVerified: user.emailVerified,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private shouldExposeVerifyCode() {
    const raw = process.env.AUTH_EXPOSE_VERIFY_CODE?.trim().toLowerCase();
    if (!raw) {
      return true;
    }
    if (raw === 'true' || raw === '1') {
      return true;
    }
    if (raw === 'false' || raw === '0') {
      return false;
    }
    return true;
  }
}
