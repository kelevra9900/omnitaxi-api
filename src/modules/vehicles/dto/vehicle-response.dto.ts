import { ApiProperty } from '@nestjs/swagger';

export class VehicleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  companyId!: string;
}
