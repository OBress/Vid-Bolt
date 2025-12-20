export interface System {
  id: string;
  name: string;
  type: string;
  status: string;
  health: number;
  cpu: number;
  memory: number;
  storage: number;
  uptime: string;
  location: string;
  lastMaintenance: string;
}
