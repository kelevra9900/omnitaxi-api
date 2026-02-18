import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto';
import type { VehicleResponseDto } from './dto/vehicle-response.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVehicleDto): Promise<VehicleResponseDto> {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    const plate = dto.plate.trim().toUpperCase();
    const existing = await this.prisma.vehicle.findUnique({
      where: { plate },
    });
    if (existing) throw new ConflictException('Ya existe un vehículo con esa placa');

    return this.prisma.vehicle.create({
      data: { plate, companyId: dto.companyId },
    });
  }

  async findById(id: string): Promise<VehicleResponseDto> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    return vehicle;
  }

  async findAllPaginated(query: ListVehiclesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where: { companyId?: string; isActive?: boolean } = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.isActive != null) where.isActive = query.isActive;

    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { plate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
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

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleResponseDto> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
    if (dto.plate != null) {
      const plate = dto.plate.trim().toUpperCase();
      if (plate !== vehicle.plate) {
        const existing = await this.prisma.vehicle.findUnique({ where: { plate } });
        if (existing) throw new ConflictException('Ya existe un vehículo con esa placa');
      }
    }
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.plate != null && { plate: dto.plate.trim().toUpperCase() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
