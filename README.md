# 👁️ AI Vision Lab

**Control a website with your hands, face and eyes. No mouse, no install, no cloud.**

AI Vision Lab is a sci-fi style computer-vision dashboard that runs entirely in your browser. Point your webcam at yourself, give a thumbs up, and the screen erupts in confetti. Look left and the interface knows. Walk into the frame and a scanner sweeps over you.

> Real-time human interaction detection, powered by your own camera.

---

## ✨ What it can do

| | Feature | What you'll see |
|---|---|---|
| ✋ | **Hand tracking** | A glowing skeleton drawn over each hand, up to two at once |
| 👍 | **Gesture recognition** | Thumbs Up, Thumbs Down, Open Palm, Fist, Peace and Pointing, shown as a big label |
| 🎉 | **Thumbs-up effect** | Particle burst, confetti, floating 👍 emojis, a glowing ring around your hand and a screen glow |
| 👤 | **People counting** | A live count with a tracking box around each person |
| 👀 | **Eye direction** | Left, Right, Up, Down or Center, with subtle eye and iris outlines |
| 📊 | **Live dashboard** | People, hands, eyes, direction, gesture and FPS, all updating in real time |
| 🎛️ | **Controls** | Start/stop camera, toggle hands, face, people and effects, plus fullscreen |

Small touches: a scan sweep when someone enters the frame, a pulse when a new hand appears, and a directional arrow that follows your gaze.

## 🔒 Privacy first

Your camera feed is processed **locally in your browser**. Frames are never uploaded, recorded or stored. The only network traffic is a one-time download of the AI models when you first press **START CAMERA**.

## 🧠 How it works

Every frame from the webcam goes through three MediaPipe models, running on your GPU where available:

1. **Gesture Recognizer** finds the hands, returns 21 landmarks per hand and classifies the gesture.
2. **Face Landmarker** maps the face and eyes. Its eye-movement scores (looking in, out, up, down) become the gaze direction.
3. **Object Detector** (EfficientDet-Lite0) finds `person` objects, which gives the count and the bounding boxes.

Everything is drawn on a canvas layered over the video. The people detector runs on every third frame to keep the whole thing near 30 FPS. The thumbs-up effect only fires when the gesture is held with high confidence for a few frames, then goes on cooldown so it doesn't spam.

**Built with:** React · TypeScript · Tailwind CSS · Vite · MediaPipe Tasks Vision · HTML5 Canvas · WebRTC

## 🚀 Run it locally

You need [Node.js](https://nodejs.org) (LTS) and Chrome or Edge.

```bash
git clone https://github.com/akshita151106/akshita.git
cd akshita
npm install
npm run dev
```

Open **http://localhost:5173**, click **START CAMERA**, and allow camera access.

## 🌐 Deploy it

The project is a standard Vite app, so any static host works (Vercel, Netlify, GitHub Pages):

- Build command: `npm run build`
- Output directory: `dist`

Camera access requires **HTTPS**. These hosts provide it automatically. Plain `http://` only works on `localhost`.

## 🗂️ Project structure

```
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.js
└─ src/
   ├─ main.tsx          # app entry
   ├─ App.tsx           # UI, camera, detection loop, canvas overlay
   ├─ vision.ts         # model loading, gesture labels, eye-direction logic
   ├─ effects.ts        # particle, confetti and ring effects
   ├─ BackgroundFX.tsx  # animated particle background
   └─ index.css         # glassmorphism and animation styles
```

## 🛠️ Troubleshooting

- **Camera blocked?** Allow it in the address bar and in Windows Settings → Privacy & security → Camera.
- **Models won't load?** The first run needs internet access. Try a private window if an extension or network is blocking the downloads.
- **Low FPS?** Turn off the trackers you don't need with the toggles, or lower the requested resolution in `App.tsx`.

## 🔭 Ideas for what's next

- Control slides or music with gestures
- Air-draw with your index finger
- Recognise custom gestures
- Track motion and body pose

## 🙏 Credits

Detection is powered by [MediaPipe](https://ai.google.dev/edge/mediapipe) from Google.

---

<p align="center">Made with a webcam and a lot of ✌️</p>
