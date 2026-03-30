import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/redis/redis.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UsersModule } from '@/modules/users/users.module';
import { TicketsModule } from '@/modules/tickets/tickets.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { FaresModule } from './modules/fares/fares.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { TripsModule } from './modules/trips/trips.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV}`,
      isGlobal: true,
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    OperatorsModule,
    FaresModule,
    CompaniesModule,
    VehiclesModule,
    TripsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }],
})
export class AppModule {}
