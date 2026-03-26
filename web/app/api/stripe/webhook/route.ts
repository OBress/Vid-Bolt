import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events. Verifies signature, then processes
 * checkout.session.completed to credit GPU hours.
 *
 * This endpoint MUST bypass Supabase auth middleware since Stripe
 * sends its own signature for verification.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const hours = parseInt(session.metadata?.hours || "0", 10);
      const amountCents = session.amount_total ?? null;

      if (!userId || !hours) {
        console.error("[Stripe Webhook] Missing metadata:", { userId, hours });
        return NextResponse.json(
          { error: "Missing user_id or hours in session metadata" },
          { status: 400 }
        );
      }

      console.log(
        `[Stripe Webhook] Processing purchase: ${hours} hours ($${((amountCents ?? 0) / 100).toFixed(2)}) for user ${userId}, session ${session.id}`
      );

      try {
        const supabase = createServiceClient();

        // Call the credit_gpu_hours RPC (handles idempotency internally)
        const { data, error } = await supabase.rpc("credit_gpu_hours", {
          p_user_id: userId,
          p_hours: hours,
          p_stripe_session_id: session.id,
          p_amount_cents: amountCents,
        });

        if (error) {
          console.error("[Stripe Webhook] RPC error:", error);
          return NextResponse.json(
            { error: `Failed to credit hours: ${error.message}` },
            { status: 500 }
          );
        }

        console.log(
          `[Stripe Webhook] ✅ Credited ${hours} hours to user ${userId}. New balance: ${data}`
        );
      } catch (err: any) {
        console.error("[Stripe Webhook] Error crediting hours:", err);
        return NextResponse.json(
          { error: "Internal error crediting hours" },
          { status: 500 }
        );
      }
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt
      console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
