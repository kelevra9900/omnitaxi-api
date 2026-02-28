import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from 'generated/prisma/enums';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripsService } from './trips.service';
import { PaginatedResponseDto } from '../users/dto/paginated-response.dto';
import { TripResponseDto } from './dto/trips-response.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { GetUserId } from '@/common/decorators/user.decorator';

@ApiTags('Trips')
@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
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

  @Post('start') // Ya no dependemos de /:id/start
  @ApiOperation({ summary: 'Iniciar viaje escaneando el QR del pasajero' })
  @ApiResponse({ status: 200, description: 'Viaje iniciado y boleto validado.' })
  @ApiResponse({ status: 400, description: 'Boleto inválido o viaje no asignado a ti.' })
  startTrip(@Body() startTripDto: StartTripDto, @GetUserId() userId: string) {
    // Le pasamos el token del QR y el ID del operador que lo escaneó
    return this.tripsService.startTrip(startTripDto.ticketToken, userId);
  }

  @Get('current')
  @ApiOperation({ summary: 'Obtener el viaje en curso del pasajero' })
  @ApiResponse({ status: 200, description: 'Viaje en curso encontrado.' })
  @ApiResponse({ status: 404, description: 'No hay viajes activos.' })
  getCurrentTrip(@GetUserId() userId: string) {
    return this.tripsService.getCurrentTrip(userId);
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

  @Get('history')
  @ApiOperation({ summary: 'Obtener el historial completo de viajes del pasajero' })
  @ApiResponse({ status: 200, description: 'Historial paginado obtenido correctamente.' })
  getMyTripsHistory(
    @GetUserId() userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    // req.user.id viene del JWT (Token de sesión)
    return this.tripsService.getMyTripsHistory(userId, page, limit);
  }
}
