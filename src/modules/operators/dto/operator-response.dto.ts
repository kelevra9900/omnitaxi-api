import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OperatorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  licenseNumber!: string;

  @ApiPropertyOptional()
  licenseExpiresAt!: Date | null;

  @ApiProperty()
  isValidated!: boolean;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  companyId!: string;
}
