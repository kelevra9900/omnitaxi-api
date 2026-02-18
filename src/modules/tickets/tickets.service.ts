import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '@/prisma/prisma.service';
import { RefundStatus, TripStatus } from 'generated/prisma/enums';
import { TicketStatus } from 'generated/prisma/enums';
import type { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { CreateTicketDto, ValidateTicketDto } from './create-ticket.dto';
import { Ticket } from 'generated/prisma/client';
import { TicketHistoryQueryDto } from './dto/ticket-history.dto';

interface QRTicketPayload {
  ticketId: string;
  folio: string;
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPassengerHistory(passengerId: string, query: TicketHistoryQueryDto) {
    const { status, page, limit } = query;
    const skip = (page ?? 1 - 1) * (limit ?? 10);

    const where = {
      passengerId,
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          trip: {
            include: {
              operator: { include: { user: { select: { name: true } } } },
              vehicle: { select: { plate: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' }, // Trazabilidad cronológica
        skip,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data, // Cada ticket incluirá su objeto 'trip' con los datos de auditoría
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / (limit ?? 10)),
      },
    };
  }

  async issueTicket(
    dto: CreateTicketDto,
  ): Promise<{ ticket: Ticket; tripId: string; message: string }> {
    // 1. Validar la tarifa homologada para asegurar integridad de precios
    const fare = await this.prisma.fare.findFirst({
      where: {
        origin: dto.origin,
        destination: dto.destination,
        isActive: true,
      },
    });

    if (!fare) {
      throw new BadRequestException('No existe una tarifa oficial para esa ruta.');
    }

    // 2. Generar Folio Único e Irrepetible (Formato OMA-Año-Random)
    const year = new Date().getFullYear();
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const folio = `OMA-${year}-${randomSuffix}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 3. Crear el Ticket (Asociación con Pasajero o Guest)
        const ticket = await tx.ticket.create({
          data: {
            folio,
            price: fare.price, // Usamos el precio de la DB, no el del DTO
            channel: dto.channel,
            status: TicketStatus.PAID, // En App Móvil nace como PAID tras auth exitosa
            paidAt: new Date(),
            paymentReference: dto.paymentReference,
            companyId: dto.companyId,
            passengerId: dto.passengerId,
            guestName: dto.guestName,
            guestContact: dto.paymentReference,
          },
        });

        // 4. Crear el Trip asociado para Monitoreo en Tiempo Real
        // Nota: En este punto el Trip queda ASSIGNED pero sin operador fijo
        // hasta que un operador realice la validación por QR.
        const trip = await tx.trip.create({
          data: {
            status: TripStatus.ASSIGNED,
            origin: dto.origin,
            destination: dto.destination,
            ticketId: ticket.id,
            companyId: dto.companyId,
            operatorId: 'temporary-placeholder-id',
            vehicleId: 'temporary-placeholder-id',
          },
        });

        // 5. Registrar en AuditLog para Auditoría
        await tx.auditLog.create({
          data: {
            action: 'TICKET_ISSUED',
            resourceType: 'Ticket',
            resourceId: ticket.id,
            userId: dto.passengerId || 'SYSTEM_GUEST',
            metadata: { folio, fareId: fare.id, tripId: trip.id },
          },
        });

        return {
          ticket,
          tripId: trip.id,
          message: 'Boleto emitido con éxito. Listo para abordar.',
        };
      });
    } catch (error) {
      console.error('Error al emitir boleto:', error);
      throw new InternalServerErrorException('Error en la vinculación obligatoria del servicio.');
    }
  }

  async findActiveTicket(userId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        passengerId: userId,
        status: {
          in: [TicketStatus.PAID, TicketStatus.VALIDATED],
        },
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        trip: {
          select: {
            status: true,
            vehicle: {
              select: {
                plate: true, // Para mostrar "Unidad: OMA-402"
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Traer el más reciente
      },
    });

    if (!ticket) {
      throw new NotFoundException('No tienes tickets activos en este momento.');
    }

    return ticket;
  }

  async getCurrentTicket(userId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        passengerId: userId,
        status: 'PAID',
      },
      include: { trip: true, company: true },
    });

    if (!ticket) return null;

    const qrSecret = process.env.QR_SECRET_KEY;
    if (!qrSecret) {
      throw new InternalServerErrorException('QR_SECRET_KEY no definida');
    }
    const payload: QRTicketPayload = {
      ticketId: ticket.id,
      folio: ticket.folio,
    };
    const qrData = jwt.sign(payload, qrSecret, { expiresIn: '1m' });

    return {
      ...ticket,
      qrCodePayload: qrData,
    };
  }

  async findByFolio(folio: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { folio },
      include: { company: true, passenger: true, trip: true },
    });
    if (!ticket) throw new NotFoundException('Boleto no encontrado');
    return ticket;
  }

  async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { company: true, passenger: true, trip: true },
    });
    if (!ticket) throw new NotFoundException('Boleto no encontrado');
    return ticket;
  }

  async findAllPaginated(query: ListTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where: {
      status?: TicketStatus;
      channel?: import('generated/prisma/enums').SaleChannel;
      companyId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (query.status != null) where.status = query.status;
    if (query.channel != null) where.channel = query.channel;
    if (query.companyId != null) where.companyId = query.companyId;
    if (query.from != null || query.to != null) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { company: true, passenger: true, trip: true },
      }),
      this.prisma.ticket.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async cancel(id: string, reason?: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: { trip: true } });
    if (!ticket) throw new NotFoundException('Boleto no encontrado');
    if (ticket.status === TicketStatus.CANCELLED)
      throw new BadRequestException('El boleto ya está cancelado');
    if (ticket.trip?.startTime)
      throw new BadRequestException('No se puede cancelar un boleto cuyo viaje ya inició');
    await this.prisma.ticket.update({
      where: { id },
      data: {
        status: TicketStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
        refundStatus: RefundStatus.PENDING,
      },
    });
    return this.findById(id);
  }

  async validateTicket(validateTicketDto: ValidateTicketDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { folio: validateTicketDto.folio },
    });
    if (!ticket) throw new NotFoundException('Boleto no encontrado');
    return ticket;
  }

  async getRefundStatus(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true, folio: true, refundStatus: true, cancelledAt: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Boleto no encontrado');
    return ticket;
  }
}
