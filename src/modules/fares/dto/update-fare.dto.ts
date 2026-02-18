import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateFareDto {
  @ApiPropertyOptional({ description: 'Nombre de la tarifa' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: 'Origen' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  origin?: string;

  @ApiPropertyOptional({ description: 'Destino' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  destination?: string;

  @ApiPropertyOptional({ description: 'Precio' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Tarifa activa' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Vigente hasta (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
