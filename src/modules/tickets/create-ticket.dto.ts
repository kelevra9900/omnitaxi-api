import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { SaleChannel, TicketStatus } from 'generated/prisma/enums';

export class CreateTicketDto {
  // 1. Eliminar 'price' del DTO para usuarios finales.
  // El precio debe obtenerse de la DB (Fare) para asegurar la homologación[cite: 11].

  @ApiProperty({ enum: SaleChannel, example: SaleChannel.MOBILE_APP })
  @IsEnum(SaleChannel)
  channel: SaleChannel;

  @ApiProperty({ example: 'uuid-de-la-empresa' })
  @IsUUID()
  companyId: string;

  // 2. Extraer el passengerId directamente del JWT en el controlador.
  // No confíes en el ID enviado en el body por seguridad.
  @IsOptional()
  @IsUUID()
  passengerId?: string;

  // 3. Validación de Invitado (Guest)
  @ApiPropertyOptional()
  @ValidateIf(
    (o: { channel: SaleChannel; passenger?: { id: string } }) =>
      o.channel !== SaleChannel.MOBILE_APP && !o.passenger?.id,
  )
  @IsString()
  @IsNotEmpty()
  guestName?: string;

  // 4. Referencia de Pago: Obligatoria para canales digitales[cite: 14].
  @ApiProperty()
  @ValidateIf((o: { channel: SaleChannel }) => o.channel === SaleChannel.MOBILE_APP)
  @IsString()
  @IsNotEmpty()
  paymentReference: string;

  // 5. Origen y Destino: Claves para la trazabilidad[cite: 52].
  @ApiProperty({ example: 'Terminal 1' })
  @IsString()
  @IsNotEmpty()
  origin: string;

  @ApiProperty({ example: 'Zona Hotelera' })
  @IsString()
  @IsNotEmpty()
  destination: string;
}

export class ValidateTicketDto {
  @ApiProperty({ example: 'folio-del-boleto' })
  @IsString()
  @IsNotEmpty()
  folio: string;
}

export class TicketResponseDto {
  @ApiProperty({ example: 'uuid-del-boleto' })
  @IsUUID()
  id: string;

  @ApiProperty({ example: 'folio-del-boleto' })
  @IsString()
  @IsNotEmpty()
  folio: string;

  @ApiProperty({ example: 'PENDING' })
  @IsEnum(TicketStatus)
  status: TicketStatus;

  @ApiProperty({ example: 'MOBILE_APP' })
  @IsEnum(SaleChannel)
  channel: SaleChannel;

  // paidAt
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  paidAt: Date;

  // company
  @ApiProperty({ example: 'uuid-de-la-empresa' })
  @IsUUID()
  companyId: string;
}
