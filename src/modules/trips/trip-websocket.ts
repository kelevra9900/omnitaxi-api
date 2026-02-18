import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true, namespace: 'trips' })
export class TripsGateway {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token as string;
      if (!token) throw new Error('No autorizado');
    } catch {
      client.disconnect();
    }
  }

  // Los pasajeros se unen al "cuarto" de su viaje al abrir la vista de seguimiento
  @SubscribeMessage('joinTrip')
  handleJoinTrip(client: Socket, tripId: string) {
    client.join(`trip_${tripId}`);
  }

  // Método que llamaremos desde el Service
  emitLocationUpdate(tripId: string, location: { lat: number; lng: number }) {
    this.server.to(`trip_${tripId}`).emit('locationUpdate', location);
  }

  emitTripStarted(tripId: string) {
    this.server.to(`trip_${tripId}`).emit('tripStarted');
  }

  emitTripCompleted(tripId: string) {
    this.server.to(`trip_${tripId}`).emit('tripCompleted');
  }
}
