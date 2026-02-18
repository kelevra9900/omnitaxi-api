import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from 'generated/prisma/enums';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripsService } from './trips.service';
import { PaginatedResponseDto } from '../users/dto/paginated-response.dto';
import { TripResponseDto } from './dto/trips-response.dto';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('Bearer')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar viajes',
    description: 'Paginación y busqueda avanzada',
  })
  @ApiResponse({
    status: 200,
    description: 'Listar viajes (paginado)',
    type: PaginatedResponseDto<TripResponseDto>,
  })
  getAllTrips(@Query() query: ListTripsQueryDto) {
    return this.tripsService.getAllTrips(query);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Iniciar viaje' })
  @ApiParam({ name: 'id', description: 'UUID del viaje' })
  @ApiResponse({ status: 200, description: 'Viaje iniciado.' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado.' })
  startTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripsService.startTrip(id);
  }

  // Current trip info
  @Get('current')
  @ApiOperation({ summary: 'Información actual del viaje' })
  @ApiParam({ name: 'id', description: 'UUID del viaje' })
  @ApiResponse({ status: 200, description: 'Información actual del viaje.' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado.' })
  getCurrentTripInfo(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripsService.getCurrentTripInfo(id);
  }

  // :id/complete
  @Patch(':id/complete')
  @ApiOperation({ summary: 'Completar viaje' })
  @ApiParam({ name: 'id', description: 'UUID del viaje' })
  @ApiResponse({ status: 200, description: 'Viaje completado.' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado.' })
  completeTrip(@Param('id', ParseUUIDPipe) id: string) {
    return this.tripsService.completeTrip(id);
  }
}
