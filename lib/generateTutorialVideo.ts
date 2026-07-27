// lib/generateTutorialVideo.ts
//
// Turns a guide's steps (screenshot + narration text) into one narrated MP4:
// OpenAI TTS voices each step's text, ffmpeg holds that step's image on
// screen for exactly the narration's length, then all step segments are
// concatenated into a single video. Everything happens in a temp dir under
// /tmp (the only writable path in a Vercel serverless function) and is
// cleaned up afterward regardless of success or failure.

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";
// ffmpeg-static has no bundled types — it exports the path to the platform's
// prebuilt ffmpeg binary as a plain string.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const ffmpegPath = require("ffmpeg-static") as string;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface VideoStep {
  imageBuffer: Buffer;
  narration: string; // text spoken for this step
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`));
    });
    p.on("error", reject);
  });
}

async function synthesizeNarration(text: string): Promise<Buffer> {
  // tts-1-hd (unlike gpt-4o-mini-tts) has no steerable "instructions" field —
  // every call renders the same voice the same way, with nothing for the
  // model to reinterpret differently step to step. That determinism is what
  // fixes the "different people talking" issue: gpt-4o-mini-tts re-reads the
  // instructions fresh on every independent call and can land on a slightly
  // different pitch/pacing/energy each time.
  const response = await client.audio.speech.create({
    model: "tts-1-hd",
    voice: "coral",
    input: text,
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Build one narrated MP4 from a list of {image, narration} steps.
 * Returns the final video as a Buffer. Throws on any failure — callers
 * should decide whether a video failure should block the rest of the
 * upload (recommended: don't — the guide's images/text still work fine
 * without a video).
 */
export async function generateTutorialVideo(steps: VideoStep[]): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static)");
  if (steps.length === 0) throw new Error("No steps to generate a video from");

  // Vercel's file-tracing bundling commonly strips the executable bit off
  // ffmpeg-static's binary, causing a silent "spawn EACCES" that looks
  // identical to any other failure. Force it back before every run.
  try {
    await fs.chmod(ffmpegPath, 0o755);
  } catch (e) {
    console.error("Could not chmod ffmpeg binary:", e);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "tutorial-"));

  try {
    const segmentPaths: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const imgPath = path.join(workDir, `step${i}.png`);
      const audioPath = path.join(workDir, `step${i}.mp3`);
      const segPath = path.join(workDir, `seg${i}.mp4`);

      await fs.writeFile(imgPath, step.imageBuffer);

      const narrationText = step.narration.trim() || `Step ${i + 1}.`;
      const audioBuffer = await synthesizeNarration(narrationText);
      await fs.writeFile(audioPath, audioBuffer);

      // Hold the image for exactly the narration's length (-shortest stops
      // the still-image video track the moment the audio track ends).
      await run(ffmpegPath, [
        "-y",
        "-loop", "1",
        "-i", imgPath,
        "-i", audioPath,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-vf", "scale=1280:-2,format=yuv420p",
        segPath,
      ]);

      segmentPaths.push(segPath);
    }

    // Concatenate every step's segment into one final video.
    const concatListPath = path.join(workDir, "concat.txt");
    const concatList = segmentPaths.map((p) => `file '${p}'`).join("\n");
    await fs.writeFile(concatListPath, concatList);

    const finalPath = path.join(workDir, "final.mp4");
    await run(ffmpegPath, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c", "copy",
      finalPath,
    ]);

    return await fs.readFile(finalPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}