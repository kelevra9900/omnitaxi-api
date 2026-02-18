import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UsersModule } from '@/modules/users/users.module';
import { TicketsModule } from '@/modules/tickets/tickets.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { FaresModule } from './modules/fares/fares.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { TripsModule } from './modules/trips/trips.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    OperatorsModule,
    FaresModule,
    CompaniesModule,
    VehiclesModule,
    TripsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule {}
