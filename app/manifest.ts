import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '罢工查询',
    short_name: '罢工查询',
    description: 'Milan Strike Radar - Real-time strike information for Milan',
    start_url: '/',
    display: 'standalone',
    // the page's own dark: the launch screen and the bars match it
    background_color: '#0A0B0D',
    theme_color: '#0A0B0D',
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
