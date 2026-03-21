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

// Estado de disponibilidad del operador en la fila del aeropuerto
interface OperatorPresence {
  operatorId: string;
  socketId: string;
  userId: string;
  name: string;
  companyId: string;
  companyName: string;
  vehiclePlate?: string;
  vehicleId?: string;
  connectedAt: Date;
  lastPing: Date;
}

@WebSocketGateway({
  cors: { origin: ['http://localhost:3001', 'https://omnitaxi-admin.vercel.app'], credentials: true },
  transports: ['websocket', 'polling'],
  namespace: 'operator-status',
})
export class OperatorStatusGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(OperatorStatusGateway.name);

  // Operadores disponibles en la fila (listos para recibir viajes)
  private availableOperators = new Map<string, OperatorPresence>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Conexión / Desconexión ─────────────────────────────────────────

  handleConnection(client: Socket) {
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
        // Enviar estado actual de la fila
        client.emit('queueState', this.getQueueSnapshot());
      }

      this.logger.log(`Conectado a operator-status: ${payload.email} (${payload.role})`);
    } catch {
      client.emit('error', { message: 'No autorizado' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as SocketData;
    const operatorId = data?.operatorId;
    if (operatorId && this.availableOperators.has(operatorId)) {
      this.availableOperators.delete(operatorId);
      this.broadcastQueueUpdate();
      this.logger.log(`Operador ${operatorId} salió de la fila`);
    }
  }

  // ─── Eventos del Operador ──────────────────────────────────────────

  /**
   * El operador entra a la fila de espera del aeropuerto.
   * Envía su vehicleId para que el dashboard sepa qué unidad tiene.
   */
  @SubscribeMessage('enterQueue')
  async handleEnterQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { vehicleId?: string },
  ) {
    const socketData = client.data as SocketData;

    if (socketData.role !== 'OPERATOR') {
      client.emit('error', {
        message: 'Solo operadores pueden entrar a la fila',
      });
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
      client.emit('error', {
        message: 'Perfil de operador no encontrado',
      });
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

    const presence: OperatorPresence = {
      operatorId: operator.id,
      socketId: client.id,
      userId: socketData.userId,
      name: operator.user.name,
      companyId: operator.company.id,
      companyName: operator.company.name,
      vehiclePlate,
      vehicleId: data.vehicleId,
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    socketData.operatorId = operator.id;
    this.availableOperators.set(operator.id, presence);
    void client.join(`company_${operator.company.id}`);

    client.emit('enteredQueue', {
      position: this.getOperatorPosition(operator.id),
      totalInQueue: this.availableOperators.size,
    });

    this.broadcastQueueUpdate();
    this.logger.log(`Operador ${operator.user.name} entró a la fila`);
  }

  /**
   * El operador sale de la fila voluntariamente
   */
  @SubscribeMessage('leaveQueue')
  handleLeaveQueue(@ConnectedSocket() client: Socket) {
    const socketData = client.data as SocketData;
    const operatorId = socketData?.operatorId;
    if (operatorId) {
      this.availableOperators.delete(operatorId);
      client.emit('leftQueue', { message: 'Has salido de la fila' });
      this.broadcastQueueUpdate();
    }
  }

  /**
   * Heartbeat para mantener la presencia activa
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    const socketData = client.data as SocketData;
    const operatorId = socketData?.operatorId;
    if (operatorId && this.availableOperators.has(operatorId)) {
      const presence = this.availableOperators.get(operatorId)!;
      presence.lastPing = new Date();
      this.availableOperators.set(operatorId, presence);
    }
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  // ─── Métodos llamados desde el Service ──────────────────────────────

  /**
   * Cuando se asigna un viaje, sacamos al operador de la fila
   */
  removeFromQueue(operatorId: string) {
    if (this.availableOperators.has(operatorId)) {
      this.availableOperators.delete(operatorId);
      this.broadcastQueueUpdate();
    }
  }

  /**
   * Retorna los operadores disponibles de una compañía específica
   */
  getAvailableByCompany(companyId: string): OperatorPresence[] {
    return Array.from(this.availableOperators.values()).filter((op) => op.companyId === companyId);
  }

  /**
   * Retorna todos los operadores en fila
   */
  getQueueSnapshot() {
    return Array.from(this.availableOperators.values()).map((op, index) => ({
      position: index + 1,
      operatorId: op.operatorId,
      name: op.name,
      companyId: op.companyId,
      companyName: op.companyName,
      vehiclePlate: op.vehiclePlate,
      vehicleId: op.vehicleId,
      waitingSince: op.connectedAt.toISOString(),
    }));
  }

  /**
   * Verifica si un operador está en la fila
   */
  isInQueue(operatorId: string): boolean {
    return this.availableOperators.has(operatorId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private getOperatorPosition(operatorId: string): number {
    const keys = Array.from(this.availableOperators.keys());
    return keys.indexOf(operatorId) + 1;
  }

  private broadcastQueueUpdate() {
    const snapshot = this.getQueueSnapshot();
    // Notificar al dashboard de admins
    this.server.to('dashboard').emit('queueUpdate', {
      queue: snapshot,
      totalAvailable: snapshot.length,
      timestamp: new Date().toISOString(),
    });

    // Notificar a cada operador su posición actual
    for (const [operatorId, presence] of this.availableOperators) {
      this.server.to(presence.socketId).emit('queuePosition', {
        position: this.getOperatorPosition(operatorId),
        totalInQueue: this.availableOperators.size,
      });
    }
  }
}
