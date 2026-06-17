/**
 * Creates a test client + hold slot + booking on an existing property.
 * Usage: bun run seed:booking [property_id]
 *
 * Reads property_id from CLI arg or SEED_PROPERTY_ID env var.
 * Run seed:property first if you don't have a property yet.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const propertyId = process.argv[2] ?? process.env.SEED_PROPERTY_ID;
	if (!propertyId) {
		console.error("Usage: bun run seed:booking <property_id>");
		console.error("  or set SEED_PROPERTY_ID env var");
		process.exit(1);
	}

	// ── Verify property exists ────────────────────────────
	const property = await prisma.property.findUnique({
		where: { id: propertyId },
	});
	if (!property || property.deleted_at !== null) {
		console.error(`Property not found: ${propertyId}`);
		process.exit(1);
	}
	console.log(`Using property: ${property.id} — "${property.name}"`);

	// ── Check a rate exists for the booking dates ─────────
	const checkIn = nextMonday();
	const checkOut = new Date(checkIn);
	checkOut.setDate(checkOut.getDate() + 3);

	const rate = await prisma.rate.findFirst({
		where: {
			property_id: propertyId,
			start_date: { lte: checkIn },
			end_date: { gte: checkOut },
		},
	});
	if (!rate) {
		console.error(
			`No rate covers ${fmt(checkIn)} → ${fmt(checkOut)}. Run seed:property first.`,
		);
		process.exit(1);
	}
	const pricePerNight = Number(rate.base_price_per_night);
	const nbNights = 3;
	const totalAmount = pricePerNight * nbNights;

	// ── Client ────────────────────────────────────────────
	const clientEmail = "client@example.com";
	let client = await prisma.client.findUnique({
		where: { email: clientEmail },
	});
	if (!client) {
		client = await prisma.client.create({
			data: {
				last_name: "Dupont",
				first_name: "Alice",
				email: clientEmail,
				phone: "+33612345678",
			},
		});
		console.log("Created client:", client.id);
	} else {
		console.log("Reusing existing client:", client.id);
	}

	// ── Hold slot (15-min TTL) ────────────────────────────
	const hold = await prisma.holdSlot.create({
		data: {
			property_id: propertyId,
			start_date: checkIn,
			end_date: checkOut,
			expires_at: new Date(Date.now() + 15 * 60 * 1000),
		},
	});
	console.log(
		"Created hold slot:",
		hold.id,
		`(expires ${hold.expires_at.toISOString()})`,
	);

	// ── Booking ───────────────────────────────────────────
	const booking = await prisma.booking.create({
		data: {
			property_id: propertyId,
			client_id: client.id,
			hold_slot_id: hold.id,
			check_in: checkIn,
			check_out: checkOut,
			nb_guests: 2,
			total_amount: totalAmount,
			deposit_amount: totalAmount,
			status: "pending",
			source: "direct",
		},
		include: { client: true },
	});

	console.log(`\nCreated booking: ${booking.id}`);
	console.log(
		`  Dates:  ${fmt(booking.check_in)} → ${fmt(booking.check_out)} (${nbNights} nights)`,
	);
	console.log(
		`  Guest:  ${booking.client?.first_name} ${booking.client?.last_name}`,
	);
	console.log(`  Amount: €${booking.total_amount}`);
	console.log(`  Status: ${booking.status}`);
	console.log("\nCopy this booking_id into your Bruno environment:");
	console.log(booking.id);
}

function nextMonday(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	const day = d.getDay();
	d.setDate(d.getDate() + ((8 - day) % 7 || 7));
	return d;
}

function fmt(d: Date): string {
	return d.toISOString().slice(0, 10);
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => pool.end());
