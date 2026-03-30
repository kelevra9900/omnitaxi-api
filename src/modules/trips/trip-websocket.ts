import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { TripStatus } from 'generated/prisma/enums';

// Payload que viaja dentro del JWT
interface WsJwtPayload {
  sub: string; // userId
  email: string;
  role: string;
}

// Datos de ubicacion que envia el operador
interface LocationPayload {
  tripId: string;
  lat: number;
  lng: number;
  heading?: number; // Direccion en grados (0-360)
  speed?: number; // km/h
}

// Intervalo de flush de ubicaciones (5 segundos)
const LOCATION_FLUSH_INTERVAL_MS = 5_000;
const LOCATION_FLUSH_BATCH_SIZE = 200;
// Rate limit: maximo 1 ubicacion por segundo por socket
const LOCATION_RATE_LIMIT_MS = 1_000;
// Maximo conexiones simultaneas por namespace
const MAX_CONNECTIONS = 1_000;

@WebSocketGateway({
  cors: {
    origin: process.env.WS_CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3001',
      'https://omnitaxi-admin.vercel.app',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  namespace: 'trips',
})
export class TripsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TripsGateway.name);
  private flushInterval: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Socket.IO Redis Adapter + Location Flush Timer ───────────────

  afterInit(server: Server) {
    try {
      const pubClient = this.redis.getClient();
      const subClient = this.redis.createDuplicate();
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Redis adapter initialized for trips namespace');
    } catch {
      this.logger.warn('Redis adapter no disponible, usando adaptador en memoria (single-node)');
    }

    // Middleware: limitar conexiones simultaneas
    server.use((_socket, next) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const count: number = (server as any).server?.engine?.clientsCount ?? 0;
      if (count >= MAX_CONNECTIONS) {
        return next(new Error('Servidor a capacidad maxima'));
      }
      next();
    });

    // Iniciar flush periodico de ubicaciones
    this.flushInterval = setInterval(() => {
      this.flushLocationBuffer().catch((err) =>
        this.logger.error('Error flushing location buffer', err.message),
      );
    }, LOCATION_FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flushLocationBuffer().catch((err: Error) =>
      this.logger.warn(`Flush final omitido durante shutdown: ${err.message}`),
    );
  }

  // ─── Conexion / Desconexion ───────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth.token as string) ??
        client.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('Token no proporcionado');

      const secret = process.env.JWT_SECRET_AUTH ?? '';
      const payload = jwt.verify(token, secret) as WsJwtPayload;

      client.data.userId = payload.sub;
      client.data.role = payload.role;

      this.logger.log(`Cliente conectado: ${payload.email} (${payload.role})`);

      // Admins y Companies se unen al room dashboard para recibir todos los eventos de viajes
      if (payload.role === 'ADMIN' || payload.role === 'COMPANY') {
        void client.join('dashboard');
      }

      // Si es operador, registrarlo como online
      if (payload.role === 'OPERATOR') {
        const operator = await this.prisma.operator.findUnique({
          where: { userId: payload.sub },
        });
        if (operator) {
          client.data.operatorId = operator.id;
          await this.redis.setOnlineOperator(operator.id, client.id);
          client.join(`operator_${operator.id}`);
          await this.emitOperatorCount();
        }
      }
    } catch {
      this.logger.warn('Conexion rechazada: token invalido');
      client.emit('error', { message: 'No autorizado' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const operatorId = client.data?.operatorId;
    if (operatorId) {
      await this.redis.removeOnlineOperator(operatorId);
      await this.emitOperatorCount();
      this.logger.log(`Operador desconectado: ${operatorId}`);
    }
  }

  // ─── Eventos que escucha del cliente ──────────────────────────────

  @SubscribeMessage('joinTrip')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    client.join(`trip_${tripId}`);
    this.logger.log(`${client.data.role} se unio al viaje ${tripId}`);
    client.emit('joinedTrip', { tripId });
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    client.leave(`trip_${tripId}`);
  }

  /**
   * El operador envia su ubicacion en tiempo real durante un viaje activo.
   * Se buferea en Redis y se persiste en batch. Se reenvia al pasajero en tiempo real.
   */
  @SubscribeMessage('sendLocation')
  async handleSendLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationPayload,
  ) {
    if (client.data.role !== 'OPERATOR') {
      client.emit('error', { message: 'Solo operadores pueden enviar ubicacion' });
      return;
    }

    // Rate limiting: maximo 1 update por segundo por socket
    const now = Date.now();
    const lastSend: number = client.data.lastLocationSend ?? 0;
    if (now - lastSend < LOCATION_RATE_LIMIT_MS) {
      return; // Silently drop
    }
    client.data.lastLocationSend = now;

    // Bufferear en Redis para persistencia batch
    await this.redis.bufferLocation({
      tripId: data.tripId,
      lat: data.lat,
      lng: data.lng,
      heading: data.heading,
      speed: data.speed,
      timestamp: new Date().toISOString(),
    });

    // Emitir en tiempo real a todos los que esten en el room del viaje
    this.server.to(`trip_${data.tripId}`).emit('locationUpdate', {
      tripId: data.tripId,
      lat: data.lat,
      lng: data.lng,
      heading: data.heading,
      speed: data.speed,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Flush de ubicaciones (batch write a PostgreSQL) ──────────────

  async flushLocationBuffer() {
    const entries = await this.redis.flushLocationBuffer(LOCATION_FLUSH_BATCH_SIZE);
    if (entries.length === 0) return;

    // Solo guardar la ultima ubicacion por viaje
    const latestByTrip = new Map<string, (typeof entries)[0]>();
    for (const entry of entries) {
      latestByTrip.set(entry.tripId, entry);
    }

    // Batch update con transaccion
    await this.prisma.$transaction(
      Array.from(latestByTrip.values()).map((entry) =>
        this.prisma.trip.update({
          where: { id: entry.tripId },
          data: {
            currentLat: entry.lat,
            currentLng: entry.lng,
            locationUpdatedAt: new Date(entry.timestamp),
          },
        }),
      ),
    );

    this.logger.debug(`Flushed ${entries.length} locations for ${latestByTrip.size} trips`);
  }

  // ─── Metodos que se llaman desde el Service ───────────────────────

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
    this.server.to(`operator_${operatorId}`).to('dashboard').emit('tripAssigned', tripData);
    this.logger.log(`Viaje ${tripData.tripId} asignado a operador ${operatorId}`);
  }

  emitTripStarted(
    tripId: string,
    data: {
      operatorName: string;
      vehiclePlate: string;
      startTime: string;
    },
  ) {
    this.server
      .to(`trip_${tripId}`)
      .to('dashboard')
      .emit('tripStarted', {
        tripId,
        ...data,
      });
  }

  emitLocationUpdate(tripId: string, location: { lat: number; lng: number }) {
    this.server.to(`trip_${tripId}`).emit('locationUpdate', {
      tripId,
      ...location,
      timestamp: new Date().toISOString(),
    });
  }

  emitTripCompleted(
    tripId: string,
    data: {
      endTime: string;
      duration?: number;
    },
  ) {
    this.server
      .to(`trip_${tripId}`)
      .to('dashboard')
      .emit('tripCompleted', {
        tripId,
        ...data,
      });
  }

  emitTripCancelled(
    tripId: string,
    data: {
      reason: string;
      cancelledBy: string;
    },
  ) {
    this.server
      .to(`trip_${tripId}`)
      .to('dashboard')
      .emit('tripCancelled', {
        tripId,
        ...data,
      });
  }

  private async emitOperatorCount() {
    const count = await this.redis.getOnlineOperatorCount();
    this.server.emit('operatorsOnline', { count });
  }

  async isOperatorOnline(operatorId: string): Promise<boolean> {
    return this.redis.isOperatorOnline(operatorId);
  }

  async getOnlineOperatorIds(): Promise<string[]> {
    return this.redis.getOnlineOperatorIds();
  }

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
