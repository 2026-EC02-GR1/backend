import { Router } from "express";
import { z } from "zod";
import type { User } from "../../generated/prisma/client";
import { prisma } from "../db";
import { DomainError } from "../domain/errors";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const propertiesRouter = Router();

function serializeProperty(p: { user_id: string; [key: string]: unknown }) {
	const { user_id, ...rest } = p;
	return { ...rest, manager_id: user_id };
}

async function requireProperty(id: string, manager: User) {
	const property = await prisma.property.findUnique({ where: { id } });
	if (!property || property.deleted_at !== null) {
		throw new DomainError("not_found", "Property not found");
	}
	if (property.user_id !== manager.id) {
		throw new DomainError(
			"forbidden",
			"You do not have access to this property",
		);
	}
	return property;
}

const propertyCreateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	address: z.string().min(1),
	city: z.string().min(1),
	zip_code: z.string().min(1),
	country: z.string().min(1),
	max_capacity: z.number().int().positive(),
	nb_bedrooms: z.number().int().nonnegative().optional(),
	nb_bathrooms: z.number().int().nonnegative().optional(),
});

const propertyUpdateSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	address: z.string().min(1).optional(),
	city: z.string().min(1).optional(),
	zip_code: z.string().min(1).optional(),
	country: z.string().min(1).optional(),
	max_capacity: z.number().int().positive().optional(),
	nb_bedrooms: z.number().int().nonnegative().optional(),
	nb_bathrooms: z.number().int().nonnegative().optional(),
	active: z.boolean().optional(),
});

propertiesRouter.get("/", authenticate, async (req, res) => {
	const page = Number(req.query.page ?? 1);
	const per_page = Number(req.query.per_page ?? 20);
	const active =
		req.query.active !== undefined ? req.query.active === "true" : undefined;

	const where = {
		user_id: req.manager.id,
		deleted_at: null,
		...(active !== undefined && { active }),
	};

	const [data, total] = await Promise.all([
		prisma.property.findMany({
			where,
			skip: (page - 1) * per_page,
			take: per_page,
			orderBy: { created_at: "desc" },
		}),
		prisma.property.count({ where }),
	]);

	res.json({ data: data.map(serializeProperty), total, page, per_page });
});

propertiesRouter.post(
	"/",
	authenticate,
	validate(propertyCreateSchema),
	async (req, res) => {
		const property = await prisma.property.create({
			data: { ...req.body, user_id: req.manager.id },
		});
		res.status(201).json(serializeProperty(property));
	},
);

propertiesRouter.get("/:id", authenticate, async (req, res) => {
	const { id } = req.params as { id: string };
	const property = await requireProperty(id, req.manager);
	res.json(serializeProperty(property));
});

propertiesRouter.patch(
	"/:id",
	authenticate,
	validate(propertyUpdateSchema),
	async (req, res) => {
		const { id } = req.params as { id: string };
		await requireProperty(id, req.manager);
		const property = await prisma.property.update({
			where: { id },
			data: req.body,
		});
		res.json(serializeProperty(property));
	},
);

propertiesRouter.delete("/:id", authenticate, async (req, res) => {
	const { id } = req.params as { id: string };
	await requireProperty(id, req.manager);
	await prisma.property.update({
		where: { id },
		data: { deleted_at: new Date() },
	});
	res.status(204).send();
});

export { requireProperty };
