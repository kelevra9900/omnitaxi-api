import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TicketWhereInput } from 'generated/prisma/models';
import { TripStatus } from 'generated/prisma/enums';
import { TripsGateway } from './trip-websocket';

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

  async startTrip(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.status !== TripStatus.ASSIGNED)
      throw new BadRequestException('Viaje no puede ser iniciado');
    return this.prisma.trip.update({ where: { id }, data: { status: TripStatus.IN_PROGRESS } });
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
}
