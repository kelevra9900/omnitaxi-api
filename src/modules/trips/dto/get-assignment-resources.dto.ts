// dto/get-assignment-resources.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class GetAssignmentResourcesDto {
  @ApiPropertyOptional({
    description: 'Filtrar operadores y vehículos por una compañía específica',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El companyId debe ser un UUID válido' })
  companyId?: string;
}
