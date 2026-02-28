-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_operatorId_fkey";

-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_vehicleId_fkey";

-- AlterTable
ALTER TABLE "Trip" ALTER COLUMN "operatorId" DROP NOT NULL,
ALTER COLUMN "vehicleId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
