import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { ListOperatorsQueryDto } from './dto/list-operators-query.dto';
import { OperatorResponseDto } from './dto/operator-response.dto';
import { OperatorsService } from './operators.service';

@ApiTags('Operators')
@Controller('operators')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('Bearer')
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear operador (vincular usuario + empresa + licencia)' })
  @ApiBody({ type: CreateOperatorDto })
  @ApiResponse({ status: 201, description: 'Operador creado.', type: OperatorResponseDto })
  @ApiResponse({ status: 400, description: 'Usuario ya vinculado como operador.' })
  @ApiResponse({ status: 404, description: 'Usuario o empresa no encontrados.' })
  @ApiResponse({ status: 409, description: 'Número de licencia ya existe.' })
  async create(@Body() dto: CreateOperatorDto) {
    return this.operatorsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar operadores (filtros: companyId, isValidated)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de operadores.' })
  async findAll(@Query() query: ListOperatorsQueryDto) {
    return this.operatorsService.findAllPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle operador (usuario, licencia, empresa)' })
  @ApiParam({ name: 'id', description: 'UUID del operador' })
  @ApiResponse({ status: 200, description: 'Operador con usuario y empresa.' })
  @ApiResponse({ status: 404, description: 'Operador no encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.operatorsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar operador (licencia, validado)' })
  @ApiParam({ name: 'id', description: 'UUID del operador' })
  @ApiBody({ type: UpdateOperatorDto })
  @ApiResponse({ status: 200, description: 'Operador actualizado.', type: OperatorResponseDto })
  @ApiResponse({ status: 404, description: 'Operador no encontrado.' })
  @ApiResponse({ status: 409, description: 'Número de licencia ya existe.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOperatorDto) {
    return this.operatorsService.update(id, dto);
  }
}
