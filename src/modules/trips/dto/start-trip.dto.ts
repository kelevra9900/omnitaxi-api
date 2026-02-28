import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartTripDto {
  @ApiProperty({ description: 'Folio o token único extraído del Código QR del pasajero' })
  @IsString()
  @IsNotEmpty()
  ticketToken: string;
}
