import { PrismaModule } from '@/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsGateway } from './trip-websocket';

@Module({
  imports: [PrismaModule],
  controllers: [TripsController],
  providers: [TripsService, TripsGateway],
  exports: [TripsService],
})
export class TripsModule {}
