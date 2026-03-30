-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "vehicleId" TEXT;

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
