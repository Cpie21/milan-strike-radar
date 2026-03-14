import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '罢工查询',
    short_name: '罢工查询',
    description: 'Milan Strike Radar - Real-time strike information for Milan',
    start_url: '/',
    display: 'standalone',
    background_color: '#E5ECF3',
    theme_color: '#5b748d',
    icons: [
      {
        src: '/icon-v4.png?v=4',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-touch-icon.png?v=4',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
