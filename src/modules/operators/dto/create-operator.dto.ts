import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateOperatorDto {
  @ApiProperty({ description: 'ID del usuario a vincular como operador' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'ID de la empresa operadora' })
  @IsUUID()
  companyId!: string;

  @ApiProperty({ example: 'LIC-12345', description: 'Número de licencia (único)' })
  @IsString()
  @MinLength(1)
  licenseNumber!: string;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento de la licencia (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  licenseExpiresAt?: string;
}
