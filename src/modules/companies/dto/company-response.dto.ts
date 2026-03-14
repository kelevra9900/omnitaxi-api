import { ApiProperty } from '@nestjs/swagger';

export class CompanyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

class UserOperatorDto {
  @ApiProperty({ example: 'Juan Pérez' })
  name: string;

  @ApiProperty({ example: 'https://cdn.oma.com/profiles/juan.jpg', nullable: true })
  photoUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}

class OperatorDto {
  @ApiProperty({ example: 'uuid-operator-123' })
  id: string;

  @ApiProperty({ example: 'LIC-456789' })
  licenseNumber: string;

  @ApiProperty({ type: UserOperatorDto })
  user: UserOperatorDto;
}

export class CompanyWithOperatorsDto {
  @ApiProperty({ example: 'uuid-company-001' })
  id: string;

  @ApiProperty({ example: 'Omnitransit GDL' })
  name: string;

  @ApiProperty({ type: [OperatorDto] })
  operators: OperatorDto[];
}
