'use client';

import { useState } from 'react';
import { LedBoard, LedFace, type Mood } from '../../../components/lab/Led';

// Both forms of the face in every mood, for review. The board runs its
// idle programme when the mood is idle; "换一天" makes it glance aside.
const MOODS: [Mood, string][] = [['idle', '待机'], ['thinking', '判断中'], ['happy', '不受影响'], ['alarm', '会受影响'], ['unsure', '待确认'], ['sorry', '答不了'], ['alert', '罢工日']];

export default function SolariGallery() {
  const [mood, setMood] = useState<Mood>('idle');
  const [day, setDay] = useState(13);
  return (
    <main className="min-h-[100dvh] flex flex-col items-center gap-10 px-6 py-12" style={{ background: '#0A0B0D', color: '#F5F6F7' }}>
      <div className="w-full max-w-[480px]"><LedBoard mood={mood} nudge={{ key: String(day), dir: 1 }} pitch={6} /></div>
      <div className="flex items-end gap-8">
        <LedFace mood={mood} size={40} />
        <LedFace mood={mood} size={18} />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {MOODS.map(([m, label]) => (
          <button key={m} onClick={() => setMood(m)} className="h-9 px-3.5 rounded-full text-[14px] font-medium" style={{ background: mood === m ? '#454A54' : '#1E2025' }}>{label}</button>
        ))}
        <button onClick={() => setDay(d => d + 1)} className="h-9 px-3.5 rounded-full text-[14px] font-medium" style={{ background: '#1E2025' }}>换一天</button>
      </div>
    </main>
  );
}
