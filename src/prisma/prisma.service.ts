import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {PrismaClient} from 'generated/prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 1. Creamos el pool de conexiones de Postgres
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL 
    });

    // 2. Creamos el adaptador
    const adapter = new PrismaPg(pool);

    // 3. Lo pasamos al constructor de PrismaClient
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}