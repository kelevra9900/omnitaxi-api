import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '../generated/prisma/client';
import { Role, TicketStatus, SaleChannel, TripStatus } from '../generated/prisma/enums';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const CENTER_LAT = 19.4326;
const CENTER_LNG = -99.1332;

async function main() {
  console.log('--- Iniciando limpieza de tablas ---');
  await prisma.auditLog.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.operator.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.fare.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  console.log('--- Creando Empresa y Tarifas (Fares) ---');
  
  const company = await prisma.company.create({
    data: { name: 'OMA SISTEMAS Logistics' }
  });

  // Creamos 5 tarifas homologadas para que el sistema tenga rutas predefinidas
  const fares = await Promise.all([
    prisma.fare.create({ data: { name: 'Ruta Express Norte', origin: 'Terminal Norte', destination: 'Santa Fe', price: 45.00 } }),
    prisma.fare.create({ data: { name: 'Conexión Aeropuerto', origin: 'Centro Histórico', destination: 'AICM T1', price: 120.00 } }),
    prisma.fare.create({ data: { name: 'Circuito Universidad', origin: 'Coyoacán', destination: 'CU', price: 15.50 } }),
    prisma.fare.create({ data: { name: 'Corredor Reforma', origin: 'Chapultepec', destination: 'Bellas Artes', price: 25.00 } }),
    prisma.fare.create({ data: { name: 'Interurbano Toluca', origin: 'Observatorio', destination: 'Toluca Centro', price: 85.00 } }),
  ]);

  console.log('--- Creando Usuarios (Admin, Operadores, Pasajeros) ---');

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador OMA',
      email: 'admin@omasistemas.com',
      password: 'hash_secure_password',
      role: Role.ADMIN,
      photoUrl: faker.image.avatar(),
    }
  });

  const passengers = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      prisma.user.create({
        data: {
          name: faker.person.fullName(),
          email: faker.internet.email(),
          password: 'hash_password_123',
          role: Role.PASSENGER,
          photoUrl: faker.image.avatar(),
        },
      })
    )
  );

  const opUser = await prisma.user.create({
    data: {
      name: 'Marcos Operador',
      email: 'operador1@omasistemas.com',
      password: 'hash_password_123',
      role: Role.OPERATOR,
      photoUrl: faker.image.avatar(),
    },
  });

  const operator = await prisma.operator.create({
    data: {
      licenseNumber: 'MX-L-' + faker.string.alphanumeric(8).toUpperCase(),
      userId: opUser.id,
      companyId: company.id,
      isValidated: true,
      licenseExpiresAt: faker.date.future(),
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      plate: faker.vehicle.vrm(),
      companyId: company.id,
      isActive: true,
    },
  });

  console.log('--- Generando Historial de Tickets y Viajes ---');

  for (let i = 0; i < 20; i++) {
    // Seleccionamos una tarifa aleatoria para que el ticket coincida con la ruta
    const selectedFare = faker.helpers.arrayElement(fares);
    const dateOfAction = faker.date.recent({ days: 10 });

    // 1. Crear Ticket (Sin nulos en campos de auditoría)
    const ticket = await prisma.ticket.create({
      data: {
        folio: `OMA-${faker.string.alphanumeric(8).toUpperCase()}`,
        price: selectedFare.price,
        status: TicketStatus.VALIDATED,
        channel: faker.helpers.arrayElement([SaleChannel.MOBILE_APP, SaleChannel.ATM_CARD, SaleChannel.CASHIER]),
        paidAt: dateOfAction,
        paymentReference: faker.finance.iban(),
        companyId: company.id,
        passengerId: faker.helpers.arrayElement(passengers).id,
        createdAt: dateOfAction,
      },
    });

    // 2. Crear Viaje (startTime y endTime coherentes)
    const tripStart = new Date(dateOfAction.getTime() + 10 * 60000); // 10 min después del pago
    const tripEnd = new Date(tripStart.getTime() + faker.number.int({ min: 15, max: 90 }) * 60000);

    await prisma.trip.create({
      data: {
        status: TripStatus.COMPLETED,
        startTime: tripStart,
        endTime: tripEnd,
        origin: selectedFare.origin,
        destination: selectedFare.destination,
        
        // Coordenadas simuladas para el track
        currentLat: faker.location.latitude({ max: CENTER_LAT + 0.05, min: CENTER_LAT - 0.05 }),
        currentLng: faker.location.longitude({ max: CENTER_LNG + 0.05, min: CENTER_LNG - 0.05 }),
        locationUpdatedAt: tripEnd,

        ticketId: ticket.id,
        operatorId: operator.id,
        vehicleId: vehicle.id,
        companyId: company.id,
      },
    });

    // 3. Crear Log de Auditoría para cada viaje
    await prisma.auditLog.create({
      data: {
        action: 'TRIP_COMPLETED',
        resourceType: 'Trip',
        resourceId: ticket.folio,
        ip: faker.internet.ip(),
        userId: admin.id,
        metadata: { status: 'SUCCESS', sync: true },
      }
    });
  }

  console.log('--- Semilla finalizada con éxito: Fares, Users, Operators, Vehicles, Tickets, Trips y Logs cargados ---');
}

main()
  .catch((e) => {
    console.error('Error ejecutando el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });