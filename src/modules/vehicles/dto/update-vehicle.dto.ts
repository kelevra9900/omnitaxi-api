import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: 'ABC-123', description: 'Placa del vehículo' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  plate?: string;

  @ApiPropertyOptional({ description: 'Vehículo activo' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
