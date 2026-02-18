import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateFareDto } from './dto/create-fare.dto';
import { UpdateFareDto } from './dto/update-fare.dto';
import { ListFaresQueryDto } from './dto/list-fares-query.dto';
import type { FareResponseDto } from './dto/fare-response.dto';

@Injectable()
export class FaresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFareDto): Promise<FareResponseDto> {
    const origin = dto.origin.trim();
    const destination = dto.destination.trim();
    const existing = await this.prisma.fare.findUnique({
      where: { origin_destination: { origin, destination } },
    });
    if (existing) {
      throw new ConflictException('Ya existe una tarifa para ese origen-destino');
    }
    const fare = await this.prisma.fare.create({
      data: {
        name: dto.name.trim(),
        origin,
        destination,
        price: dto.price,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
    });
    return this.mapFare(fare);
  }

  async findById(id: string): Promise<FareResponseDto> {
    const fare = await this.prisma.fare.findUnique({ where: { id } });
    if (!fare) throw new NotFoundException('Tarifa no encontrada');
    return this.mapFare(fare);
  }

  async findAllPaginated(query: ListFaresQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = query.isActive != null ? { isActive: query.isActive } : {};

    const [data, total] = await Promise.all([
      this.prisma.fare.findMany({
        where,
        orderBy: [{ origin: 'asc' }, { destination: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.fare.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map((f) => this.mapFare(f)),
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

  async update(id: string, dto: UpdateFareDto): Promise<FareResponseDto> {
    const fare = await this.prisma.fare.findUnique({ where: { id } });
    if (!fare) throw new NotFoundException('Tarifa no encontrada');
    if (
      (dto.origin != null || dto.destination != null) &&
      (dto.origin?.trim() !== fare.origin || dto.destination?.trim() !== fare.destination)
    ) {
      const origin = (dto.origin ?? fare.origin).trim();
      const destination = (dto.destination ?? fare.destination).trim();
      const existing = await this.prisma.fare.findUnique({
        where: { origin_destination: { origin, destination } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Ya existe una tarifa para ese origen-destino');
      }
    }
    const updated = await this.prisma.fare.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.origin != null && { origin: dto.origin.trim() }),
        ...(dto.destination != null && { destination: dto.destination.trim() }),
        ...(dto.price != null && { price: dto.price }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
      },
    });
    return this.mapFare(updated);
  }

  private mapFare(f: {
    id: string;
    name: string;
    origin: string;
    destination: string;
    price: { toNumber(): number };
    isActive: boolean;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): FareResponseDto {
    return {
      id: f.id,
      name: f.name,
      origin: f.origin,
      destination: f.destination,
      price:
        typeof f.price === 'object' && f.price !== null && 'toNumber' in f.price
          ? (f.price as { toNumber(): number }).toNumber()
          : Number(f.price),
      isActive: f.isActive,
      effectiveFrom: f.effectiveFrom,
      effectiveTo: f.effectiveTo,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
  }
}
