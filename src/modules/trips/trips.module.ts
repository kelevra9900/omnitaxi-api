import { PrismaModule } from '@/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsGateway } from './trip-websocket';
import { OperatorStatusGateway } from './operator-status.gateway';

@Module({
  imports: [PrismaModule],
  controllers: [TripsController],
  providers: [TripsService, TripsGateway, OperatorStatusGateway],
  exports: [TripsService, OperatorStatusGateway],
})
export class TripsModule {}
