import { IsEmail, IsString, MinLength, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'passwordStrength', async: false })
class PasswordStrengthConstraint implements ValidatorConstraintInterface {
  validate(value: string) {
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);
    return hasLetter && hasNumber;
  }

  defaultMessage(args: ValidationArguments) {
    const value = args.value as string;
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);
    
    if (!hasLetter && !hasNumber) {
      return '密码必须包含字母和数字';
    }
    if (!hasLetter) {
      return '密码必须包含字母';
    }
    if (!hasNumber) {
      return '密码必须包含数字';
    }
    return '密码必须包含字母和数字';
  }
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @Validate(PasswordStrengthConstraint)
  password!: string;
}
