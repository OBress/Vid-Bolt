export interface Operation {
  id: string;
  name: string;
  status: string;
  priority: string;
  location: string;
  agents: number;
  progress: number;
  startDate: string;
  estimatedCompletion: string;
  description: string;
  objectives: string[];
}
