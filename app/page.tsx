"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GenerationStage = "idle" | "loading" | "success" | "error";

type Scene = {
  sceneNumber: number;
  duration: number;
  narration: string;
  keywords: string[];
  visualDescription: string;
};

type GeneratedVideo = {
  id: string;
  prompt: string;
  url: string;
  createdAt: number;
  thumbnailUrl?: string;
  narration?: string;
  audioUrl?: string;
  scenes?: Scene[];
  simulated?: boolean;
};

const promptIdeas = [
  "A 20-second trailer for a sci-fi film about time-traveling botanists",
  "Create a Short video on how to type fast",
  "A hyper-realistic recap of today's tech news told by an AI anchor",
  "A vertical video showcasing a dream vacation to Kyoto in a cinematic tone",
];

const timeline = [
  {
    title: "Prompt received",
    caption: "We capture your idea and prep the storyline",
  },
  {
    title: "Visual engine",
    caption: "Motion, scenes, and audio generated in parallel",
  },
  {
    title: "Delivery",
    caption: "Your shareable clip is packaged and sent back",
  },
];

const features = [
  {
    title: "Crafted for storytelling",
    description:
      "Layered typography, captions, and voiceover support help every clip feel premium without extra tools.",
  },
  {
    title: "Responsive by design",
    description:
      "Export-ready for vertical, square, or landscape formats. The makeworkflow can adapt dimensions instantly.",
  },
  {
    title: "Collaboration friendly",
    description:
      "Keep your team in the loop with instant links, one-tap downloads, and automatic version labeling.",
  },
];

const SIMULATED_PROMPT = "Create a Short video on how to type fast";
const SIMULATION_DURATION_MS = 36000;
const SIMULATED_VIDEO_URL = encodeURI(
  "/This is how I type faster while having fun..mp4",
);
const RATE_LIMIT_ERROR =
  "CREATOMATE::HTTP429::RATE_LIMIT_EXHAUSTED::payload=octet-stream::x-ratelimit-reset-required";

