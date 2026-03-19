import { PrismaService } from '@/prisma/prisma.service';
// dot env configuration?
import * as dotenv from 'dotenv';
dotenv.config();
import * as jwt from 'jsonwebtoken';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TicketWhereInput } from 'generated/prisma/models';
import { TicketStatus, TripStatus } from 'generated/prisma/enums';
import { TripsGateway } from './trip-websocket';
import { QRTicketPayload } from '@/common/interfaces/qr-ticket-payload.interface';
import { AssignTripDto } from './dto/assign-trip.dto';
import { GetAssignmentResourcesDto } from './dto/get-assignment-resources.dto';

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

  /**
   * Asignar un viaje a un pasajero
   */
  async assignTripToPassenger(data: AssignTripDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Validar Operador (como lo hicimos antes)
        const operator = await tx.operator.findUnique({
          where: { id: data.operatorId },
        });

        if (!operator || !operator.isValidated) {
          throw new BadRequestException('El operador no es válido o no está activo.');
        }

        // 2. CREAR EL TICKET (Ahora soporta Passenger o Guest)
        const newTicket = await tx.ticket.create({
          data: {
            folio: `TK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            price: data.price,
            status: TicketStatus.PAID,
            channel: data.channel,
            companyId: data.companyId,
            // Aquí está la magia: pasamos los 3, Prisma guarda los que tengan valor
            passengerId: data.passengerId,
            guestName: data.guestName,
            guestContact: data.guestContact,
          },
        });

        // 3. CREAR EL VIAJE (Vinculado al ticket)
        const newTrip = await tx.trip.create({
          data: {
            origin: data.origin,
            destination: data.destination,
            status: TripStatus.ASSIGNED,
            ticketId: newTicket.id,
            operatorId: data.operatorId,
            vehicleId: data.vehicleId,
            companyId: data.companyId,
          },
          include: {
            ticket: true,
            operator: { include: { user: { select: { name: true } } } },
            vehicle: true,
          },
        });

        return newTrip;
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Error al asignar el viaje.');
    }
  }

  // Genera algo como: OT-7K2L9X (OT de OmniTransit)
  generateFolio = (): string => {
    // Quitamos async y el Promise
    return `OT-${Math.random().toString(36).toUpperCase().substring(2, 8)}`;
  };

  // Ejemplo de lógica recomendada en el Backend (Controller/Service)
  async assignTrip(dto: AssignTripDto) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Crear el Ticket
      const ticket = await tx.ticket.create({
        data: {
          price: dto.price,
          channel: dto.channel,
          companyId: dto.companyId,
          passengerId: dto.passengerId || null,
          guestName: dto.guestName || null,
          guestContact: dto.guestContact || null,
          status: 'PAID',
          folio: this.generateFolio(),
        },
      });

      // 2. Crear el Trip vinculado
      const trip = await tx.trip.create({
        data: {
          ticketId: ticket.id,
          origin: dto.origin || 'GPS_UNKNOWN', // El backend puede sobreescribir esto con coords
          destination: dto.destination,
          operatorId: dto.operatorId,
          vehicleId: dto.vehicleId,
          companyId: dto.companyId,
          status: 'ASSIGNED',
        },
      });

      return { ticket, trip };
    });
  }
  /**
   * Obtener lo necesario para asignar un viaje a un pasajero
   *
   */
  async getAssignmentResources(query: GetAssignmentResourcesDto) {
    const { companyId } = query;

    // Condición para saber si un recurso está "Ocupado"
    const busyTripStatuses = [TripStatus.ASSIGNED, TripStatus.IN_PROGRESS];

    // Buscamos las compañías. Si mandaron companyId, filtramos solo esa.
    const companies = await this.prisma.company.findMany({
      where: companyId ? { id: companyId } : undefined,
      select: {
        id: true,
        name: true,
        // Traemos solo operadores DISPONIBLES de esta compañía
        operators: {
          where: {
            isValidated: true, // Debe estar validado
            trips: {
              none: {
                // NO debe tener viajes en estos estados
                status: { in: busyTripStatuses },
              },
            },
          },
          select: {
            id: true,
            licenseNumber: true,
            user: { select: { name: true, photoUrl: true } },
          },
        },
        // Traemos solo vehículos DISPONIBLES de esta compañía
        vehicles: {
          where: {
            isActive: true, // Debe estar activo
            trips: {
              none: {
                // NO debe tener viajes en estos estados
                status: { in: busyTripStatuses },
              },
            },
          },
          select: {
            id: true,
            plate: true,
          },
        },
      },
    });

    // Opcional: También podríamos traer las tarifas (Fares) homologadas
    // para que el frontend sepa cuánto cobrar.
    const fares = await this.prisma.fare.findMany({
      where: { isActive: true },
      select: { id: true, name: true, origin: true, destination: true, price: true },
    });

    return {
      companies,
      fares,
    };
  }
}
