/**
 * Creates a test manager + property + rate in the DB.
 * Usage: bun run seed:property
 *
 * Safe to run multiple times: reuses the manager if the email already exists.
 */
import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { randomUUID } from "crypto"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
	// ── Manager ───────────────────────────────────────────
	const email = "manager@example.com"
	let manager = await prisma.user.findUnique({ where: { email } })

	if (!manager) {
		manager = await prisma.user.create({
			data: {
				id: randomUUID(),
				name: "Test Manager",
				email,
				email_verified: true,
			},
		})
		console.log("Created manager:", manager.id)
	} else {
		console.log("Reusing existing manager:", manager.id)
	}

	// ── Property ──────────────────────────────────────────
	const property = await prisma.property.create({
		data: {
			name: "Chalet des Alpes",
			description: "Beautiful mountain chalet with stunning views.",
			address: "12 Route des Chalets",
			city: "Megève",
			zip_code: "74120",
			country: "France",
			max_capacity: 8,
			nb_bedrooms: 4,
			nb_bathrooms: 2,
			active: true,
			user_id: manager.id,
		},
	})
	console.log("Created property:", property.id, `— "${property.name}"`)

	// ── Base rate ─────────────────────────────────────────
	const today = new Date()
	const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
	const rate = await prisma.rate.create({
		data: {
			property_id: property.id,
			name: "Base rate",
			base_price_per_night: 150,
			start_date: today,
			end_date: nextYear,
			is_high_season: false,
		},
	})
	console.log(`Created rate: ${rate.id} — €${rate.base_price_per_night}/night`)

	// ── Discount rule (7+ nights: -10%) ───────────────────
	await prisma.discountRule.create({
		data: {
			rate_id: rate.id,
			min_nights: 7,
			max_nights: null,
			discount_percentage: 10,
		},
	})
	console.log("Created discount rule: 7+ nights → -10%")

	console.log("\nDone. Copy this property_id into your Bruno environment:")
	console.log(property.id)
}

main()
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
	.finally(() => pool.end())
