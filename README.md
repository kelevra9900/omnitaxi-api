# Organization of the project

´´´
src/
├── common/                 # Lo compartido (Guards, Interceptors, Decorators)
│   ├── decorators/         # Ej: @GetUser(), @Roles()
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   ├── interceptors/       # AuditInterceptor (para trazabilidad) [cite: 67]
│   └── middleware/         # LoggerMiddleware (peticiones HTTP)
├── modules/
│   ├── auth/               # Passport, JWT, Login
│   ├── tickets/            # Venta (ATM, App, Cajero), Folios únicos [cite: 3, 9]
│   ├── trips/              # Gestión de viajes, Sockets, GPS [cite: 49, 56]
│   ├── operators/          # Registro y validación de licencias [cite: 29, 32]
│   └── audit/              # Lógica de persistencia de Logs [cite: 68]
├── providers/              # Servicios externos (Prisma, Socket.io, Redis)
│   ├── prisma/             # PrismaService global
│   └── socket/             # Gateway central de WebSockets
└── main.ts                 # Configuración de entrada
´´´

## TODO Authentication endpoints

[x] POST /auth/login
[x] POST /auth/refresh
[x] POST /auth/register

## TODO Users (Admin endpoints)

[x] POST /users
[x] GET /users
[x] GET /users/:id
[x] PATCH /users/:id
[ ] Soft delete /users/:id

## Tickets (Admin endpoints)

[x] POST /tickets
[x] GET /tickets
[x] GET /tickets/by-folio/:folio
[x] GET /tickets/:id/refund-status
[x] GET /tickets/:id
[x] PATCH /tickets/:id/cancel

## Operators

[x] POST /operators
[x] GET /operators
[x] GET /operators/:id
[x] PATCH /operators/:id

## Fares

[x] POST /fares
[x] GET /fares
[x] GET /fares/:id
[x] PATCH /fares/:id

## Companies

[x] POST /companies
[x] GET /companies
[x] GET /companies/:id
[x] PATCH /companies/:id

## Vehicles

[x] POST /vehicles
[x] GET /vehicles
[x] GET /vehicles/:id
[x] PATCH /vehicles
