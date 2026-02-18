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
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import { VehicleResponseDto } from './dto/vehicle-response.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('Vehicles')
@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('Bearer')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear vehículo (placa, empresa)' })
  @ApiBody({ type: CreateVehicleDto })
  @ApiResponse({ status: 201, description: 'Vehículo creado.', type: VehicleResponseDto })
  @ApiResponse({ status: 404, description: 'Empresa no encontrada.' })
  @ApiResponse({ status: 409, description: 'Ya existe un vehículo con esa placa.' })
  async create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar vehículos (filtro: companyId, isActive)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de vehículos.' })
  async findAll(@Query() query: ListVehiclesQueryDto) {
    return this.vehiclesService.findAllPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle vehículo' })
  @ApiParam({ name: 'id', description: 'UUID del vehículo' })
  @ApiResponse({ status: 200, description: 'Vehículo.', type: VehicleResponseDto })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar vehículo (placa, isActive)' })
  @ApiParam({ name: 'id', description: 'UUID del vehículo' })
  @ApiBody({ type: UpdateVehicleDto })
  @ApiResponse({ status: 200, description: 'Vehículo actualizado.', type: VehicleResponseDto })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado.' })
  @ApiResponse({ status: 409, description: 'Ya existe un vehículo con esa placa.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }
}
