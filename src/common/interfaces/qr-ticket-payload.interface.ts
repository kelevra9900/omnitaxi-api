// qr-ticket-payload.interface.ts

export interface QRTicketPayload {
  /**
   * UUID único del boleto en la base de datos (Prisma)
   */
  ticketId: string;

  /**
   * Folio visible para el usuario (Ej. OMA-992831)
   */
  folio: string;
}
