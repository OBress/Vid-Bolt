
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

async function main() {
  // 1. Load env vars manually
  const envPath = path.resolve(process.cwd(), ".env.local");
  let fileContent = "";
  try {
    fileContent = fs.readFileSync(envPath, "utf8");
  } catch (e) {
    console.error("Could not read .env.local", e);
    return;
  }

  const env: any = {};
  fileContent.split("\n").forEach(line => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      env[key.trim()] = rest.join("=").trim().replace(/"/g, ""); // Remove quotes
    }
  });

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing Supabase credentials in .env.local");
    return;
  }

  const supabase = createClient(url, key);
  const videoId = "c8395bf5-cb6f-42b4-ac74-b27f688e612a";

  console.log("Inspecting Video:", videoId);

  // 2. Fetch Video
  const { data: video, error: videoError } = await supabase
    .from("video_projects")
    .select("*")
    .eq("id", videoId)
    .single();

  if (videoError) {
    console.error("Video Error:", videoError);
    return;
  }

  console.log("Video Found. Audio Task ID:", video.audio_task_id);
  console.log("Video Metadata Keys:", Object.keys(video.metadata || {}));
  console.log("Video Metadata Audio Chunks:", (video.metadata as any)?.audio_chunks?.length || "None");

  // 3. Fetch Audio Task
  if (video.audio_task_id) {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", video.audio_task_id)
      .single();

    if (taskError) {
      console.error("Task Error:", taskError);
    } else {
      console.log("Task Found. Status:", task.status);
      console.log("Task Output Keys:", Object.keys(task.output_data || {}));
      
      const output = task.output_data as any;
      console.log("Task Output tts_chunks:", output?.tts_chunks?.length || "None");
      
      if (output?.tts_chunks?.length > 0) {
        console.log("First Chunk Sample:", task.output_data.tts_chunks[0]);
      }
    }
  } else {
    console.log("No Audio Task Linked.");
  }
}

main().catch(console.error);
