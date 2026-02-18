import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from 'generated/prisma/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'Juan Pérez', description: 'Nombre completo del usuario' })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'juan@omnitransit.com',
    description: 'Correo electrónico (único)',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'passwordSeguro123',
    description: 'Contraseña (mínimo 6 caracteres)',
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;

  @ApiPropertyOptional({
    enum: Role,
    default: Role.PASSENGER,
    description: 'Rol del usuario',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role = Role.PASSENGER;
}
