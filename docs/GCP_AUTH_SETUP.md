# GCP Authentication Setup

This guide explains how to configure persistent Google Cloud authentication for your VidBolt instance.

## Prerequisites

- A Google Cloud Project with Compute Engine API enabled
- Supabase project with Google OAuth configured

## Step 1: Get Your Google OAuth Credentials

### Option A: From Supabase Dashboard (Recommended)

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers** → **Google**
4. Copy the **Client ID** and **Client Secret**

### Option B: From Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to **APIs & Services** → **Credentials**
4. Find your OAuth 2.0 Client ID (Web Application type)
5. Click on it to view the Client ID and Client Secret

## Step 2: Configure Environment Variables

Add the following to your `.env.local` file:

```env
# Google OAuth (Required for persistent GCP authentication)
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

## Step 3: Apply Database Migration

Run the migration to add the refresh token column:

```bash
npx supabase db push
```

Or apply manually in Supabase SQL Editor:

```sql
ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS gcp_refresh_token TEXT;

ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS gcp_token_expires_at TIMESTAMPTZ;
```

## Step 4: Verify OAuth Scopes

Ensure your Google OAuth configuration includes the `compute` scope:

1. In your Supabase Dashboard → Authentication → Providers → Google
2. Verify the OAuth consent screen includes:
   - `https://www.googleapis.com/auth/compute`

## Step 5: Restart Your Server

```bash
npm run dev
```

## How It Works

1. **User connects**: Clicks "Connect with Google" in Settings
2. **Token stored**: Refresh token is securely stored in your database
3. **Automatic refresh**: Server refreshes access tokens as needed
4. **Persistent access**: Users stay connected across sessions

## Troubleshooting

### "Missing GOOGLE_CLIENT_ID" Error

- Ensure both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Restart your development server after adding env vars

### "Token refresh failed" Error

- Verify your Client ID/Secret are correct
- Check that the OAuth consent screen is properly configured
- Ensure the user hasn't revoked access in their Google Account settings

### User Still Sees "Authentication Required"

- Check if the database migration was applied
- Verify the user's `gcp_refresh_token` is not null in the database
- Try disconnecting and reconnecting the account
