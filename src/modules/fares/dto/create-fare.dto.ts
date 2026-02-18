import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFareDto {
  @ApiProperty({ example: 'Ruta Centro-Aeropuerto', description: 'Nombre de la tarifa' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'Centro', description: 'Origen' })
  @IsString()
  @MinLength(1)
  origin!: string;

  @ApiProperty({ example: 'Aeropuerto', description: 'Destino' })
  @IsString()
  @MinLength(1)
  destination!: string;

  @ApiProperty({ example: 150.5, description: 'Precio' })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ description: 'Vigente desde (ISO 8601). Por defecto ahora.' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Vigente hasta (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
