/**
 * E2E — Trips WebSocket
 *
 * Verifica el flujo completo de sockets para el namespace /trips y /operator-status.
 * Requiere PostgreSQL y Redis corriendo (docker compose -f docker-compose.dev.yml up -d).
 *
 * Cobertura:
 *  - Admin y Operador se conectan a sus namespaces
 *  - Admin se une al room 'dashboard' al conectar (/trips y /operator-status)
 *  - Operador entra a la fila → Admin recibe queueUpdate
 *  - Admin asigna viaje vía REST → Admin recibe tripAssigned
 *  - Admin se une al room del viaje → Operador envía GPS → Admin recibe locationUpdate
 *  - Admin cancela viaje vía REST → Admin recibe tripCancelled
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─── Helper: esperar un evento de socket con timeout ──────────────────────────

function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout (${timeoutMs}ms) esperando evento "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    const timer = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Trips WebSocket (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let appUrl: string;

  // Tokens JWT
  let adminToken: string;
  let operatorToken: string;

  // IDs de recursos creados en setup (para cleanup)
  let adminUserId: string;
  let operatorUserId: string;
  let companyId: string;
  let vehicleId: string;
  let operatorId: string;

  // ID del viaje creado durante los tests
  let tripId: string;

  // Conexiones socket
  let adminTrips: Socket;
  let adminQueue: Socket;
  let opTrips: Socket;
  let opQueue: Socket;

  // ─── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.listen(0); // Puerto 0 → OS asigna un puerto libre
    prisma = app.get(PrismaService);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const port = (app.getHttpServer().address() as { port: number }).port;
    appUrl = `http://127.0.0.1:${port}`;

    const ts = Date.now();
    const http = app.getHttpServer();

    // Registrar usuarios
    const adminRes = await request(http)
      .post('/auth/register')
      .send({
        name: 'Admin E2E',
        email: `admin_e2e_${ts}@test.com`,
        password: 'Test1234!',
        role: 'ADMIN',
      });
    adminToken = adminRes.body.access_token as string;
    adminUserId = adminRes.body.user.id as string;

    const opRes = await request(http)
      .post('/auth/register')
      .send({
        name: 'Operador E2E',
        email: `op_e2e_${ts}@test.com`,
        password: 'Test1234!',
        role: 'OPERATOR',
      });
    operatorToken = opRes.body.access_token as string;
    operatorUserId = opRes.body.user.id as string;

    // Crear empresa
    const companyRes = await request(http)
      .post('/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Empresa E2E ${ts}` });
    companyId = companyRes.body.id as string;

    // Crear vehículo
    const vehicleRes = await request(http)
      .post('/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ plate: `E2E-${ts % 10000}`, companyId });
    vehicleId = vehicleRes.body.id as string;

    // Crear perfil de operador
    const opProfileRes = await request(http)
      .post('/operators')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: operatorUserId,
        companyId,
        licenseNumber: `LIC-E2E-${ts}`,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      });
    operatorId = opProfileRes.body.id as string;

    // Conectar sockets
    adminTrips = io(`${appUrl}/trips`, { auth: { token: adminToken }, transports: ['websocket'] });
    adminQueue = io(`${appUrl}/operator-status`, {
      auth: { token: adminToken },
      transports: ['websocket'],
    });
    opTrips = io(`${appUrl}/trips`, { auth: { token: operatorToken }, transports: ['websocket'] });
    opQueue = io(`${appUrl}/operator-status`, {
      auth: { token: operatorToken },
      transports: ['websocket'],
    });

    await Promise.all([
      waitForConnect(adminTrips),
      waitForConnect(adminQueue),
      waitForConnect(opTrips),
      waitForConnect(opQueue),
    ]);
  }, 30_000);

  // ─── Teardown ──────────────────────────────────────────────────────────────

  afterAll(async () => {
    [adminTrips, adminQueue, opTrips, opQueue].forEach((s) => s?.disconnect());

    // Cleanup en orden de FK: AuditLog → Trip → Ticket → Operator → Vehicle → Company → User
    await prisma.auditLog.deleteMany({ where: { resourceId: tripId } });
    await prisma.trip.deleteMany({ where: { id: tripId } });
    await prisma.ticket.deleteMany({ where: { companyId } });
    await prisma.operator.deleteMany({ where: { id: operatorId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, operatorUserId] } } });

    await app.close();
  }, 15_000);

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it('Admin y Operador se conectan a los namespaces correctos', () => {
    expect(adminTrips.connected).toBe(true);
    expect(adminQueue.connected).toBe(true);
    expect(opTrips.connected).toBe(true);
    expect(opQueue.connected).toBe(true);
  });

  it('Admin recibe queueUpdate cuando el Operador entra a la fila', async () => {
    const queuePromise = waitForEvent<{ queue: { operatorId: string }[]; totalAvailable: number }>(
      adminQueue,
      'queueUpdate',
    );

    opQueue.emit('enterQueue', { vehicleId });

    const data = await queuePromise;

    expect(data.queue.some((op) => op.operatorId === operatorId)).toBe(true);
    expect(data.totalAvailable).toBeGreaterThan(0);
  });

  it('Admin recibe tripAssigned cuando se asigna un viaje', async () => {
    const assignedPromise = waitForEvent<{ tripId: string; folio: string }>(
      adminTrips,
      'tripAssigned',
    );

    const res = await request(app.getHttpServer())
      .post('/trips/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        operatorId,
        vehicleId,
        companyId,
        origin: 'Aeropuerto GDL',
        destination: 'Hotel Riu GDL',
        price: 350,
        channel: 'CASHIER',
        guestName: 'Pasajero E2E',
        guestContact: '3310000000',
      });

    expect(res.status).toBe(201);
    tripId = res.body.trip.id as string;

    const event = await assignedPromise;
    expect(event.tripId).toBe(tripId);
    expect(event.folio).toMatch(/^OT-/);
  });

  it('Admin recibe locationUpdate al unirse al viaje y el Operador envía GPS', async () => {
    adminTrips.emit('joinTrip', tripId);
    await waitForEvent(adminTrips, 'joinedTrip', 3000);

    const locationPromise = waitForEvent<{
      tripId: string;
      lat: number;
      lng: number;
      speed: number;
    }>(adminTrips, 'locationUpdate');

    opTrips.emit('sendLocation', {
      tripId,
      lat: 20.6668,
      lng: -103.3918,
      heading: 90,
      speed: 45,
    });

    const loc = await locationPromise;
    expect(loc.tripId).toBe(tripId);
    expect(loc.lat).toBe(20.6668);
    expect(loc.lng).toBe(-103.3918);
    expect(loc.speed).toBe(45);
  });

  it('Admin recibe tripCancelled cuando cancela el viaje', async () => {
    const cancelledPromise = waitForEvent<{ tripId: string; reason: string }>(
      adminTrips,
      'tripCancelled',
    );

    const res = await request(app.getHttpServer())
      .post(`/trips/${tripId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Prueba e2e automatizada' });

    expect(res.status).toBe(201);

    const event = await cancelledPromise;
    expect(event.tripId).toBe(tripId);
    expect(event.reason).toBe('Prueba e2e automatizada');
  });
});
