export interface Question {
  id: string;
  type: string;
  question: string;
  options: string[];
  timeLimit: number; // in seconds
  correctIndex: number; // 0-based index based on Op1...Op4
  imageUrl?: string;
}

export type SquadAnimal = 'Cobra' | 'Tigre' | 'Halcón' | 'Lobo' | 'Tiburón' | 'Águila' | 'Pantera' | 'Oso';

export const SQUADS: { name: SquadAnimal; icon: string }[] = [
  { name: 'Cobra', icon: '🐍' },
  { name: 'Tigre', icon: '🐅' },
  { name: 'Halcón', icon: '🦅' },
  { name: 'Lobo', icon: '🐺' },
  { name: 'Tiburón', icon: '🦈' },
  { name: 'Águila', icon: '🦅' },
  { name: 'Pantera', icon: '🐆' },
  { name: 'Oso', icon: '🐻' },
];

export interface SectorState {
  id: number;
  name: string;
  isLocked: boolean;
  lockoutEndTime: number | null; // Timestamp
  isSolved: boolean;
  questions: Question[];
  currentQuestionIndex: number;
  accessCode: string; // The 2-digit code unlocked
}

export interface SquadResult {
  name: string;
  time: number; // milliseconds
}

export interface GameState {
  // Added 'squad-selection' stage
  stage: 'selection' | 'admin-setup' | 'admin-lobby' | 'admin-monitor' | 'squad-setup' | 'squad-selection' | 'squad-lobby' | 'squad-intro' | 'squad-game' | 'squad-win';
  role: 'admin' | 'squad' | null;
  roomId: string; // 5-letter code
  adminKeyword: string;
  sectors: SectorState[];
  squadName: string;
  squadAnimal: SquadAnimal | null;
  connectedSquads: string[]; // For Admin lobby
  finishedSquads: SquadResult[];
  takenSquads: string[]; // New: For client to track what's unavailable
}

// PeerJS Message Types
export type PeerMessage = 
  | { type: 'SYNC_SQUADS'; taken: string[] } // New: Sync list
  | { type: 'REQUEST_SQUAD'; squadName: string } // New: Client requests specific squad
  | { type: 'SQUAD_ACCEPTED' } // New: Success
  | { type: 'SQUAD_DENIED' } // New: Fail
  | { type: 'START_MISSION'; payload: { keyword: string; sectors: SectorState[] } }
  | { type: 'SQUAD_FINISHED'; squadName: string }
  | { type: 'SQUAD_UPDATE'; squadName: string; progress: number };