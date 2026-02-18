import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Transportes Unidos SA', description: 'Nombre de la empresa (único)' })
  @IsString()
  @MinLength(1)
  name!: string;
}
