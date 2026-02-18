import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import type { CompanyResponseDto } from './dto/company-response.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    const existing = await this.prisma.company.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException('Ya existe una empresa con ese nombre');
    }
    return this.prisma.company.create({
      data: { name: dto.name.trim() },
    });
  }

  async findById(id: string): Promise<CompanyResponseDto> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        operators: { include: { user: true } },
        vehicles: true,
      },
    });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return company;
  }

  async findAllPaginated(query: ListCompaniesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = query.search
      ? { name: { contains: query.search.trim(), mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
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

  async update(id: string, dto: UpdateCompanyDto): Promise<CompanyResponseDto> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }
    if (dto.name != null && dto.name.trim() !== company.name) {
      const existing = await this.prisma.company.findUnique({
        where: { name: dto.name.trim() },
      });
      if (existing) {
        throw new ConflictException('Ya existe una empresa con ese nombre');
      }
    }
    return this.prisma.company.update({
      where: { id },
      data: dto.name != null ? { name: dto.name.trim() } : {},
    });
  }
}
