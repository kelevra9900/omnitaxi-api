import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { FaresController } from './fares.controller';
import { FaresService } from './fares.service';

@Module({
  imports: [PrismaModule],
  controllers: [FaresController],
  providers: [FaresService],
  exports: [FaresService],
})
export class FaresModule {}
