export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export enum PlayerState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED', // Technically we just stop for now, but good for future state
  ERROR = 'ERROR'
}

export type VoiceName = 'Kore' | 'Puck' | 'Fenrir' | 'Charon' | 'Zephyr';