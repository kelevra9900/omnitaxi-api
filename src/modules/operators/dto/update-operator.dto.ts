import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'UUID de la empresa a la que pertenece el operador' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ description: 'UUID del vehículo asignado al operador (null para desasignar)' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;
}
