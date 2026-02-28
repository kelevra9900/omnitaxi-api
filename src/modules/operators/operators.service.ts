import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { ListOperatorsQueryDto } from './dto/list-operators-query.dto';
import type { OperatorResponseDto } from './dto/operator-response.dto';
import { OperatorDashboardDto } from './dto/operator-dashboard.dto';
import { DateTime } from 'luxon';

@Injectable()
export class OperatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOperatorDto): Promise<OperatorResponseDto> {
    const [user, company, existingLicense] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
      this.prisma.company.findUnique({ where: { id: dto.companyId } }),
      this.prisma.operator.findUnique({ where: { licenseNumber: dto.licenseNumber } }),
    ]);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (!company) throw new NotFoundException('Empresa no encontrada');
    if (existingLicense)
      throw new ConflictException('Ya existe un operador con ese número de licencia');
    const existingOperatorForUser = await this.prisma.operator.findUnique({
      where: { userId: dto.userId },
    });
    if (existingOperatorForUser)
      throw new BadRequestException('Este usuario ya está vinculado como operador');

    const operator = await this.prisma.operator.create({
      data: {
        userId: dto.userId,
        companyId: dto.companyId,
        licenseNumber: dto.licenseNumber.trim(),
        licenseExpiresAt: dto.licenseExpiresAt ? new Date(dto.licenseExpiresAt) : null,
      },
    });
    return operator;
  }

  async findById(id: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
      include: { user: true, company: true },
    });
    if (!operator) throw new NotFoundException('Operador no encontrado');
    return operator;
  }

  async findAllPaginated(query: ListOperatorsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where: { companyId?: string; isValidated?: boolean } = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.isValidated != null) where.isValidated = query.isValidated;

    const [data, total] = await Promise.all([
      this.prisma.operator.findMany({
        where,
        orderBy: { licenseNumber: 'asc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              photoUrl: true,
              isActive: true,
            },
          },
          company: true,
        },
      }),
      this.prisma.operator.count({ where }),
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

  async update(id: string, dto: UpdateOperatorDto): Promise<OperatorResponseDto> {
    const operator = await this.prisma.operator.findUnique({ where: { id } });
    if (!operator) throw new NotFoundException('Operador no encontrado');
    if (dto.licenseNumber != null && dto.licenseNumber.trim() !== operator.licenseNumber) {
      const existing = await this.prisma.operator.findUnique({
        where: { licenseNumber: dto.licenseNumber.trim() },
      });
      if (existing) throw new ConflictException('Ya existe un operador con ese número de licencia');
    }
    const updated = await this.prisma.operator.update({
      where: { id },
      data: {
        ...(dto.licenseNumber != null && { licenseNumber: dto.licenseNumber.trim() }),
        ...(dto.licenseExpiresAt !== undefined && {
          licenseExpiresAt: dto.licenseExpiresAt ? new Date(dto.licenseExpiresAt) : null,
        }),
        ...(dto.isValidated !== undefined && { isValidated: dto.isValidated }),
      },
    });
    return updated;
  }

  async getDashboardData(operatorId: string): Promise<OperatorDashboardDto> {
    const zone = 'America/Mexico_City';
    const startOfToday = DateTime.now().setZone(zone).startOf('day').toJSDate();

    const [operator, activeTrip, statsToday] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: operatorId },
        select: { id: true, name: true },
      }),
      this.prisma.trip.findFirst({
        where: {
          operatorId,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
        include: {
          ticket: true,
          vehicle: true,
        },
      }),
      this.prisma.trip.count({
        where: {
          operatorId,
          status: 'COMPLETED',
          createdAt: { gte: startOfToday },
        },
      }),
    ]);

    if (!operator) {
      throw new NotFoundException('Operador no encontrado');
    }

    return {
      operator: {
        id: operator.id,
        name: operator.name,
        isOnline: true,
        rating: 5.0,
      },
      stats: {
        tripsToday: statsToday,
        activeVehicle: activeTrip?.vehicle?.plate || 'Sin asignar',
      },
      currentTrip: activeTrip
        ? {
            id: activeTrip.id,
            status: activeTrip.status, // TripStatus es asignable a string
            folio: activeTrip.ticket?.folio || 'SIN-FOLIO',
            destination: activeTrip.destination,
            passenger: {
              name: activeTrip.ticket?.guestName || 'Pasajero OMA',
              avatarChar: (activeTrip.ticket?.guestName || 'P')[0].toUpperCase(),
            },
            // Forzamos el retorno de string con un fallback
            startTime: DateTime.fromJSDate(activeTrip.startTime || activeTrip.createdAt)
              .setZone(zone)
              .toISO() as string,
          }
        : null,
    };
  }
}
