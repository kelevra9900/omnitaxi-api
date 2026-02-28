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

  async validateAndStartTrip(operatorId: string, vehicleId: string, dto: ValidateTicketDto) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Asegúrate de que el ticket incluya el trip en la búsqueda inicial
      const ticket = await tx.ticket.findUnique({
        where: { folio: dto.folio },
        include: { trip: true }, // Crucial para que ticket.trip no sea 'any'
      });

      // 2. Validación de seguridad (Type Guard)
      if (!ticket || !ticket.trip) {
        throw new NotFoundException('El boleto no tiene un viaje asociado.');
      }

      // 3. Actualizaciones
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.USED as TicketStatus },
      });

      // Ahora TS sabe que ticket.trip.id existe y es un string
      const updatedTrip = await tx.trip.update({
        where: { id: ticket.trip.id },
        data: {
          status: TripStatus.IN_PROGRESS,
          startTime: new Date(),
          operatorId: operatorId,
          vehicleId: vehicleId,
        },
      });

      return updatedTrip;
    });
  }

  async issueTicket(
    dto: CreateTicketDto,
  ): Promise<{ ticket: any; tripId: string; message: string }> {
    // 1. Validar Tarifa Homologada
    const fare = await this.prisma.fare.findFirst({
      where: {
        origin: { equals: dto.origin, mode: 'insensitive' },
        destination: { equals: dto.destination, mode: 'insensitive' },
        isActive: true,
      },
    });

    if (!fare) {
      throw new BadRequestException('No existe una tarifa oficial para esa ruta.');
    }

    // 2. Generar Folio (OMA-Año-Contador)
    const year = new Date().getFullYear();
    const ticketCount = await this.prisma.ticket.count();
    const folio = `OMA-${year}-${(ticketCount + 1).toString().padStart(5, '0')}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 3. Crear el Ticket según tu modelo exacto
        const ticket = await tx.ticket.create({
          data: {
            folio,
            price: fare.price,
            channel: dto.channel,
            status: TicketStatus.PAID, // Marcamos como pagado de entrada
            paidAt: new Date(),
            paymentReference: dto.paymentReference,
            companyId: dto.companyId,
            passengerId: dto.passengerId || null,
            guestName: dto.guestName || null,
            // guestContact puede ser el mismo paymentReference o un campo del DTO
          },
        });

        const trip = await tx.trip.create({
          data: {
            origin: dto.origin,
            destination: dto.destination,
            status: TripStatus.ASSIGNED,
            ticketId: ticket.id,
            companyId: dto.companyId,
          },
        });

        // 5. Auditoría
        await tx.auditLog.create({
          data: {
            action: 'TICKET_ISSUED',
            resourceType: 'Ticket',
            resourceId: ticket.id,
            userId: dto.passengerId || 'SYSTEM_GUEST',
            metadata: { folio, tripId: trip.id },
          },
        });

        return {
          ticket,
          tripId: trip.id,
          message: 'Boleto emitido con éxito. OMA te desea un buen viaje.',
        };
      });
    } catch (error) {
      console.error('Error en transacción de ticket:', error);
      throw new InternalServerErrorException('Error al procesar la vinculación del servicio.');
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
            destination: true,
            origin: true,
            startTime: true,
            endTime: true,
            status: true,
            vehicle: {
              select: {
                plate: true, // Para mostrar "Unidad: OMA-402"
              },
            },
            operator: {
              select: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Traer el más reciente
      },
    });
    const qrSecret = process.env.QR_SECRET_KEY ?? '';
    // Leemos la variable de entorno, con 1 minuto como fallback de seguridad
    const qrExpiresIn = (process.env.QR_EXPIRES_IN || '1m') as any;

    if (!ticket) {
      return {
        message: 'No tienes tickets activos',
        qrCodePayload: null,
      };
    }

    const payload: QRTicketPayload = {
      ticketId: ticket.id,
      folio: ticket.folio,
    };

    // Usamos la variable dinámica
    const qrData = jwt.sign(payload, qrSecret, { expiresIn: qrExpiresIn });

    return {
      ...ticket,
      qrCodePayload: qrData,
    };
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
        include: {
          company: true,
          passenger: {
            select: {
              name: true,
              email: true,
              photoUrl: true,
            },
          },
          trip: true,
        },
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

  async validateTicket(dto: ValidateTicketDto) {
    // 1. Incluimos el 'trip' para saber a dónde va el pasajero de inmediato
    const ticket = await this.prisma.ticket.findUnique({
      where: { folio: dto.folio },
      include: {
        trip: true,
        passenger: { select: { name: true, email: true } }, // Para que el chofer confirme el nombre
      },
    });

    // 2. Validaciones Críticas
    if (!ticket) throw new NotFoundException('Boleto no encontrado');

    // Verificar si el boleto ya fue usado
    if (ticket.status === TicketStatus.USED) {
      throw new BadRequestException('Este boleto ya ha sido utilizado.');
    }

    // Verificar si está pagado (si es de la App)
    if (ticket.status === TicketStatus.PENDING) {
      throw new BadRequestException('El boleto aún no ha sido liquidado.');
    }

    // 3. Retornar información útil para la App del Operador
    return {
      id: ticket.id,
      folio: ticket.folio,
      passengerName: ticket.passenger?.name || ticket.guestName || 'Pasajero General',
      origin: ticket.trip?.origin,
      destination: ticket.trip?.destination,
      price: ticket.price,
      status: ticket.status,
      tripId: ticket.trip?.id,
    };
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
