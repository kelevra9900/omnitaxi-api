import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '@/prisma/prisma.service';
import { TripStatus } from 'generated/prisma/enums';

// Payload que viaja dentro del JWT
interface WsJwtPayload {
  sub: string; // userId
  email: string;
  role: string;
}

// Datos de ubicación que envía el operador
interface LocationPayload {
  tripId: string;
  lat: number;
  lng: number;
  heading?: number; // Dirección en grados (0-360)
  speed?: number; // km/h
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3001', 'https://omnitaxi-admin.vercel.app'],
    credentials: true,
  },
  namespace: 'trips',
})
export class TripsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TripsGateway.name);

  // Mapa de operadores conectados: operatorId → socketId
  private onlineOperators = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Conexión / Desconexión ─────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth.token as string) ??
        client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('Token no proporcionado');

      const secret = process.env.JWT_SECRET_AUTH ?? '';
      const payload = jwt.verify(token, secret) as WsJwtPayload;

      // Adjuntamos datos del usuario al socket para uso posterior
      client.data.userId = payload.sub;
      client.data.role = payload.role;

      this.logger.log(`Cliente conectado: ${payload.email} (${payload.role})`);

      // Si es operador, registrarlo como online
      if (payload.role === 'OPERATOR') {
        const operator = await this.prisma.operator.findUnique({
          where: { userId: payload.sub },
        });
        if (operator) {
          client.data.operatorId = operator.id;
          this.onlineOperators.set(operator.id, client.id);
          // Unir al operador a su room personal para recibir asignaciones
          client.join(`operator_${operator.id}`);
          this.emitOperatorCount();
        }
      }
    } catch {
      this.logger.warn('Conexión rechazada: token inválido');
      client.emit('error', { message: 'No autorizado' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const operatorId = client.data?.operatorId;
    if (operatorId) {
      this.onlineOperators.delete(operatorId);
      this.emitOperatorCount();
      this.logger.log(`Operador desconectado: ${operatorId}`);
    }
  }

  // ─── Eventos que escucha del cliente ────────────────────────────────

  /**
   * Pasajero u operador se une al room de un viaje para recibir actualizaciones
   */
  @SubscribeMessage('joinTrip')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    client.join(`trip_${tripId}`);
    this.logger.log(`${client.data.role} se unió al viaje ${tripId}`);
    client.emit('joinedTrip', { tripId });
  }

  /**
   * Pasajero u operador sale del room de un viaje
   */
  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    client.leave(`trip_${tripId}`);
  }

  /**
   * El operador envía su ubicación en tiempo real durante un viaje activo.
   * Se persiste en BD y se reenvía al pasajero.
   */
  @SubscribeMessage('sendLocation')
  async handleSendLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationPayload,
  ) {
    if (client.data.role !== 'OPERATOR') {
      client.emit('error', { message: 'Solo operadores pueden enviar ubicación' });
      return;
    }

    // Persistir en BD (fire-and-forget para no bloquear el stream)
    this.prisma.trip
      .update({
        where: { id: data.tripId },
        data: {
          currentLat: data.lat,
          currentLng: data.lng,
          locationUpdatedAt: new Date(),
        },
      })
      .catch((err) => this.logger.error(`Error guardando ubicación: ${err.message}`));

    // Emitir a todos los que estén en el room del viaje
    this.server.to(`trip_${data.tripId}`).emit('locationUpdate', {
      tripId: data.tripId,
      lat: data.lat,
      lng: data.lng,
      heading: data.heading,
      speed: data.speed,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Métodos que se llaman desde el Service ─────────────────────────

  /**
   * Notifica al operador que le fue asignado un nuevo viaje
   */
  emitTripAssigned(
    operatorId: string,
    tripData: {
      tripId: string;
      origin: string;
      destination: string;
      passengerName?: string;
      folio: string;
    },
  ) {
    this.server.to(`operator_${operatorId}`).emit('tripAssigned', tripData);
    this.logger.log(`Viaje ${tripData.tripId} asignado a operador ${operatorId}`);
  }

  /**
   * Notifica a todos en el room que el viaje ha iniciado
   */
  emitTripStarted(
    tripId: string,
    data: {
      operatorName: string;
      vehiclePlate: string;
      startTime: string;
    },
  ) {
    this.server.to(`trip_${tripId}`).emit('tripStarted', {
      tripId,
      ...data,
    });
  }

  /**
   * Emite actualización de ubicación desde el servicio (método alternativo al socket directo)
   */
  emitLocationUpdate(tripId: string, location: { lat: number; lng: number }) {
    this.server.to(`trip_${tripId}`).emit('locationUpdate', {
      tripId,
      ...location,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notifica que el viaje fue completado
   */
  emitTripCompleted(
    tripId: string,
    data: {
      endTime: string;
      duration?: number; // minutos
    },
  ) {
    this.server.to(`trip_${tripId}`).emit('tripCompleted', {
      tripId,
      ...data,
    });
  }

  /**
   * Notifica que el viaje fue cancelado
   */
  emitTripCancelled(
    tripId: string,
    data: {
      reason: string;
      cancelledBy: string;
    },
  ) {
    this.server.to(`trip_${tripId}`).emit('tripCancelled', {
      tripId,
      ...data,
    });
  }

  /**
   * Emite la cantidad de operadores conectados (útil para dashboard admin)
   */
  private emitOperatorCount() {
    this.server.emit('operatorsOnline', {
      count: this.onlineOperators.size,
    });
  }

  /**
   * Verifica si un operador está conectado
   */
  isOperatorOnline(operatorId: string): boolean {
    return this.onlineOperators.has(operatorId);
  }

  /**
   * Retorna IDs de operadores conectados
   */
  getOnlineOperatorIds(): string[] {
    return Array.from(this.onlineOperators.keys());
  }

  /**
   * Notifica a todos los viajes activos de un operador que está desconectado
   * (útil para emergencias)
   */
  async emitOperatorDisconnectedFromTrips(operatorId: string) {
    const activeTrips = await this.prisma.trip.findMany({
      where: {
        operatorId,
        status: { in: [TripStatus.ASSIGNED, TripStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });

    for (const trip of activeTrips) {
      this.server.to(`trip_${trip.id}`).emit('operatorDisconnected', {
        tripId: trip.id,
        message: 'El operador se ha desconectado temporalmente',
      });
    }
  }
}
