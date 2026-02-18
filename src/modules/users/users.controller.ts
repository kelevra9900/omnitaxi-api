import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Role } from 'generated/prisma/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginatedUsersResponseDto } from './dto/paginated-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfiledto, UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';
import { GetUserId } from '@/common/decorators/user.decorator';

@ApiTags('Users')
@ApiBearerAuth('Bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Crear usuario',
    description:
      'Registra un nuevo usuario. Solo administradores. Para registro público de pasajeros usar POST /auth/register.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado correctamente (sin contraseña en respuesta).',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos (validación).' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN).' })
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese correo.' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Listar usuarios (paginado)',
    description:
      'Devuelve usuarios con paginación y filtros opcionales (rol, estado, búsqueda por nombre/email). Solo ADMIN.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de usuarios (sin contraseñas).',
    type: PaginatedUsersResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Parámetros de consulta inválidos.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN).' })
  async findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAllPaginated(query);
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.PASSENGER, Role.COMPANY, Role.OPERATOR)
  @ApiResponse({
    status: 200,
    description: 'Usuario encontrado.',
    type: UserProfiledto,
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async handleProfile(@GetUserId() userId: string) {
    if (!userId) {
      throw new UnauthorizedException('No se pudo identificar al usuario');
    }

    return this.usersService.handleUserProfile(userId);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Obtener usuario por ID',
    description: 'Devuelve un usuario por su ID. Solo ADMIN.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID del usuario',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario encontrado.',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN).' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualizar usuario',
    description:
      'Actualización parcial. Solo se modifican los campos enviados (nombre, email, rol, estado activo, contraseña). Solo ADMIN.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID del usuario',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: 'Usuario actualizado (sin contraseña en respuesta).',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos (validación).' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos (requiere ADMIN).' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese correo.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return await this.usersService.update(id, dto);
  }
}
