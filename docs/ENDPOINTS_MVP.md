# Endpoints MVP – OmniTransit API

Organización de endpoints por consumidor: **Administrador web**, **App móvil (pasajero)** y **App móvil (operador)**. Incluye también canales de venta externos (ATM, cajero) para integración futura.

---

## Resumen por consumidor

| Consumidor              | Autenticación      | Descripción breve                                      |
|-------------------------|--------------------|--------------------------------------------------------|
| **Administrador web**   | JWT (rol `ADMIN`)  | Empresas, operadores, vehículos, tarifas, reportes, auditoría |
| **App pasajero**        | JWT (rol `PASSENGER`) o anónimo por folio | Comprar boletos, ver mis viajes, cancelar/reembolso   |
| **App operador**        | JWT (rol `OPERATOR`) | Aceptar viajes, iniciar/finalizar, validar boleto, ubicación |
| **Canales externos**    | API Key / JWT rol `COMPANY` o servicio | ATM, cajero: emitir boleto tras validación de pago    |

---

## 1. Administrador web

Base path sugerido: prefijo opcional `/admin` o mismo `/` con guard por rol `ADMIN`.

### Auth (compartido)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login (email/password). Devuelve JWT. |
| `POST` | `/auth/refresh` | Renovar token (opcional en MVP). |

### Usuarios

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/users` | Listar usuarios (paginado, filtros: rol, isActive, búsqueda). |
| `GET` | `/users/:id` | Detalle de usuario. |
| `POST` | `/users` | Crear usuario (admin o registro según política). |
| `PATCH` | `/users/:id` | Actualizar usuario (rol, activo, etc.). |

### Empresas operadoras

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/companies` | Listar empresas (paginado). |
| `GET` | `/companies/:id` | Detalle empresa (con operadores y vehículos). |
| `POST` | `/companies` | Crear empresa. |
| `PATCH` | `/companies/:id` | Actualizar empresa. |

### Operadores

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/operators` | Listar operadores (filtros: companyId, isValidated). |
| `GET` | `/operators/:id` | Detalle operador (usuario, licencia, empresa). |
| `POST` | `/operators` | Crear operador (vincular usuario + empresa + licencia). |
| `PATCH` | `/operators/:id` | Actualizar (licencia, validado). |

### Vehículos (unidades)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/vehicles` | Listar vehículos (filtro: companyId, isActive). |
| `GET` | `/vehicles/:id` | Detalle vehículo. |
| `POST` | `/vehicles` | Crear vehículo (placa, empresa). |
| `PATCH` | `/vehicles/:id` | Actualizar (placa, isActive). |

### Tarifas y promociones (homologación)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/fares` | Listar tarifas vigentes (origen–destino o tipo). |
| `POST` | `/fares` | Crear/actualizar tarifa (autorización admin). |
| `GET` | `/promotions` | Listar promociones autorizadas (opcional MVP). |

### Boletos (consulta y gestión)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/tickets` | Listar boletos (filtros: status, channel, companyId, fechas). |
| `GET` | `/tickets/:id` | Detalle boleto (folio, pago, viaje asociado). |
| `PATCH` | `/tickets/:id/cancel` | Cancelar boleto (admin, conforme políticas). |
| `GET` | `/tickets/:id/refund-status` | Estado de reembolso. |

### Viajes (trazabilidad)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/trips` | Listar viajes (filtros: status, companyId, operador, fechas). |
| `GET` | `/trips/:id` | Detalle viaje (origen, destino, operador, unidad, boleto). |
| (No edición de viajes finalizados salvo admin con auditoría) | | |

### Monitoreo en tiempo real

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/trips/active` | Viajes en curso (estado, ubicación). |
| WebSocket o SSE | `/trips/live` | Ubicación en tiempo real de unidades (opcional MVP). |

### Reportes y auditoría

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/reports/sales` | Reporte de ventas (por canal, empresa, rango fechas). |
| `GET` | `/reports/trips` | Reporte operativo (viajes por empresa/operador). |
| `GET` | `/reports/audit` | Auditoría (audit logs por recurso/fecha). |
| `GET` | `/audit-logs` | Listar logs (filtros: userId, resourceType, fechas). |

---

## 2. App móvil – Usuario (pasajero)

Base path: mismos recursos con guard `PASSENGER` o rutas específicas `/app/passenger` si se desea separar.

### Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login pasajero. |
| `POST` | `/auth/register` | Registro pasajero (ya existe). |

### Boletos (compra y consulta)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/tickets` | Comprar boleto (app). Cuerpo: origen, destino, pasajero (userId o guest), forma de pago. Solo emite tras confirmación de pago. |
| `GET` | `/tickets/my` | Mis boletos (por userId del JWT). |
| `GET` | `/tickets/:folio` | Detalle por folio (para validar o mostrar QR). |
| `POST` | `/tickets/:id/cancel` | Solicitar cancelación (antes del viaje, según políticas). |
| `GET` | `/tickets/:id/refund-status` | Estado de reembolso del boleto. |

