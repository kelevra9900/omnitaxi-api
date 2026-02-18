import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, type ValidatedUser } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

/** Usuario que devuelve Passport JWT (role como array para RolesGuard) */
export type RequestUser = {
  id: string;
  email: string;
  name: string;
  role: string[];
  isActive: boolean;
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Iniciar sesión',
    description:
      'Devuelve un JWT y los datos del usuario. Usar el token en cabecera `Authorization: Bearer <token>` en endpoints protegidos.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description: 'Login correcto. Devuelve access_token y usuario.',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos (email/contraseña).' })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o usuario inactivo.',
  })
  async login(@Body() loginDto: LoginDto) {
    const user: ValidatedUser | null = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.authService.login(user);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({
    summary: 'Renovar token',
    description:
      'Devuelve un nuevo access_token usando el Bearer actual. El token actual debe ser válido y el usuario activo.',
  })
  @ApiResponse({
    status: 201,
    description: 'Nuevo access_token y datos del usuario.',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Token inválido o usuario inactivo.' })
  refresh(@Req() req: { user: RequestUser }) {
    const u = req.user;
    const validatedUser: ValidatedUser = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: (u.role?.[0] ?? 'PASSENGER') as ValidatedUser['role'],
      isActive: u.isActive ?? true,
    };
    return this.authService.refreshFromValidatedUser(validatedUser);
  }

  @Post('register')
  @ApiOperation({
    summary: 'Registrar pasajero',
    description:
      'Registro público. Crea el usuario y devuelve access_token y usuario (login automático). Para otros roles usar POST /users como ADMIN.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado y autenticado. Devuelve access_token y usuario.',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos (validación).' })
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese correo.' })
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }
}
