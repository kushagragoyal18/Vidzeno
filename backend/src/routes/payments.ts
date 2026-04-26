import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../db/index';
import { AuthRequest, requireAuth } from './auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const paymentsRouter = Router();

// Create checkout session
paymentsRouter.post('/create-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { plan } = req.body; // 'monthly' or 'yearly'

    const userId = req.user!.id;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Get price IDs from environment
    const priceId =
      plan === 'yearly'
        ? process.env.STRIPE_PRICE_ID_YEARLY
        : process.env.STRIPE_PRICE_ID_MONTHLY;

    if (!priceId) {
      res.status(500).json({ error: 'Price not configured' });
      return;
    }

    // Check if user has a Stripe customer ID
    const { rows } = await query<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
      [userId]
    );

    let customerId = rows.length > 0 ? rows[0].stripe_customer_id : undefined;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user!.email,
        metadata: {
          userId,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await query(
        `INSERT INTO subscriptions (user_id, stripe_customer_id, plan, status)
         VALUES ($1, $2, 'free', 'active')
         ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2`,
        [userId, customerId]
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
      metadata: {
        userId,
        plan,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get user's subscription status
paymentsRouter.get('/subscription', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const { rows } = await query<{
      plan: string;
      status: string;
      current_period_start: Date | null;
      current_period_end: Date | null;
    }>(
      `SELECT plan, status, current_period_start, current_period_end
       FROM subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      res.json({
        plan: 'free',
        status: 'none',
      });
      return;
    }

    const sub = rows[0];
    res.json({
      plan: sub.plan as 'free' | 'premium',
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Create portal session for managing subscription
paymentsRouter.post('/create-portal-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Get Stripe customer ID
    const { rows } = await query<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 AND stripe_customer_id IS NOT NULL LIMIT 1',
      [userId]
    );

    if (rows.length === 0 || !rows[0].stripe_customer_id) {
      res.status(400).json({ error: 'No subscription found' });
      return;
    }

    const customerId = rows[0].stripe_customer_id;

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/settings`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

export default paymentsRouter;
