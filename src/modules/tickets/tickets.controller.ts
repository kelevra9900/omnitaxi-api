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
  Request,
  Req,
  NotFoundException,
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
import { TicketsService } from './tickets.service';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { CancelTicketDto } from './dto/cancel-ticket.dto';
import { CreateTicketDto, ValidateTicketDto } from './create-ticket.dto';
import { TicketHistoryQueryDto } from './dto/ticket-history.dto';
import { RequestUser } from '../auth/auth.controller';

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('reserve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PASSENGER)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Emitir boleto (app o admin)' })
  @ApiResponse({
    status: 201,
    description: 'Boleto emitido con folio único tras validación de pago.',
  })
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.issueTicket(createTicketDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Listar boletos (admin). Filtros: status, channel, companyId, fechas.' })
  @ApiResponse({ status: 200, description: 'Lista paginada de boletos.' })
  findAll(@Query() query: ListTicketsQueryDto) {
    return this.ticketsService.findAllPaginated(query);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Obtener historial de viajes del pasajero' })
  getHistory(@Query() query: TicketHistoryQueryDto, @Req() req: { user: RequestUser }) {
    const passengerId = req.user.id;
    return this.ticketsService.getPassengerHistory(passengerId, query);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Obtiene tickets activos del usuario' })
  getActiveTickets(@Request() req: { user: RequestUser }) {
    const userId = req.user.id;
    return this.ticketsService.findActiveTicket(userId);
  }

  @Get('by-folio/:folio')
  @ApiOperation({ summary: 'Obtener boleto por folio' })
  @ApiParam({ name: 'folio', description: 'Folio del boleto' })
  @ApiResponse({ status: 200, description: 'Detalle del boleto.' })
  findByFolio(@Param('folio') folio: string) {
    return this.ticketsService.findByFolio(folio);
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Obtiene el ticket pagado listo para generar QR' })
  @ApiResponse({ status: 200, description: 'Ticket actual con payload para QR.' })
  @ApiResponse({ status: 404, description: 'No se encontró un ticket pagado.' })
  async getCurrentTicket(@Req() req: { user: RequestUser }) {
    const ticket = await this.ticketsService.getCurrentTicket(req.user.id);
    if (!ticket) {
      throw new NotFoundException('No tienes un ticket activo para abordar.');
    }
    return ticket;
  }

  @Get(':id/refund-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Estado de reembolso del boleto' })
  @ApiParam({ name: 'id', description: 'UUID del boleto' })
  @ApiResponse({ status: 200, description: 'Estado de reembolso.' })
  @ApiResponse({ status: 404, description: 'Boleto no encontrado.' })
  getRefundStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketsService.getRefundStatus(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Detalle boleto por ID (admin)' })
  @ApiParam({ name: 'id', description: 'UUID del boleto' })
  @ApiResponse({ status: 200, description: 'Boleto con empresa, pasajero y viaje.' })
  @ApiResponse({ status: 404, description: 'Boleto no encontrado.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ticketsService.findById(id);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Cancelar boleto (admin, conforme políticas)' })
  @ApiParam({ name: 'id', description: 'UUID del boleto' })
  @ApiBody({ type: CancelTicketDto })
  @ApiResponse({ status: 200, description: 'Boleto cancelado.' })
  @ApiResponse({ status: 400, description: 'Boleto ya cancelado o viaje ya iniciado.' })
  @ApiResponse({ status: 404, description: 'Boleto no encontrado.' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() body: CancelTicketDto) {
    return this.ticketsService.cancel(id, body.reason);
  }
  /**
   * Endpoint validate-ticket
   * @new usem to validate-ticket instead
   * @Return TicketResponseDto
   * @example
   * {
   *   "folio": "1234567890"
   * }
   */
  @Post('validate-ticket')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.PASSENGER)
  @ApiBearerAuth('Bearer')
  @ApiOperation({ summary: 'Validar boleto (app o admin)' })
  @ApiResponse({ status: 200, description: 'Boleto validado.' })
  @ApiResponse({ status: 400, description: 'Boleto no válido.' })
  @ApiResponse({ status: 404, description: 'Boleto no encontrado.' })
  validateTicket(@Body() validateTicketDto: ValidateTicketDto) {
    return this.ticketsService.validateTicket(validateTicketDto);
  }
}
