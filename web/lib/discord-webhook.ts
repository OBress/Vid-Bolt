/**
 * Discord Webhook Utility
 *
 * Sends rich embed notifications to Discord channels via webhooks.
 * Used for operational alerts like new waitlist signups.
 */

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

/**
 * Sends a payload to a Discord webhook endpoint.
 */
async function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[Discord Webhook] Failed to send:', response.status, text);
  }
}

/**
 * User data passed from the auth callback when a new user signs up.
 */
interface NewWaitlistUserData {
  email: string | undefined;
  discordId: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
  inVidBoltServer: boolean;
}

/**
 * Sends a rich embed notification to Discord when a new user joins the waitlist.
 * Fire-and-forget — errors are logged but never thrown to avoid blocking auth flow.
 */
export async function notifyNewWaitlistUser(
  userData: NewWaitlistUserData
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WAITLIST_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('[Discord Webhook] DISCORD_WAITLIST_WEBHOOK_URL not set — skipping notification');
    return;
  }

  const fields: DiscordEmbed['fields'] = [
    {
      name: '📧 Email',
      value: userData.email || 'N/A',
      inline: true,
    },
    {
      name: '🎮 Discord Username',
      value: userData.discordUsername || 'N/A',
      inline: true,
    },
    {
      name: '🆔 Discord ID',
      value: userData.discordId || 'N/A',
      inline: true,
    },
    {
      name: '🏠 In VidBolt Server',
      value: userData.inVidBoltServer ? '✅ Yes' : '❌ No',
      inline: true,
    },
  ];

  const embed: DiscordEmbed = {
    title: '🆕 New Waitlist Signup',
    description: 'A new user has signed up and is pending approval.',
    color: 0xf97316, // Orange to match VidBolt branding
    fields,
    thumbnail: userData.discordAvatar
      ? { url: userData.discordAvatar }
      : undefined,
    footer: { text: 'VidBolt Waitlist System' },
    timestamp: new Date().toISOString(),
  };

  await sendDiscordWebhook(webhookUrl, {
    embeds: [embed],
    username: 'VidBolt Waitlist',
  });
}
