import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../db/index';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const webhooksRouter = Router();

// Stripe webhook endpoint
webhooksRouter.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not configured, skipping signature verification');
      event = req.body as Stripe.Event;
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode !== 'subscription') {
          break;
        }

        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription as string;

        if (!userId) {
          console.error('No userId in session metadata');
          break;
        }

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Update user to premium
        await query(
          `UPDATE users SET plan = 'premium' WHERE id = $1`,
          [userId]
        );

        // Update/create subscription record
        await query(
          `INSERT INTO subscriptions (user_id, stripe_subscription_id, plan, status, current_period_start, current_period_end)
           VALUES ($1, $2, 'premium', 'active', $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET
             stripe_subscription_id = $2,
             plan = 'premium',
             status = 'active',
             current_period_start = $3,
             current_period_end = $4,
             updated_at = CURRENT_TIMESTAMP`,
          [
            userId,
            subscriptionId,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
          ]
        );

        console.log(`User ${userId} upgraded to premium`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by customer ID
        const { rows } = await query<{ user_id: string }>(
          'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
          [customerId]
        );

        if (rows.length === 0) {
          console.error('No user found for customer:', customerId);
          break;
        }

        const userId = rows[0].user_id;
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';

        // Update user plan
        await query(
          `UPDATE users SET plan = $1 WHERE id = $2`,
          [isActive ? 'premium' : 'free', userId]
        );

        // Update subscription record
        await query(
          `UPDATE subscriptions SET
             status = $1,
             plan = $2,
             current_period_start = $3,
             current_period_end = $4,
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $5`,
          [
            isActive ? 'active' : 'cancelled',
            isActive ? 'premium' : 'free',
            subscription.status === 'active' || subscription.status === 'trialing'
              ? new Date(subscription.current_period_start * 1000)
              : null,
            new Date(subscription.current_period_end * 1000),
            userId,
          ]
        );

        console.log(`User ${userId} subscription updated to ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by customer ID
        const { rows } = await query<{ user_id: string }>(
          'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1',
          [customerId]
        );

        if (rows.length === 0) {
          console.error('No user found for deleted subscription:', customerId);
          break;
        }

        const userId = rows[0].user_id;

        // Downgrade user to free
        await query(
          `UPDATE users SET plan = 'free' WHERE id = $1`,
          [userId]
        );

        // Update subscription record
        await query(
          `UPDATE subscriptions SET
             status = 'cancelled',
             plan = 'free',
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1`,
          [userId]
        );

        console.log(`User ${userId} downgraded to free`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default webhooksRouter;
