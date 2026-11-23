---
layout: home

hero:
  name: tgcalls-js
  text: Telegram Calls & Voice AI for Node.js
  tagline: pytgcalls-style wrapper for Telegram group calls, P2P audio/video, RTMP livestreams, E2E conferences, and real-time external PCM frames — for teleproto, GramJS, and mtcute.
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started
    - theme: alt
      text: Core API
      link: /api
    - theme: alt
      text: Extended APIs
      link: /roadmap-api

features:
  - icon: 🎵
    title: Audio, Video & Playback Controls
    details: Stream files, direct URLs, YouTube (yt-dlp), shell PCM pipes, or real-time external frames with seek, volume (0–200%), speed (0.5–2×), and loop modes.
  - icon: 🎙️
    title: Voice AI External Frame Bridge
    details: Push synthesized s16le PCM with automatic 10ms WebRTC slicing (pushAudioFrame) and receive decoded remote PCM frames (onAudioFrame) without ffmpeg.
  - icon: ⏺️
    title: Mixed & Per-Participant Recording
    details: Record mixed group audio or segmented per-participant WAV/MP4 folders with automatic simulcast resolution rotation and manifest.json.
  - icon: 📞
    title: P2P Calls, RTMP & E2E Conferences
    details: Preflight checks without ringing, outgoing/incoming P2P video + recording, RTMP livestream publishing & stream viewer, and native E2E conferences.
  - icon: 💾
    title: Opt-in Restart Persistence
    details: Atomic desired-state snapshots with explicit fresh group rejoin, fresh SSRC allocation, queue restore, and fresh recording segments.
  - icon: 🔌
    title: Client-Agnostic Adapters
    details: Auto-detects teleproto, GramJS, and mtcute out of the box — or bring your own custom MTProtoAdapter.
---
