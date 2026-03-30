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
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService, OperatorPresenceData } from '@/redis/redis.service';

interface WsJwtPayload {
  sub: string;
  email: string;
  role: string;
}

interface SocketData {
  userId: string;
  role: string;
  operatorId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.WS_CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3001',
      'https://omnitaxi-admin.vercel.app',
    ],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  namespace: 'operator-status',
})
export class OperatorStatusGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(OperatorStatusGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Socket.IO Redis Adapter para escalado horizontal ─────────────

  afterInit(server: Server) {
    try {
      const pubClient = this.redis.getClient();
      const subClient = this.redis.createDuplicate();
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Redis adapter initialized for operator-status namespace');
    } catch {
      this.logger.warn('Redis adapter no disponible, usando adaptador en memoria (single-node)');
    }
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

      const data = client.data as SocketData;
      data.userId = payload.sub;
      data.role = payload.role;

      // Los admins/companies se unen a un room para recibir actualizaciones del dashboard
      if (payload.role === 'ADMIN' || payload.role === 'COMPANY') {
        void client.join('dashboard');
        client.emit('queueState', await this.getQueueSnapshot());
      }

      this.logger.log(`Conectado a operator-status: ${payload.email} (${payload.role})`);
    } catch {
      client.emit('error', { message: 'No autorizado' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as SocketData;
    const operatorId = data?.operatorId;
    if (operatorId && (await this.redis.isInQueue(operatorId))) {
      await this.redis.removeOperatorPresence(operatorId);
      await this.broadcastQueueUpdate();
      this.logger.log(`Operador ${operatorId} salio de la fila`);
    }
  }

  // ─── Eventos del Operador ─────────────────────────────────────────

  @SubscribeMessage('enterQueue')
  async handleEnterQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { vehicleId?: string },
  ) {
    const socketData = client.data as SocketData;

    if (socketData.role !== 'OPERATOR') {
      client.emit('error', { message: 'Solo operadores pueden entrar a la fila' });
      return;
    }

    const operator = await this.prisma.operator.findUnique({
      where: { userId: socketData.userId },
      include: {
        user: { select: { name: true } },
        company: { select: { id: true, name: true } },
      },
    });

    if (!operator) {
      client.emit('error', { message: 'Perfil de operador no encontrado' });
      return;
    }

    let vehiclePlate: string | undefined;
    if (data.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
        select: { plate: true },
      });
      vehiclePlate = vehicle?.plate;
    }

    const presence: OperatorPresenceData = {
      operatorId: operator.id,
      socketId: client.id,
      userId: socketData.userId,
      name: operator.user.name,
      companyId: operator.company.id,
      companyName: operator.company.name,
      vehiclePlate,
      vehicleId: data.vehicleId,
      connectedAt: new Date().toISOString(),
      lastPing: new Date().toISOString(),
    };

    socketData.operatorId = operator.id;
    await this.redis.setOperatorPresence(operator.id, presence);
    void client.join(`company_${operator.company.id}`);

    const queueSize = await this.redis.getOperatorQueueSize();
    const position = await this.getOperatorPosition(operator.id);

    client.emit('enteredQueue', {
      position,
      totalInQueue: queueSize,
    });

    await this.broadcastQueueUpdate();
    this.logger.log(`Operador ${operator.user.name} entro a la fila`);
  }

  @SubscribeMessage('leaveQueue')
  async handleLeaveQueue(@ConnectedSocket() client: Socket) {
    const socketData = client.data as SocketData;
    const operatorId = socketData?.operatorId;
    if (operatorId) {
      await this.redis.removeOperatorPresence(operatorId);
      client.emit('leftQueue', { message: 'Has salido de la fila' });
      await this.broadcastQueueUpdate();
    }
  }

  @SubscribeMessage('ping')
  async handlePing(@ConnectedSocket() client: Socket) {
    const socketData = client.data as SocketData;
    const operatorId = socketData?.operatorId;
    if (operatorId) {
      const presence = await this.redis.getOperatorPresence(operatorId);
      if (presence) {
        presence.lastPing = new Date().toISOString();
        await this.redis.setOperatorPresence(operatorId, presence);
      }
    }
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // ─── Metodos llamados desde el Service ────────────────────────────

  async removeFromQueue(operatorId: string) {
    if (await this.redis.isInQueue(operatorId)) {
      await this.redis.removeOperatorPresence(operatorId);
      await this.broadcastQueueUpdate();
    }
  }

  async getAvailableByCompany(companyId: string): Promise<OperatorPresenceData[]> {
    const all = await this.redis.getAllOperatorPresences();
    return all.filter((op) => op.companyId === companyId);
  }

  async getQueueSnapshot() {
    const all = await this.redis.getAllOperatorPresences();
    return all.map((op, index) => ({
      position: index + 1,
      operatorId: op.operatorId,
      name: op.name,
      companyId: op.companyId,
      companyName: op.companyName,
      vehiclePlate: op.vehiclePlate,
      vehicleId: op.vehicleId,
      waitingSince: op.connectedAt,
    }));
  }

  async isInQueue(operatorId: string): Promise<boolean> {
    return this.redis.isInQueue(operatorId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private async getOperatorPosition(operatorId: string): Promise<number> {
    const all = await this.redis.getAllOperatorPresences();
    const index = all.findIndex((op) => op.operatorId === operatorId);
    return index + 1;
  }

  private async broadcastQueueUpdate() {
    const snapshot = await this.getQueueSnapshot();
    this.server.to('dashboard').emit('queueUpdate', {
      queue: snapshot,
      totalAvailable: snapshot.length,
      timestamp: new Date().toISOString(),
    });

    // Notificar a cada operador su posicion actual
    for (const [index, op] of snapshot.entries()) {
      this.server.to(op.operatorId).emit('queuePosition', {
        position: index + 1,
        totalInQueue: snapshot.length,
      });
    }
  }
}
