export class OperatorDashboardDto {
  operator: {
    id: string;
    name: string;
    isOnline: boolean;
    rating: number;
  };
  stats: {
    tripsToday: number;
    activeVehicle: string | null;
    totalEarnings?: number;
  };
  currentTrip: {
    id: string;
    status: string;
    folio: string;
    passenger: {
      name: string;
      avatarChar: string;
    };
    destination: string;
    startTime: string; // Eliminamos Date y null para coincidir con .toISO()
  } | null;
}
