import { Img, staticFile } from 'remotion';

// A phone in 3D: titanium band, black glass, the screen (a real capture of
// the site at 3x), the island, and a reflection that slides across the
// glass as the phone turns. Angles in degrees; z in px toward the camera.
export function Phone({ src, rx = 0, ry = 0, rz = 0, z = 0, x = 0, y = 0, scale = 1, screenOffset = 0, overlay }: {
  src: string | string[]; rx?: number; ry?: number; rz?: number; z?: number; x?: number; y?: number; scale?: number;
  screenOffset?: number; // horizontal slide between screens (0..n-1), for a date swipe
  overlay?: React.ReactNode;
}) {
  const W = 620, H = W * 844 / 390, R = 92, B = 15;
  const srcs = Array.isArray(src) ? src : [src];
  const sheen = 50 + ry * 2.2 - rx * 1.2; // the reflection follows the turn
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: W + B * 2, height: H + B * 2, marginLeft: -(W + B * 2) / 2, marginTop: -(H + B * 2) / 2,
      transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`, transformStyle: 'preserve-3d' }}>
      {/* body: the titanium band, lit from above */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: R + B, background: 'linear-gradient(160deg, #6b6d72 0%, #2b2c30 18%, #1b1c1f 50%, #34363b 82%, #7a7c82 100%)',
        boxShadow: '0 80px 140px rgba(0,0,0,0.65), 0 30px 50px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.18)' }} />
      <div style={{ position: 'absolute', inset: 4, borderRadius: R + B - 4, background: '#050506' }} />
      {/* the screen */}
      <div style={{ position: 'absolute', left: B, top: B, width: W, height: H, borderRadius: R, overflow: 'hidden', background: '#0A0B0D' }}>
        <div style={{ display: 'flex', width: W * srcs.length, height: H, transform: `translateX(${-screenOffset * W}px)` }}>
          {srcs.map(s => <Img key={s} src={staticFile(s)} style={{ width: W, height: H, display: 'block' }} />)}
        </div>
        {overlay}
        {/* the island */}
        <div style={{ position: 'absolute', top: 22, left: '50%', width: 190, height: 56, marginLeft: -95, borderRadius: 28, background: '#000' }} />
        {/* glass: a soft diagonal reflection and a fine edge highlight */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(115deg, rgba(255,255,255,0) ${sheen - 22}%, rgba(255,255,255,0.10) ${sheen}%, rgba(255,255,255,0) ${sheen + 16}%)`, mixBlendMode: 'screen' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: R, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
      </div>
    </div>
  );
}
