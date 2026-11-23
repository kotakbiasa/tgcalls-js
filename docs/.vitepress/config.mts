import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'tgcalls-js',
  description: 'Telegram group calls, P2P audio/video, RTMP livestreams, E2E conferences, and Voice AI frame bridge for Node.js',
  base: '/tgcalls-js/',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Guide', link: '/guide' },
      { text: 'API', link: '/api' },
      { text: 'Extended APIs', link: '/roadmap-api' },
      { text: 'Roadmap', link: '/ROADMAP' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Guide', link: '/guide' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Core API', link: '/api' },
          { text: 'Extended APIs (v0.9.0+)', link: '/roadmap-api' },
        ],
      },
      {
        text: 'Internals & Status',
        items: [
          { text: 'Call Roadmap Status', link: '/ROADMAP' },
          { text: 'Media & Decoder Support', link: '/media-support' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/kotakbiasa/tgcalls-js' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'tgcalls-js — Built on ntgcalls for teleproto, GramJS, and mtcute.',
    },
  },
});