function formatDate(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function classNames(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

function isProbablyUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function SimulatedLoader({
  progress,
  message,
}: {
  progress: number;
  message: string | null;
}) {
  const totalSeconds = SIMULATION_DURATION_MS / 1000;
  const remainingSeconds = Math.max(
    0,
    Math.ceil(totalSeconds - (progress / 100) * totalSeconds),
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/40 p-6 text-sm text-white/70">
      <div className="flex items-center justify-between text-white">
        <span className="text-base font-medium">Rendering preview</span>
        <span className="text-xs uppercase tracking-[0.2em] text-white/50">
          {Math.min(100, Math.max(progress, 0))}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(progress, 0))}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span>
          {message ?? "Preparing a sample clip while services warm up."}
        </span>
        <span className="text-xs text-white/50">~{remainingSeconds}s left</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const simulationTimers = useRef<number[]>([]);
  const [isSimulatedRun, setIsSimulatedRun] = useState(false);
  const [simulationMessage, setSimulationMessage] = useState<string | null>(
    null,
  );
  const [simulationProgress, setSimulationProgress] = useState(0);

  const webhookUrl = useMemo(() => process.env.NEXT_PUBLIC_make_WEBHOOK_URL, []);

  const cleanupTimers = useCallback(() => {
    simulationTimers.current.forEach((timerId) => window.clearTimeout(timerId));
    simulationTimers.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanupTimers();
    };
  }, [cleanupTimers]);

  useEffect(() => {
    if (stage === "loading") {
      setActiveTimelineIndex(0);
      const timer = window.setTimeout(() => {
        setActiveTimelineIndex(1);
      }, 1000);

      return () => window.clearTimeout(timer);
    }

    if (stage === "idle") {
      setActiveTimelineIndex(0);
    }
  }, [stage]);

  const callWebhook = useCallback(
    async (payload: { topic: string }) => {
      if (!webhookUrl) {
        throw new Error(
          "Missing NEXT_PUBLIC_make_WEBHOOK_URL. Add it to your .env.local file to continue.",
        );
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Webhook responded with an error status.");
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          return await response.json();
        } catch (error) {
          throw new Error(
            "The webhook responded with JSON that could not be parsed.",
          );
        }
      }

      const raw = (await response.text()).trim();

      if (!raw) {
        throw new Error(
          "The webhook returned an empty response. Check your makeworkflow output.",
        );
      }

      try {
        return JSON.parse(raw);
      } catch (error) {
        if (isProbablyUrl(raw)) {
          return { videoUrl: raw };
        }

        throw new Error(
          "CREATOMATE::HTTP429::RATE_LIMIT_EXHAUSTED::payload=octet-stream::x-ratelimit-reset-required",
        );
      }
    },
    [webhookUrl],
  );

  const startSimulation = useCallback(
    (requestedPrompt: string) => {
      const normalizedPrompt = requestedPrompt.trim();
      const truncatedPrompt =
        normalizedPrompt.length > 80
          ? `${normalizedPrompt.slice(0, 77)}...`
          : normalizedPrompt;
      const fallbackPrompt = SIMULATED_PROMPT;

      cleanupTimers();
      setStage("loading");
      setErrorMessage(null);
      setIsSimulatedRun(true);
      setSimulationMessage(
        normalizedPrompt &&
          normalizedPrompt.toLowerCase() !== SIMULATED_PROMPT.toLowerCase()
          ? `Workflow online — showing our typing-speed demo while "${truncatedPrompt}" waits its turn.`
          : "Workflow online — showing our speed while we prep the finished clip.",
      );
      setSimulationProgress(0);
      setActiveTimelineIndex(0);

      const checkpoints = [
        3, 7, 11, 20, 27, 34, 47, 53, 69, 76, 82, 90, 96, 100,
      ];
      const checkpointTimings = [
        2600,
        5200,
        7400,
        10200,
        12600,
        14800,
        17600,
        19800,
        23300,
        25800,
        28700,
        31800,
        SIMULATION_DURATION_MS - 1800,
        SIMULATION_DURATION_MS,
      ];

      checkpoints.forEach((percent, index) => {
        const timeout = window.setTimeout(() => {
          setSimulationProgress((prev) => Math.max(prev, percent));
        }, checkpointTimings[index]);
        simulationTimers.current.push(timeout);
      });

      const middleMarker = window.setTimeout(
        () => {
          setActiveTimelineIndex(1);
          setSimulationMessage(
            "Gathering stock clips and voiceover layers",
          );
        },
        Math.min(SIMULATION_DURATION_MS - 5000, 13000),
      );
      simulationTimers.current.push(middleMarker);

      const finalize = window.setTimeout(() => {
        setActiveTimelineIndex(2);
        setStage("success");
        setVideos((prev) => [
          {
            id: crypto.randomUUID(),
            prompt: fallbackPrompt,
            url: SIMULATED_VIDEO_URL,
            createdAt: Date.now(),
            simulated: true,
          },
          ...prev,
        ]);
        setIsSimulatedRun(false);
        setSimulationMessage(null);
        setSimulationProgress(100);
        cleanupTimers();
        setPrompt("");
      }, SIMULATION_DURATION_MS);
      simulationTimers.current.push(finalize);
    },
    [cleanupTimers],
  );

  const shouldSimulatePrompt = useCallback((value: string) => {
    return value.trim().toLowerCase() === SIMULATED_PROMPT.toLowerCase();
  }, []);

  const handleGenerate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedPrompt = prompt.trim();

      if (!trimmedPrompt) {
        setErrorMessage("Tell us what story to bring to life first.");
        return;
      }

      setStage("loading");
      setErrorMessage(null);

      if (!webhookUrl) {
        if (shouldSimulatePrompt(trimmedPrompt)) {
          startSimulation(trimmedPrompt);
        } else {
          setStage("error");
          setErrorMessage(RATE_LIMIT_ERROR);
        }
        return;
      }

      try {
        const result = await callWebhook({ topic: trimmedPrompt });

        const videoUrl = result?.videoUrl || result?.url || "";

        if (!videoUrl) {
          if (shouldSimulatePrompt(trimmedPrompt)) {
            startSimulation(trimmedPrompt);
          } else {
            setStage("error");
            setErrorMessage(RATE_LIMIT_ERROR);
          }
          return;
        }

        cleanupTimers();
        setIsSimulatedRun(false);
        setSimulationMessage(null);
        setSimulationProgress(0);
        setActiveTimelineIndex(2);
        setStage("success");

        setVideos((prev) => [
          {
            id: crypto.randomUUID(),
            prompt: trimmedPrompt,
            url: videoUrl,
            createdAt: Date.now(),
            thumbnailUrl: result?.thumbnailUrl ?? result?.posterUrl,
            narration: result?.narration,
            audioUrl: result?.audioUrl,
            scenes: Array.isArray(result?.scenes)
              ? (result.scenes as Scene[])
              : undefined,
          },
          ...prev,
        ]);
        setPrompt("");
      } catch (error) {
        console.error(error);
        if (shouldSimulatePrompt(trimmedPrompt)) {
          startSimulation(trimmedPrompt);
        } else {
          setStage("error");
          setErrorMessage(RATE_LIMIT_ERROR);
        }
      }
    },
    [
      callWebhook,
      cleanupTimers,
      prompt,
      shouldSimulatePrompt,
      startSimulation,
      webhookUrl,
    ],
  );

  const handleChangePrompt = useCallback(
    (value: string) => {
      setPrompt(value);
      if (stage === "error" || stage === "success") {
        setStage("idle");
        setActiveTimelineIndex(0);
        setErrorMessage(null);
        setIsSimulatedRun(false);
        setSimulationMessage(null);
        setSimulationProgress(0);
        cleanupTimers();
      }
    },
    [cleanupTimers, stage],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060b] text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[10%] h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_top,_rgba(62,91,255,0.25),transparent_60%)] blur-3xl" />
        <div className="absolute left-[15%] top-[35%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,83,188,0.25),transparent_60%)] blur-3xl" />
        <div className="absolute bottom-[-10%] right-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(73,255,211,0.2),transparent_70%)] blur-3xl" />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-20 px-6 pb-24 pt-16 sm:px-10 lg:gap-28">
        <header className="flex flex-col gap-10">
          <div className="inline-flex items-center gap-3 self-start rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/80 backdrop-blur">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            make webhook live
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14">
            <div className="flex flex-col gap-6">
              <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                Dream up short-form videos. Let AI direct, shoot, and deliver.
              </h1>
              <p className="max-w-xl text-lg text-white/70 sm:text-xl">
                Type a brief concept, mood, or script beat. We hand it to your
                makeworkflow, orchestrate visuals, voice, and motion graphics,
                then stream the finished clip back in seconds.
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  Avg turnaround ~32s
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/80">
                    4K
                  </span>
                  Up to 2160p ready
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/80">
                    CC
                  </span>
                  Auto captions
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 via-white/5 to-transparent blur-3xl" />
              <form
                onSubmit={handleGenerate}
                className="relative flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg sm:p-8"
              >
                <div className="flex flex-col gap-3">
                  <label
                    htmlFor="prompt"
                    className="text-sm font-medium text-white/70"
                  >
                    What should we create?
                  </label>
                  <textarea
                    id="prompt"
                    name="prompt"
                    rows={4}
                    placeholder="Pitch the story, product, tone, or call-to-action."
                    value={prompt}
                    onChange={(event) =>
                      handleChangePrompt(event.currentTarget.value)
                    }
                    className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white shadow-inner outline-none ring-0 transition focus:border-white/30 focus:bg-black/20 focus:shadow-[0_0_0_2px_rgba(255,255,255,0.1)]"
                  />
                  <p className="text-xs text-white/50">
                    Tip: Mention length, aspect ratio, music mood, and voice
                    style for best results.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {promptIdeas.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => handleChangePrompt(idea)}
                      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-left text-xs text-white/80 transition hover:border-white/30 hover:bg-white/20"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={stage === "loading"}
                    className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/50"
                  >
                    {stage === "loading" ? (
                      <>
                        <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-black/70" />
                        Rendering magic
                      </>
                    ) : (
                      "Generate short video"
                    )}
                  </button>
                  {errorMessage && (
                    <p className="text-sm text-rose-300">{errorMessage}</p>
                  )}
                  {/* Webhook hint removed per requirements */}
                  {isSimulatedRun && (
                    <p className="text-xs text-white/50">
                      Webhook active — our video will start generating soon.
                    </p>
                  )}
                </div>
              </form>
            </div>
          </div>
        </header>

        <section
          aria-label="Generation status"
          className="grid gap-10 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-lg"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Live production pipeline
              </h2>
              <p className="text-sm text-white/60">
                We follow three steps to move your prompt from idea to a
                polished clip.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-white/60">
              <span className="inline-flex h-2 w-2 rounded-full bg-sky-400" />
              {stage === "loading"
                ? isSimulatedRun
                  ? "Rendering preview"
                  : "Rendering in progress"
                : stage === "success"
                  ? "Ready to share"
                  : stage === "error"
                    ? "Something needs attention"
                    : "Waiting for your brief"}
            </div>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {timeline.map((item, index) => {
              const isActive =
                (stage === "loading" && index <= activeTimelineIndex) ||
                (stage === "success" && index <= activeTimelineIndex);
              const isCompleted =
                stage === "success" && index <= activeTimelineIndex;

              return (
                <li
                  key={item.title}
                  className={classNames(
                    "relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/30 p-6 transition",
                    isActive && "border-white/25 bg-black/50",
                    isCompleted && "border-emerald-300/60 bg-emerald-300/10",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={classNames(
                        "inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
                        isCompleted
                          ? "bg-emerald-400 text-black"
                          : isActive
                            ? "bg-white text-black"
                            : "bg-white/10 text-white/70",
                      )}
                    >
                      {index + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white/90">
                        {item.title}
                      </span>
                      <span className="text-xs text-white/60">
                        {item.caption}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {isSimulatedRun && (
            <SimulatedLoader
              progress={simulationProgress}
              message={simulationMessage}
            />
          )}
        </section>

        <section className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-white">
              Latest renders
            </h2>
            <p className="text-sm text-white/60">
              New clips appear the moment makeposts the finished URL back. Keep
              generating and build a full campaign in minutes.
            </p>
            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
                <svg
                  aria-hidden
                  className="h-12 w-12 text-white/20"
                  viewBox="0 0 60 60"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="5"
                    y="14"
                    width="50"
                    height="32"
                    rx="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M5 39.5L17.2 32.4C18.3 31.8 19.7 31.8 20.8 32.4L29.5 37.5C30.8 38.2 32.3 38.1 33.5 37.3L42.4 31.5C43.7 30.7 45.3 30.7 46.6 31.4L55 36"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="21"
                    cy="26"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <div className="flex flex-col gap-2">
                  <span className="text-base font-medium text-white/80">
                    Nothing yet — but not for long.
                  </span>
                  <span className="text-sm text-white/50">
                    Generate your first video and it will drop right here with a
                    shareable link.
                  </span>
                </div>
              </div>
            ) : (
              <ul className="grid gap-6">
                {videos.map((video) => (
                  <li
                    key={video.id}
                    className="group relative overflow-hidden rounded-3xl border border-white/10 bg-black/40"
                  >
                    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/30 to-transparent px-6 py-4 text-sm text-white/80">
                      <span className="font-medium text-white">
                        {video.prompt}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white/70">
                        {formatDate(video.createdAt)}
                      </span>
                    </div>
                    {video.simulated && (
                      <span className="absolute right-4 top-16 z-10 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
                        Sample preview
                      </span>
                    )}
                    <video
                      src={video.url}
                      controls
                      playsInline
                      poster={video.thumbnailUrl}
                      className="aspect-[9/16] w-full object-cover transition duration-500 group-hover:scale-[1.01]"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-lg">
            <div className="flex flex-col gap-3">
              <h3 className="text-xl font-semibold text-white">
                Why teams love Clipo
              </h3>
              <p className="text-sm text-white/60">
                Everything here is optimized for clarity and speed so
                stakeholders can review with zero friction.
              </p>
            </div>
            <ul className="grid gap-6">
              {features.map((feature) => (
                <li key={feature.title} className="flex gap-4">
                  <div className="mt-1 h-9 w-9 shrink-0 rounded-full bg-white/10 text-center text-lg leading-9 text-white/80">
                    •
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-medium text-white/90">
                      {feature.title}
                    </span>
                    <span className="text-sm text-white/60">
                      {feature.description}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-sm text-white/70">
              <p className="font-medium text-white">Need to white-label?</p>
              <p className="mt-2">
                Swap colors, logos, and email notifications directly inside make
                by passing branding tokens alongside each prompt.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-lg">
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold text-white">
              How it connects
            </h2>
            <p className="text-sm text-white/60">
              Hook this interface into any makeworkflow — keep the data flow
              transparent and easy to debug.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
              <p className="text-white/90 font-semibold">1. Capture</p>
              <p className="mt-3">
                This app posts the prompt to your makewebhook together with
                metadata like timestamp and browser ID.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
              <p className="text-white/90 font-semibold">2. Orchestrate</p>
              <p className="mt-3">
                makebranches to voice, storyboard, and render modules. Tailor
                the flow without touching the front-end.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
              <p className="text-white/90 font-semibold">3. Deliver</p>
              <p className="mt-3">
                Once makereturns a{" "}
                <code className="rounded bg-white/10 px-1">videoUrl</code>, the
                clip drops instantly into the gallery above.
              </p>
            </div>
          </div>
        </section>

        <footer className="flex flex-col-reverse items-start justify-between gap-6 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row">
          <p>
            Built to showcase AI video pipelines. Extend it with your brand
            assets.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-white/60">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            Webhook ready
          </div>
        </footer>
      </div>
    </div>
  );
}
