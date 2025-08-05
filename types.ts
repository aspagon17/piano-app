export type NotePresence = {
  instrument: string
  notes: number[]
  color?: string
  name?: string
  id?: number
}

export type SongNote = {
  note: number; // MIDI note
  time: number; // ms from song start
};

export const sampleSong: SongNote[] = [
  // Extended Twinkle Twinkle Little Star for ~10s demo
  { note: 60, time: 0 },    // C4
  { note: 60, time: 500 },
  { note: 67, time: 1000 }, // G4
  { note: 67, time: 1500 },
  { note: 69, time: 2000 }, // A4
  { note: 69, time: 2500 },
  { note: 67, time: 3000 }, // G4
  { note: 65, time: 3500 }, // F4
  { note: 65, time: 4000 },
  { note: 64, time: 4500 }, // E4
  { note: 64, time: 5000 },
  { note: 62, time: 5500 }, // D4
  { note: 62, time: 6000 },
  { note: 60, time: 6500 }, // C4
];

export const SONG_DURATION = 7000; // ms, adjust to max time + buffer