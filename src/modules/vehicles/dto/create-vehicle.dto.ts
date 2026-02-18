import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ example: 'ABC-123', description: 'Placa del vehículo (única)' })
  @IsString()
  @MinLength(1)
  plate!: string;

  @ApiProperty({ description: 'ID de la empresa operadora' })
  @IsUUID()
  companyId!: string;
}
