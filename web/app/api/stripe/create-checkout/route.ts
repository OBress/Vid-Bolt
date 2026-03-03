import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";
import { stripeLimiter } from "@/lib/utils/rate-limiters";

/**
 * POST /api/stripe/create-checkout
 * 
 * Creates a Stripe Checkout Session for purchasing GPU hours.
 * Accepts { hours: number } in the request body (any positive integer).
 * Returns { url: string } — the Stripe Checkout URL to redirect the user to.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check
    const rateLimited = stripeLimiter.check(user.id);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const hours = Math.round(Number(body.hours));

    // Validate hours
    if (!hours || hours < 1 || hours > 1000) {
      return NextResponse.json(
        { error: "Hours must be a whole number between 1 and 1000" },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const { data: userData } = await supabase
      .from("users")
      .select("stripe_customer_id, email, name")
      .eq("id", user.id)
      .single();

    let customerId = userData?.stripe_customer_id;

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userData?.email || user.email,
        name: userData?.name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Store the customer ID using service-role client since our
      // trigger blocks this column for anon-key users.
      const serviceSupabase = createServiceClient();
      await serviceSupabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Calculate price in cents ($1 per hour)
    const unitAmount = 100; // $1.00 in cents
    const totalAmount = unitAmount * hours;

    // Determine success/cancel URLs
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const successUrl = `${origin}/command-center/settings/general?tab=account&checkout=success`;
    const cancelUrl = `${origin}/command-center/settings/general?tab=account&checkout=cancelled`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: totalAmount,
            product_data: {
              name: `${hours} GPU Rendering Hour${hours > 1 ? "s" : ""}`,
              description: `${hours} hour${hours > 1 ? "s" : ""} of GPU rendering time for video production`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        hours: hours.toString(),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("[Stripe] Create checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
