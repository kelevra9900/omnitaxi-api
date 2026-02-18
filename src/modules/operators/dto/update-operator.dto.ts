import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateOperatorDto {
  @ApiPropertyOptional({ example: 'LIC-12345', description: 'Número de licencia' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  licenseNumber?: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento de la licencia (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  licenseExpiresAt?: string;

  @ApiPropertyOptional({ description: 'Operador validado (identidad/licencia)' })
  @IsOptional()
  @IsBoolean()
  isValidated?: boolean;
}
