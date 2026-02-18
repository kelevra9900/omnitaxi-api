import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT de acceso para usar en cabecera Authorization: Bearer <token>',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token!: string;

  @ApiProperty({
    description: 'Datos del usuario autenticado (sin contraseña)',
  })
  user!: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  };
}
