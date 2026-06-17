import express, { Router } from "express";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "../db";
import { DomainError } from "../domain/errors";
import { canTransitionPayment, paymentAmount } from "../domain/payments";
import { stripe } from "../lib/stripe";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const paymentsRouter = Router();
export const webhookRouter = Router();

// ── GET /bookings/:booking_id/payments ─────────────────────────────────────

paymentsRouter.get(
	"/:booking_id/payments",
	authenticate,
	async (req, res, next) => {
		try {
			const booking_id = String(req.params.booking_id);

			const booking = await prisma.booking.findUnique({
				where: { id: booking_id },
			});
			if (!booking) throw new DomainError("not_found", "Booking not found");

			if (booking.property_id) {
				const property = await prisma.property.findUnique({
					where: { id: booking.property_id },
				});
				if (!property || property.user_id !== req.manager.id) {
					throw new DomainError("forbidden", "Access denied");
				}
			}

			const payments = await prisma.payment.findMany({
				where: { booking_id: booking_id },
				orderBy: { created_at: "asc" },
			});

			res.json(payments.map((p) => ({ ...p, amount: Number(p.amount) })));
		} catch (err) {
			next(err);
		}
	},
);

// ── POST /bookings/:booking_id/payments/intent ──────────────────────────────

const intentSchema = z.object({
	type: z.enum(["deposit", "balance", "full"]),
});

paymentsRouter.post(
	"/:booking_id/payments/intent",
	validate(intentSchema),
	async (req, res, next) => {
		try {
			const booking_id = String(req.params.booking_id);
			const { type } = req.body as z.infer<typeof intentSchema>;

			const booking = await prisma.booking.findUnique({
				where: { id: booking_id },
			});
			if (!booking) throw new DomainError("not_found", "Booking not found");

			const existing = await prisma.payment.findFirst({
				where: {
					booking_id: booking_id,
					type,
					status: { in: ["pending", "succeeded"] },
				},
			});
			if (existing) {
				throw new DomainError(
					"payment_already_completed",
					"A payment of this type is already pending or succeeded",
				);
			}

			const amount = paymentAmount(
				type,
				Number(booking.total_amount),
				Number(booking.deposit_amount),
			);

			const intent = await stripe.paymentIntents.create({
				amount: Math.round(amount * 100),
				currency: "eur",
				metadata: { booking_id, payment_type: type },
			});

			const payment = await prisma.payment.create({
				data: {
					booking_id,
					stripe_payment_intent_id: intent.id,
					amount,
					type,
					status: "pending",
				},
			});

			res.status(201).json({
				payment_id: payment.id,
				stripe_client_secret: intent.client_secret,
				amount: Number(payment.amount),
				type: payment.type,
			});
		} catch (err) {
			next(err);
		}
	},
);

// ── POST /api/v1/payments/webhook ───────────────────────────────────────────

webhookRouter.post(
	"/webhook",
	express.raw({ type: "application/json" }),
	async (req, res) => {
		const sigHeader = req.headers["stripe-signature"];
		const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
		const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

		if (!sig) {
			res.status(400).json({
				code: "invalid_signature",
				message: "Missing Stripe signature",
			});
			return;
		}

		let event: Stripe.Event;
		try {
			event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
		} catch {
			res.status(400).json({
				code: "invalid_signature",
				message: "Invalid Stripe signature",
			});
			return;
		}

		try {
			if (event.type === "payment_intent.succeeded") {
				const intent = event.data.object;
				const payment = await prisma.payment.findFirst({
					where: { stripe_payment_intent_id: intent.id },
				});
				if (!payment || !canTransitionPayment(payment.status, "succeeded")) {
					res.json({ received: true });
					return;
				}

				await prisma.payment.update({
					where: { id: payment.id },
					data: { status: "succeeded" },
				});

				const booking = await prisma.booking.findUnique({
					where: { id: payment.booking_id },
				});
				if (booking && booking.status !== "cancelled") {
					await prisma.booking.update({
						where: { id: booking.id },
						data: { status: "confirmed" },
					});

					if (booking.property_id) {
						await prisma.blockedPeriod.create({
							data: {
								property_id: booking.property_id,
								booking_id: booking.id,
								start_date: booking.check_in,
								end_date: booking.check_out,
								source: "booking_confirmed",
							},
						});
					}
				}
			} else if (event.type === "payment_intent.payment_failed") {
				const intent = event.data.object;
				const payment = await prisma.payment.findFirst({
					where: { stripe_payment_intent_id: intent.id },
				});
				if (payment && canTransitionPayment(payment.status, "failed")) {
					await prisma.payment.update({
						where: { id: payment.id },
						data: { status: "failed" },
					});
				}
			}
		} catch (err) {
			console.error("Webhook processing error:", err);
			res
				.status(500)
				.json({ code: "webhook_error", message: "Internal error" });
			return;
		}

		res.json({ received: true });
	},
);
