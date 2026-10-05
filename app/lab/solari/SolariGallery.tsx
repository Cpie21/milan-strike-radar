'use client';

import { useState } from 'react';
import Solari, { type Mood } from '../../../components/lab/Solari';

// Every expression at three sizes, for review.
const MOODS: [Mood, string][] = [['idle', '待机'], ['thinking', '判断中'], ['happy', '不受影响'], ['alarm', '会受影响'], ['unsure', '待确认'], ['sorry', '答不了']];

export default function SolariGallery() {
  const [mood, setMood] = useState<Mood>('idle');
  return (
    <main className="min-h-[100dvh] flex flex-col items-center gap-10 px-6 py-12" style={{ background: '#0A0B0D', color: '#F5F6F7' }}>
      <div className="flex items-end gap-8">
        <Solari mood={mood} size={84} float />
        <Solari mood={mood} size={40} float />
        <Solari mood={mood} size={20} float />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {MOODS.map(([m, label]) => (
          <button key={m} onClick={() => setMood(m)} className="h-9 px-3.5 rounded-full text-[14px] font-medium" style={{ background: mood === m ? '#454A54' : '#1E2025' }}>{label}</button>
        ))}
      </div>
    </main>
  );
}
