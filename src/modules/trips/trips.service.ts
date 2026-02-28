import { PrismaService } from '@/prisma/prisma.service';
// dot env configuration?
import * as dotenv from 'dotenv';
dotenv.config();
import * as jwt from 'jsonwebtoken';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TicketWhereInput } from 'generated/prisma/models';
import { TicketStatus, TripStatus } from 'generated/prisma/enums';
import { TripsGateway } from './trip-websocket';
import { QRTicketPayload } from '@/common/interfaces/qr-ticket-payload.interface';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsGateway: TripsGateway,
  ) {}

  //### Boletos (consulta y gestión)
  //
  //Método | Ruta | Descripción |
  //-------|------|-------------|
  //`GET` | `/tickets` | Listar boletos (filtros: status, channel, companyId, fechas). |
  //`GET` | `/tickets/:id` | Detalle boleto (folio, pago, viaje asociado). |
  //`PATCH` | `/tickets/:id/cancel` | Cancelar boleto (admin, conforme políticas). |
  //`GET` | `/tickets/:id/refund-status` | Estado de reembolso. |

  createTicket() {}

  async getAllTrips(query: ListTripsQueryDto) {
    const { page = 1, limit = 10, status, companyId, operatorId, from, to } = query;
    const skip = (page - 1) * limit;

    // Construimos el filtro dinámico
    const where: TicketWhereInput = {
      trip: {
        // Filtros que viven dentro del modelo Trip
        is: {
          ...(status && { status }),
          ...(companyId && { companyId }),
          ...(operatorId && { operatorId }),
          ...((from || to) && {
            startTime: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }),
        },
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: {
          trip: {
            include: {
              operator: true,
              vehicle: true,
              company: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        pageSize: limit,
      },
    };
  }

  async getCurrentTrip(passengerId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: {
        // Buscamos a través de la relación del boleto
        ticket: {
          passengerId: passengerId,
        },
        // Solo nos interesa si el viaje está en curso
        status: TripStatus.IN_PROGRESS,
      },
      include: {
        operator: {
          select: {
            user: { select: { name: true, email: true } }, // Para mostrar "Tu chofer es Juan"
          },
        },
        vehicle: {
          select: {
            plate: true, // Para mostrar "Placas: OMA-402"
          },
        },
        ticket: {
          select: {
            folio: true,
          },
        },
      },
    });

    console.log('Trip getted ===>', trip);

    if (!trip) {
      throw new NotFoundException('No tienes ningún viaje en curso en este momento.');
    }

    return trip;
  }

  async startTrip(ticketToken: string, currentUserId: string) {
    // <-- Cambié el nombre para mayor claridad
    const qrSecret = process.env.QR_SECRET_KEY ?? '';
    let payload: QRTicketPayload;

    // 1. Validar el JWT del Código QR
    try {
      payload = jwt.verify(ticketToken, qrSecret) as QRTicketPayload;
    } catch {
      throw new BadRequestException('El Código QR es inválido o ha expirado.');
    }

    // 2. BUSCAR EL PERFIL DEL OPERADOR
    // Aquí buscamos al operador basándonos en el ID del usuario logueado
    const operator = await this.prisma.operator.findUnique({
      where: { userId: currentUserId }, // Ajusta "userId" si en tu Prisma se llama distinto
    });

    if (!operator) {
      throw new BadRequestException('Tu cuenta no tiene un perfil de operador asignado.');
    }

    // 3. Buscar el viaje
    const trip = await this.prisma.trip.findFirst({
      where: {
        ticketId: payload.ticketId,
        status: { in: [TripStatus.ASSIGNED] },
      },
      include: { ticket: true },
    });

    if (!trip) {
      throw new NotFoundException('No se encontró un viaje activo para este boleto.');
    }

    // 4. CANDADO DE SEGURIDAD CORREGIDO
    // Ahora comparamos contra operator.id, NO contra currentUserId
    if (trip.operatorId !== null && trip.operatorId !== operator.id) {
      throw new BadRequestException('Este servicio ya fue tomado por otro operador.');
    }

    // 5. Transacción Atómica
    return this.prisma.$transaction(async (prisma) => {
      // A. Boleto a estado "usado"
      await prisma.ticket.update({
        where: { id: trip.ticketId },
        data: { status: TicketStatus.USED },
      });

      // B. Viaje a estado "en curso" Y ASIGNACIÓN DEL OPERADOR CORRECTO
      const updatedTrip = await prisma.trip.update({
        where: { id: trip.id },
        data: {
          operatorId: operator.id, // <-- AQUÍ USAMOS EL ID DE LA TABLA OPERATOR
          status: TripStatus.IN_PROGRESS,
          startTime: new Date(),
        },
      });

      return updatedTrip;
    });
  }

  async getCurrentTripInfo(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    return trip;
  }

  async completeTrip(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.status !== TripStatus.IN_PROGRESS)
      throw new BadRequestException('Viaje no puede ser completado');
    return this.prisma.trip.update({ where: { id }, data: { status: TripStatus.COMPLETED } });
  }

  async updateLocation(tripId: string, lat: number, lng: number) {
    const updatedTrip = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        currentLat: lat,
        currentLng: lng,
        locationUpdatedAt: new Date(),
      },
    });

    this.tripsGateway.emitLocationUpdate(tripId, { lat, lng });

    return updatedTrip;
  }

  //**
  // My trips history
  //
  /**
   * Historial completo de viajes para un pasajero
   */
  async getMyTripsHistory(passengerId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    // Ejecutamos ambas consultas en paralelo para mayor rendimiento
    const [trips, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where: {
          ticket: { passengerId },
        },
        include: {
          // Necesitamos al operador para mostrar quién lo llevó
          operator: {
            select: {
              user: { select: { name: true } },
            },
          },
          // Necesitamos el vehículo para mostrar la "Unidad: OMA-402"
          vehicle: {
            select: { plate: true },
          },
          // Necesitamos el ticket para el folio y el precio pagado
          ticket: {
            select: {
              folio: true,
              price: true,
              status: true,
            },
          },
        },
        // IMPORTANTÍSIMO: Los más recientes primero
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),

      // Contamos el total para los metadatos de paginación
      this.prisma.trip.count({
        where: { ticket: { passengerId } },
      }),
    ]);

    return {
      data: trips,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    };
  }
}
