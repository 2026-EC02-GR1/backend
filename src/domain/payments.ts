/**
 * Payment rules (spec, docs/openapi.yaml):
 * - A payment never reverts to `pending` once in a terminal status.
 * - On failure a NEW PaymentIntent is created (failed is final for that row).
 * - On cancellation a succeeded payment transitions to `refunded`.
 * - Payment rows are immutable apart from `status`, and are never deleted.
 */
import { DomainError } from "./errors";
import { round2 } from "./pricing";

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PaymentType = "deposit" | "balance" | "full";

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
	pending: ["succeeded", "failed"],
	succeeded: ["refunded"],
	failed: [],
	refunded: [],
};

export function canTransitionPayment(
	from: PaymentStatus,
	to: PaymentStatus,
): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(
	from: PaymentStatus,
	to: PaymentStatus,
): void {
	if (!canTransitionPayment(from, to)) {
		throw new DomainError(
			"invalid_payment_transition",
			`Payment cannot transition from ${from} to ${to}`,
		);
	}
}

/**
 * Amount of a PaymentIntent for a booking (POST /bookings/{id}/payments/intent).
 * Booking amounts are immutable after creation, so this derives from them only.
 */
export function paymentAmount(
	type: PaymentType,
	totalAmount: number,
	depositAmount: number,
): number {
	if (depositAmount > totalAmount) {
		throw new DomainError(
			"invalid_amounts",
			"deposit_amount cannot exceed total_amount",
		);
	}
	switch (type) {
		case "full":
			return round2(totalAmount);
		case "deposit":
			return round2(depositAmount);
		case "balance": {
			const balance = round2(totalAmount - depositAmount);
			if (balance <= 0) {
				throw new DomainError(
					"no_balance_due",
					"No balance is due for this booking",
				);
			}
			return balance;
		}
	}
}
