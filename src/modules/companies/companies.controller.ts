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
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CompaniesService } from './companies.service';

@ApiTags('Companies')
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('Bearer')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear empresa operadora' })
  @ApiBody({ type: CreateCompanyDto })
  @ApiResponse({ status: 201, description: 'Empresa creada.', type: CompanyResponseDto })
  @ApiResponse({ status: 409, description: 'Ya existe una empresa con ese nombre.' })
  async create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar empresas (paginado)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de empresas.' })
  async findAll(@Query() query: ListCompaniesQueryDto) {
    return this.companiesService.findAllPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle empresa (con operadores y vehículos)' })
  @ApiParam({ name: 'id', description: 'UUID de la empresa' })
  @ApiResponse({
    status: 200,
    description: 'Empresa con operadores y vehículos.',
    type: CompanyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Empresa no encontrada.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar empresa' })
  @ApiParam({ name: 'id', description: 'UUID de la empresa' })
  @ApiBody({ type: UpdateCompanyDto })
  @ApiResponse({ status: 200, description: 'Empresa actualizada.', type: CompanyResponseDto })
  @ApiResponse({ status: 404, description: 'Empresa no encontrada.' })
  @ApiResponse({ status: 409, description: 'Ya existe una empresa con ese nombre.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }
}
