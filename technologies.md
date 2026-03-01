Frontend (Next.js App)
Core Framework
Next.js 14+ with App Router
TypeScript for type safety
Tailwind CSS for styling
Video Editor
DesignCombo React Video Editor Pro (~$300-500 license)
Built-in timeline with thumbnails and waveforms
Transitions, effects, and animations included
3D transforms and keyframe support
Active development team and support
State Management
Zustand for global app state
React Query (TanStack Query) for server state and caching
Real-Time Updates
Socket.io-client for render progress
Server-Sent Events as fallback
Authentication
Supabse authentication
Protected routes and API middleware
UI Components
Radix UI primitives
Lucide icons
Sonner for toast notifications

Backend (Multiple Services)
Primary API (Next.js API Routes)
Project CRUD operations
User management
Job queue management
Webhook handlers
Video Rendering (AWS Lambda or Server)
Remotion Lambda for final composition
DesignCombo exports Remotion-compatible format
Parallel frame rendering
AI Generation (User's GCP / VAST.ai)
ComfyUI server deployment
Custom workflow execution (ControlNet, LoRAs, AnimateDiff)
Automatic VM provisioning and teardown
Task Queue
Native since I'm using railway
Handles long-running AI generation
Retry logic and failure handling

Creative Direction & Orchestration
Manifest Builder (3-layer merge: system → channel → per-video)
LoRA Sync Service (R2 → GPU API on-demand)
MG Template Tracker (composition style consistency per-video)
Agent Graph Orchestration:
Graph Templates (4 preset DAGs: documentary, montage, comparison, tutorial)
Intent Classifier (Gemini Flash content analysis → template selection)
DAG Executor (Kahn's topological sort, parallel dispatch, crash recovery)
Graph Composer (LLM-composed custom DAGs)
Graph Reviewer (two-step structural + semantic validation)

Storage
Cloudflare R2 (Primary)
User uploads (images, audio, video clips)
Template assets (backgrounds, fonts, overlays)
AI model outputs
Zero egress fees
AWS S3 (Lambda Requirement)
Remotion Lambda bundle
Final rendered videos (7-day auto-delete)
Lambda temporary artifacts

Database
Supabase (PostgreSQL)
User accounts and preferences
Project metadata and JSON
Render job history
GCP credentials (encrypted)
User authentication
Redis (Upstash)
Session caching
Rate limiting
Real-time job status

AI/ML Pipeline
Image Generation:
Z-Image-Turbo
Control Net
Loras and Lora creation
3090/4090/L4 GPU
Video generation
HunyuanVideo 1.5
ControlNet: Canny, Depth, OpenPose, LineArt
H100 GPU
Model Storage
Hugging Face Hub for model downloads
R2 for cached/custom models

Hosting
Railway for Next.js frontend and API
Cloudflare for DNS and CDN
GPU Compute (User-Managed)
Google Cloud Platform (Compute Engine)
VAST.ai as alternative
RunPod as alternative
Other API Services
User’s own API keys
Monitoring
Railway for error tracking (free tier)
AWS CloudWatch for Lambda metrics
Something monitoring the comfyui status on GCP or wherever
