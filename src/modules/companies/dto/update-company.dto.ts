import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Transportes Unidos SA', description: 'Nombre de la empresa' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
