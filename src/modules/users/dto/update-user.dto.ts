import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from 'generated/prisma/enums';

/**
 * DTO para actualización parcial de usuario.
 * Solo se actualizan los campos enviados.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Juan Pérez',
    description: 'Nombre completo del usuario',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'juan.nuevo@omnitransit.com',
    description: 'Correo electrónico (debe ser único)',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'nuevaPassword123',
    description: 'Nueva contraseña (mínimo 6 caracteres). Omitir para no cambiar.',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;

  @ApiPropertyOptional({
    enum: Role,
    description: 'Rol del usuario',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Usuario activo (puede iniciar sesión) o inactivo',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
