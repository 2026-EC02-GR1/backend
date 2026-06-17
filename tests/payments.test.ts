import { describe, expect, test } from "bun:test";
import { DomainError } from "../src/domain/errors";
import {
	assertPaymentTransition,
	canTransitionPayment,
	type PaymentStatus,
	paymentAmount,
} from "../src/domain/payments";

describe("payment status transitions", () => {
	test("pending can succeed or fail", () => {
		expect(canTransitionPayment("pending", "succeeded")).toBe(true);
		expect(canTransitionPayment("pending", "failed")).toBe(true);
	});

	test("a succeeded payment can be refunded (cancellation flow, spec)", () => {
		expect(canTransitionPayment("succeeded", "refunded")).toBe(true);
	});

	test("no status ever reverts to pending (spec)", () => {
		const terminal: PaymentStatus[] = ["succeeded", "failed", "refunded"];
		for (const from of terminal) {
			expect(canTransitionPayment(from, "pending")).toBe(false);
		}
	});

	test("failed is final: a new PaymentIntent must be created instead", () => {
		expect(canTransitionPayment("failed", "succeeded")).toBe(false);
		expect(canTransitionPayment("failed", "refunded")).toBe(false);
	});

	test("refunded is final", () => {
		expect(canTransitionPayment("refunded", "succeeded")).toBe(false);
	});

	test("assertPaymentTransition throws a coded DomainError", () => {
		expect(() => assertPaymentTransition("failed", "pending")).toThrow(
			DomainError,
		);
		try {
			assertPaymentTransition("failed", "pending");
		} catch (e) {
			expect((e as DomainError).code).toBe("invalid_payment_transition");
		}
	});
});

describe("paymentAmount", () => {
	test("full = total_amount", () => {
		expect(paymentAmount("full", 500, 150)).toBe(500);
	});

	test("deposit = deposit_amount", () => {
		expect(paymentAmount("deposit", 500, 150)).toBe(150);
	});

	test("balance = total - deposit, rounded to cents", () => {
		expect(paymentAmount("balance", 500, 150)).toBe(350);
		expect(paymentAmount("balance", 200.98, 60.29)).toBe(140.69);
	});

	test("no balance due when deposit equals total (no split payment)", () => {
		expect(() => paymentAmount("balance", 500, 500)).toThrow(
			/No balance is due/,
		);
	});

	test("deposit greater than total is rejected", () => {
		expect(() => paymentAmount("deposit", 100, 150)).toThrow(DomainError);
	});
});
