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
import { CreateFareDto } from './dto/create-fare.dto';
import { UpdateFareDto } from './dto/update-fare.dto';
import { ListFaresQueryDto } from './dto/list-fares-query.dto';
import { FareResponseDto } from './dto/fare-response.dto';
import { FaresService } from './fares.service';

@ApiTags('Fares')
@Controller('fares')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.PASSENGER)
@ApiBearerAuth('Bearer')
export class FaresController {
  constructor(private readonly faresService: FaresService) {}

  @Post()
  @ApiOperation({ summary: 'Crear/definir tarifa (autorización admin)' })
  @ApiBody({ type: CreateFareDto })
  @ApiResponse({ status: 201, description: 'Tarifa creada.', type: FareResponseDto })
  @ApiResponse({ status: 409, description: 'Ya existe tarifa para ese origen-destino.' })
  async create(@Body() dto: CreateFareDto) {
    return this.faresService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tarifas vigentes' })
  @ApiResponse({ status: 200, description: 'Lista paginada de tarifas.' })
  async findAll(@Query() query: ListFaresQueryDto) {
    return this.faresService.findAllPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle tarifa' })
  @ApiParam({ name: 'id', description: 'UUID de la tarifa' })
  @ApiResponse({ status: 200, description: 'Tarifa.', type: FareResponseDto })
  @ApiResponse({ status: 404, description: 'Tarifa no encontrada.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.faresService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tarifa' })
  @ApiParam({ name: 'id', description: 'UUID de la tarifa' })
  @ApiBody({ type: UpdateFareDto })
  @ApiResponse({ status: 200, description: 'Tarifa actualizada.', type: FareResponseDto })
  @ApiResponse({ status: 404, description: 'Tarifa no encontrada.' })
  @ApiResponse({ status: 409, description: 'Ya existe tarifa para ese origen-destino.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFareDto) {
    return this.faresService.update(id, dto);
  }
}
