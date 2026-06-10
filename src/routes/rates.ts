import { Router } from "express"
import { z } from "zod"
import { prisma } from "../db"
import { authenticate } from "../middleware/auth"
import { validate } from "../middleware/validate"
import { requireProperty } from "./properties"
import { assertNoBaseRateOverlap } from "../domain/pricing"
import { DomainError } from "../domain/errors"
import type { Rate } from "../../generated/prisma/client"

export const ratesRouter = Router({ mergeParams: true })

function rateToInput(r: Rate) {
	return {
		id: r.id,
		name: r.name,
		base_price_per_night: Number(r.base_price_per_night),
		start_date: r.start_date.toISOString().slice(0, 10),
		end_date: r.end_date.toISOString().slice(0, 10),
		is_high_season: r.is_high_season,
	}
}

const rateCreateSchema = z.object({
	name: z.string().min(1),
	base_price_per_night: z.number().positive(),
	start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
	end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
	is_high_season: z.boolean().default(false),
})

const rateUpdateSchema = z.object({
	name: z.string().min(1).optional(),
	base_price_per_night: z.number().positive().optional(),
	start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
	end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
	is_high_season: z.boolean().optional(),
})

const discountRuleCreateSchema = z.object({
	min_nights: z.number().int().positive(),
	max_nights: z.number().int().positive().nullable().optional(),
	discount_percentage: z.number().positive().max(100),
})

ratesRouter.get("/", authenticate, async (req, res) => {
	await requireProperty(req.params.property_id, req.manager)
	const rates = await prisma.rate.findMany({
		where: { property_id: req.params.property_id },
		include: { discount_rules: true },
		orderBy: { start_date: "asc" },
	})
	res.json(rates)
})

ratesRouter.post("/", authenticate, validate(rateCreateSchema), async (req, res) => {
	const { property_id } = req.params
	await requireProperty(property_id, req.manager)

	const body = req.body as z.infer<typeof rateCreateSchema>
	if (body.start_date >= body.end_date) {
		throw new DomainError("invalid_date_range", "start_date must be before end_date")
	}

	const existing = await prisma.rate.findMany({ where: { property_id } })
	assertNoBaseRateOverlap(
		{ start_date: body.start_date, end_date: body.end_date, is_high_season: body.is_high_season },
		existing.map(rateToInput),
	)

	const rate = await prisma.rate.create({
		data: {
			property_id,
			name: body.name,
			base_price_per_night: body.base_price_per_night,
			start_date: new Date(body.start_date),
			end_date: new Date(body.end_date),
			is_high_season: body.is_high_season,
		},
		include: { discount_rules: true },
	})
	res.status(201).json(rate)
})

ratesRouter.patch("/:rate_id", authenticate, validate(rateUpdateSchema), async (req, res) => {
	const { property_id, rate_id } = req.params
	await requireProperty(property_id, req.manager)

	const rate = await prisma.rate.findUnique({ where: { id: rate_id } })
	if (!rate || rate.property_id !== property_id) {
		throw new DomainError("not_found", "Rate not found")
	}

	const body = req.body as z.infer<typeof rateUpdateSchema>
	const merged = {
		start_date: body.start_date ?? rate.start_date.toISOString().slice(0, 10),
		end_date: body.end_date ?? rate.end_date.toISOString().slice(0, 10),
		is_high_season: body.is_high_season ?? rate.is_high_season,
	}
	if (merged.start_date >= merged.end_date) {
		throw new DomainError("invalid_date_range", "start_date must be before end_date")
	}

	const others = await prisma.rate.findMany({ where: { property_id, NOT: { id: rate_id } } })
	assertNoBaseRateOverlap(merged, others.map(rateToInput))

	const updated = await prisma.rate.update({
		where: { id: rate_id },
		data: {
			...(body.name && { name: body.name }),
			...(body.base_price_per_night !== undefined && {
				base_price_per_night: body.base_price_per_night,
			}),
			...(body.start_date && { start_date: new Date(body.start_date) }),
			...(body.end_date && { end_date: new Date(body.end_date) }),
			...(body.is_high_season !== undefined && { is_high_season: body.is_high_season }),
		},
		include: { discount_rules: true },
	})
	res.json(updated)
})

ratesRouter.delete("/:rate_id", authenticate, async (req, res) => {
	const { property_id, rate_id } = req.params
	await requireProperty(property_id, req.manager)

	const rate = await prisma.rate.findUnique({ where: { id: rate_id } })
	if (!rate || rate.property_id !== property_id) {
		throw new DomainError("not_found", "Rate not found")
	}

	await prisma.rate.delete({ where: { id: rate_id } })
	res.status(204).send()
})

ratesRouter.post("/:rate_id/discount-rules", authenticate, validate(discountRuleCreateSchema), async (req, res) => {
	const { property_id, rate_id } = req.params
	await requireProperty(property_id, req.manager)

	const rate = await prisma.rate.findUnique({ where: { id: rate_id } })
	if (!rate || rate.property_id !== property_id) {
		throw new DomainError("not_found", "Rate not found")
	}

	const body = req.body as z.infer<typeof discountRuleCreateSchema>
	const rule = await prisma.discountRule.create({
		data: {
			rate_id,
			min_nights: body.min_nights,
			max_nights: body.max_nights ?? null,
			discount_percentage: body.discount_percentage,
		},
	})
	res.status(201).json(rule)
})

ratesRouter.delete("/:rate_id/discount-rules/:rule_id", authenticate, async (req, res) => {
	const { property_id, rate_id, rule_id } = req.params
	await requireProperty(property_id, req.manager)

	const rule = await prisma.discountRule.findUnique({
		where: { id: rule_id },
		include: { rate: true },
	})
	if (!rule || rule.rate.property_id !== property_id || rule.rate_id !== rate_id) {
		throw new DomainError("not_found", "Discount rule not found")
	}

	await prisma.discountRule.delete({ where: { id: rule_id } })
	res.status(204).send()
})
