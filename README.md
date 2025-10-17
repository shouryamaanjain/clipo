# Clipo — AI Short Video Studio

A design-forward web experience for generating AI-powered short videos. The front-end hands your brief to an makeworkflow and hosts the finished clip the moment makereturns a `videoUrl`. When the backend is offline, the app simulates the journey and surfaces a sample typing-speed clip so you can still demo the UX end-to-end.

## Prerequisites

- Node.js 18+
- An makewebhook workflow (see `n8n-workflow.json`) that accepts `{ "topic": string }` and responds with JSON containing at least `{ "videoUrl": string }`. Optional fields like `thumbnailUrl`, `narration`, `scenes`, `audioUrl`, and `videoClips` are also consumed by the UI when present.

## Quick start

1. Create an `.env.local` file in the project root:

   ```env
   NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-instance/webhook/generate-video
   ```

2. Install dependencies (if you haven’t already):

   ```bash
   npm install
   ```

3. Launch the development server:

   ```bash
   npm run dev
   ```

4. Visit [http://localhost:3000](http://localhost:3000) and start crafting prompts. The UI posts `{ topic: "..." }` to your webhook.

## Runtime behaviour

- **Compose** – Write or pick a curated topic describing tone, length, ratio, music, or voice direction.
- **Generate** – If the webhook responds, the app shows real progress and renders your returned video. If the webhook is unreachable **only for the prompt** `Create a Short video on how to type fast`, a simulated loader runs for ~36 seconds, then plays the bundled vertical sample video (`public/This is how I type faster while having fun..mp4`) labelled as a preview.
- **Deliver** – Successful runs append the newest clip (and optional metadata) to the gallery with a playable player and timestamp.

## Customisation tips

- Adjust the payload in `app/page.tsx` if your workflow expects more fields (e.g., `voice`, `ratio`, `brandPalette`).
- Map additional response metadata (thumbnails, captions, scenes) into the gallery cards for deeper context.
- Extend the simulation helper if you want multiple fallback clips or shorter demo timings.

## Deployment

Deploy anywhere that supports Next.js. Set `NEXT_PUBLIC_N8N_WEBHOOK_URL` in your hosting provider, keep the makewebhook behind HTTPS, and ensure it returns JSON matching the structure outlined above.

---

Need extra automation? Layer on status polling, asset persistence, or webhook signatures directly in the makeworkflow — the UI is already wired to showcase the results.