### Tarifas (solo lectura)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/fares` | Ver tarifas vigentes (origen–destino) para mostrar precio antes de comprar. |

### Viajes (solo los del pasajero)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/trips/my` | Mis viajes (asociados a mis boletos). |
| `GET` | `/trips/:id` | Detalle de un viaje mío (estado, operador, unidad si aplica). |

### Validación (por folio o QR)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/tickets/validate/:folio` | Consultar si un folio es válido (pago confirmado, no cancelado). Pensado para quien no tiene sesión pero tiene folio/QR. |

---

## 3. App móvil – Operador

Base path: mismo API con guard `OPERATOR` o prefijo `/app/operator`.

### Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/login` | Login operador (usuario con rol OPERATOR y operador vinculado). |

### Viajes asignados

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/operators/me/trips` | Viajes asignados al operador (status: ASSIGNED, IN_PROGRESS). |
| `GET` | `/operators/me/trips/:id` | Detalle de un viaje mío. |
| `POST` | `/operators/me/trips/:id/accept` | Aceptar viaje. |
| `POST` | `/operators/me/trips/:id/start` | Confirmar inicio del servicio (y opcionalmente asignar unidad si es manual). |
| `POST` | `/operators/me/trips/:id/finish` | Confirmar fin del servicio. |
| `PATCH` | `/operators/me/trips/:id/location` | Enviar ubicación actual (lat/lng) para monitoreo en tiempo real. |

### Validación de boleto del pasajero

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/operators/me/tickets/validate` | Validar boleto por folio o código QR. Devuelve si es válido y datos del viaje. |
| `GET` | `/tickets/validate/:folio` | Alternativa GET para validar por folio (reutilizable desde app operador). |

### Unidad (si la asignación es manual)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/operators/me/vehicles` | Vehículos de mi empresa disponibles para asignar. |
| `POST` | `/operators/me/trips/:id/assign-vehicle` | Asignar unidad al viaje (cuando el modelo es manual). |

---

## 4. Canales externos (ATM, cajero)

Estos clientes pueden usar API Key o un usuario de tipo servicio/company. Misma base de datos; la unicidad del folio y la validación de pago se aplican igual.

### Emisión de boleto (tras validación de pago)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/channels/tickets` | Emitir boleto (channel: ATM_CARD, ATM_CASH, CASHIER). Cuerpo: origen, destino, paymentReference, tipo de pago. Solo crear boleto cuando el pago esté confirmado. |
| `GET` | `/tickets/:folio` | Consultar boleto por folio (para reimpresión o consulta en cajero). |

### Tarifas

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/fares` | Obtener tarifa para mostrar en ATM/cajero (homologación). |

---

## 5. Resumen de prioridad para MVP

### Fase 1 – Core (sin esto no hay producto)

- `POST /auth/login`, `POST /auth/register`
- `POST /tickets` (con validación de pago antes de emitir)
- `GET /tickets/:folio`, `GET /tickets/my`
- `GET /fares`
- `GET /trips/my`, `GET /trips/:id`
- Operador: `GET /operators/me/trips`, `POST .../accept`, `.../start`, `.../finish`, `POST /operators/me/tickets/validate` (o `GET /tickets/validate/:folio`)
- Admin: `GET /users`, `GET /companies`, `GET /operators`, `GET /vehicles`, `GET /tickets`, `GET /trips`

### Fase 2 – Administración completa

- CRUD empresas, operadores, vehículos
- CRUD tarifas
- Cancelación y reembolsos (`POST /tickets/:id/cancel`, estado de reembolso)
- Reportes básicos (`/reports/sales`, `/reports/trips`)
- Auditoría (`/audit-logs`)

### Fase 3 – Canales y tiempo real

- `POST /channels/tickets` para ATM/cajero
- Actualización de ubicación del operador (`PATCH .../location`)
- Monitoreo en tiempo real (WebSocket o SSE) y `GET /trips/active`

---

## Notas de implementación

1. **Unicidad del folio**: Generar en el servicio de tickets (por ejemplo UUID corto o secuencia por empresa) y asegurar índice único en BD (ya en schema).
2. **Validación de pago**: No crear boleto en estado PAID hasta tener `paymentReference` (o confirmación de efectivo). Endpoint de creación de boleto debe recibir la confirmación, no solo “intención”.
3. **Permisos**: Admin ve todo; Company (si existe rol) solo sus datos; Operator solo sus viajes; Passenger solo sus boletos/viajes.
4. **Trazabilidad**: Viajes creados al asignar boleto a operador/unidad; no permitir edición de viaje finalizado salvo con rol admin y registro en AuditLog.
5. **Cancelaciones**: Validar “antes del inicio del viaje” y políticas de tiempo/tipo de pago en el servicio de tickets.
