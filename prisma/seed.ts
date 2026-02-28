import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '../generated/prisma/client';
import { Role, TicketStatus, SaleChannel, TripStatus, RefundStatus } from '../generated/prisma/enums';
import { faker } from '@faker-js/faker';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

// --- CONFIGURACIÓN DE MOCKS ---
const GDL_LAT = 20.6668;
const GDL_LNG = -103.3918;

const VEHICLE_MODELS = [
  'Toyota Hiace', 'Nissan Urvan', 'Mercedes-Benz Sprinter', 
  'Chevrolet Aveo', 'VW Jetta', 'Hyundai Elantra', 
  'Ford Transit', 'Honda Odyssey'
];

async function cleanDatabase() {
  console.log('--- Limpiando base de datos ---');
  // El orden es vital por las FKs
  const tables = [
    'AuditLog', 'Trip', 'Ticket', 'Operator', 
    'Vehicle', 'Fare', 'Company', 'User'
  ];
  
  for (const table of tables) {
    // @ts-ignore - Acceso dinámico para simplificar el seed
    await prisma[table.charAt(0).toLowerCase() + table.slice(1)].deleteMany();
  }
}

async function createBaseInfrastructure() {
  console.log('--- Creando Infraestructura Base ---');
  const company = await prisma.company.create({
    data: { name: 'OMA SISTEMAS Logistics' }
  });

  const fares = await Promise.all([
    prisma.fare.create({ data: { name: 'Ruta Aeropuerto Premium', origin: 'Aeropuerto GDL', destination: 'Hotel RIU GDL', price: 450.00 } }),
    prisma.fare.create({ data: { name: 'Ruta Ejecutiva Centro', origin: 'Nueva Central Camionera', destination: 'Catedral GDL', price: 220.00 } }),
    prisma.fare.create({ data: { name: 'Ruta Corporativa Andares', origin: 'Andares', destination: 'Expo GDL', price: 180.00 } }),
  ]);

  return { company, fares };
}

async function createVehicles(companyId: string, count: number = 5) {
  console.log(`--- Generando ${count} Vehículos ---`);
  return Promise.all(
    Array.from({ length: count }).map(() => {
      const model = faker.helpers.arrayElement(VEHICLE_MODELS);
      return prisma.vehicle.create({
        data: {
          plate: `${faker.string.alpha({ length: 3, casing: 'upper' })}-${faker.string.numeric(4)}`,
          companyId,
          isActive: true,
          // Nota: Si quieres guardar el modelo, podrías añadir un campo metadata o extender el schema
        }
      });
    })
  );
}

async function main() {
  await cleanDatabase();
  const { company, fares } = await createBaseInfrastructure();
  const vehicles = await createVehicles(company.id, 8);

  console.log('--- Creando Usuarios (Admin, Operador, Pasajero) ---');

  // 1. ADMIN
  await prisma.user.create({
    data: {
      name: 'Admin OMA',
      email: 'admin@oma.com',
      password: 'hash_password_123',
      role: Role.ADMIN,
    }
  });

  // 2. OPERADOR
  const opUser = await prisma.user.create({
    data: {
      name: 'Juan Carlos Pérez',
      email: 'operador@oma.com',
      password: 'hash_password_123',
      role: Role.OPERATOR,
      photoUrl: 'https://i.pravatar.cc/150?u=operator',
    },
  });

  const operator = await prisma.operator.create({
    data: {
      licenseNumber: `L-GDL-${faker.string.alphanumeric(6).toUpperCase()}`,
      userId: opUser.id,
      companyId: company.id,
      isValidated: true,
      licenseExpiresAt: DateTime.now().plus({ years: 1 }).toJSDate(),
    },
  });

  // 3. PASAJERO
  const passenger = await prisma.user.create({
    data: {
      name: 'Roger Torres',
      email: 'roger@client.com',
      password: 'hash_password_123',
      role: Role.PASSENGER,
    }
  });

  console.log('--- Generando Escenarios de Viajes ---');

  // ESCENARIO 1: Viaje en Curso (Activo ahora)
  const ticketActive = await prisma.ticket.create({
    data: {
      folio: `OMA-${faker.string.numeric(6)}`,
      price: fares[0].price,
      status: TicketStatus.PAID,
      channel: SaleChannel.MOBILE_APP,
      companyId: company.id,
      passengerId: passenger.id,
      paidAt: DateTime.now().minus({ minutes: 40 }).toJSDate(),
    }
  });

  await prisma.trip.create({
    data: {
      status: TripStatus.IN_PROGRESS,
      startTime: DateTime.now().minus({ minutes: 20 }).toJSDate(),
      origin: fares[0].origin,
      destination: fares[0].destination,
      currentLat: GDL_LAT + 0.005,
      currentLng: GDL_LNG + 0.005,
      locationUpdatedAt: new Date(),
      ticketId: ticketActive.id,
      operatorId: operator.id,
      vehicleId: vehicles[0].id,
      companyId: company.id,
    }
  });

  // ESCENARIO 2: Historial del día (Viajes Completados)
  console.log('--- Generando Historial de hoy ---');
  for (let i = 0; i < 10; i++) {
    const isGuest = i % 3 === 0; // Algunos viajes son de invitados (sin userId)
    
    const ticket = await prisma.ticket.create({
      data: {
        folio: `OMA-HIST-${100 + i}`,
        price: fares[1].price,
        status: TicketStatus.USED,
        channel: faker.helpers.arrayElement(Object.values(SaleChannel)),
        companyId: company.id,
        passengerId: isGuest ? null : passenger.id,
        guestName: isGuest ? faker.person.fullName() : null,
        paidAt: DateTime.now().minus({ hours: 10 }).toJSDate(),
      }
    });

    const start = DateTime.now().minus({ hours: i + 2 });
    await prisma.trip.create({
      data: {
        status: TripStatus.COMPLETED,
        startTime: start.toJSDate(),
        endTime: start.plus({ minutes: 45 }).toJSDate(),
        origin: fares[1].origin,
        destination: fares[1].destination,
        ticketId: ticket.id,
        operatorId: operator.id,
        vehicleId: faker.helpers.arrayElement(vehicles).id,
        companyId: company.id,
      }
    });
  }

  // ESCENARIO 3: Auditoría inicial
  await prisma.auditLog.create({
    data: {
      action: 'SEED_DATABASE',
      resourceType: 'System',
      userId: opUser.id,
      metadata: { env: 'development', createdRecords: 15 }
    }
  });

  console.log('✅ Seed completado con éxito.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });