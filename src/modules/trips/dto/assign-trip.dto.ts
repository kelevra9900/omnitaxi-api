import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  Min,
  ValidateIf,
  IsOptional,
} from 'class-validator';
import { SaleChannel } from 'generated/prisma/enums';

export class AssignTripDto {
  // --- RUTAS Y TARIFAS ---
  @ApiProperty({ description: 'Origen del viaje' })
  @IsString()
  @IsNotEmpty()
  origin: string;

  @ApiProperty({ description: 'Destino del viaje' })
  @IsString()
  @IsNotEmpty()
  destination: string;

  @ApiProperty({ description: 'Precio a cobrar' })
  @IsNumber()
  @Min(0)
  price: number;

  // --- DATOS DEL PASAJERO (Validación Condicional) ---

  // Es obligatorio SI NO hay guestName
  @ApiPropertyOptional({ description: 'ID del pasajero registrado (opcional si es invitado)' })
  @ValidateIf((o) => !o.guestName)
  @IsUUID('4')
  passengerId?: string;

  // Es obligatorio SI NO hay passengerId
  @ApiPropertyOptional({
    description: 'Nombre del pasajero invitado (opcional si hay passengerId)',
  })
  @ValidateIf((o) => !o.passengerId)
  @IsString()
  @IsNotEmpty()
  guestName?: string;

  // Contacto opcional del invitado
  @ApiPropertyOptional({ description: 'Teléfono o email del invitado' })
  @ValidateIf((o) => !o.passengerId)
  @IsString()
  @IsOptional()
  guestContact?: string;

  // --- DATOS OPERATIVOS ---
  @ApiProperty({ description: 'ID del operador' })
  @IsUUID('4')
  operatorId: string;

  @ApiProperty({ description: 'ID del vehículo' })
  @IsUUID('4')
  vehicleId: string;

  @ApiProperty({ description: 'ID de la compañía' })
  @IsUUID('4')
  companyId: string;

  @ApiProperty({ enum: SaleChannel })
  @IsEnum(SaleChannel)
  channel: SaleChannel;
}
