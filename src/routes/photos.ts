import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../db";
import { DomainError } from "../domain/errors";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { requireProperty } from "./properties";

export const photosRouter = Router({ mergeParams: true });

const UPLOADS_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
	destination: UPLOADS_DIR,
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname);
		cb(null, `${crypto.randomUUID()}${ext}`);
	},
});

const upload = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (file.mimetype.startsWith("image/")) cb(null, true);
		else cb(new Error("Only image files are allowed"));
	},
});

const reorderSchema = z.object({
	order: z.array(z.string().uuid()),
});

photosRouter.get("/", authenticate, async (req, res) => {
	const { property_id } = req.params as { property_id: string };
	await requireProperty(property_id, req.manager);
	const photos = await prisma.propertyPhoto.findMany({
		where: { property_id },
		orderBy: { order: "asc" },
	});
	res.json(photos);
});

photosRouter.post(
	"/",
	authenticate,
	upload.single("file"),
	async (req, res) => {
		const { property_id } = req.params as { property_id: string };
		await requireProperty(property_id, req.manager);

		if (!req.file) {
			res.status(422).json({
				code: "validation_error",
				message: "File is required",
				fields: [{ field: "file", message: "File is required" }],
			});
			return;
		}

		const last = await prisma.propertyPhoto.findFirst({
			where: { property_id },
			orderBy: { order: "desc" },
		});
		const nextOrder = (last?.order ?? 0) + 1;

		const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
		const storageUrl = `${baseUrl}/uploads/${req.file.filename}`;

		const photo = await prisma.propertyPhoto.create({
			data: {
				property_id,
				storage_url: storageUrl,
				order: nextOrder,
			},
		});

		res.status(201).json({
			id: photo.id,
			storage_url: photo.storage_url,
			order: photo.order,
		});
	},
);

photosRouter.patch(
	"/reorder",
	authenticate,
	validate(reorderSchema),
	async (req, res) => {
		const { property_id } = req.params as { property_id: string };
		await requireProperty(property_id, req.manager);

		const { order: ids } = req.body as { order: string[] };

		const existing = await prisma.propertyPhoto.findMany({
			where: { property_id },
			select: { id: true },
		});
		const existingIds = new Set(existing.map((p) => p.id));

		if (
			ids.length !== existingIds.size ||
			ids.some((id) => !existingIds.has(id))
		) {
			throw new DomainError(
				"validation_error",
				"order must contain exactly all photo IDs for this property",
			);
		}

		await Promise.all(
			ids.map((id, index) =>
				prisma.propertyPhoto.update({
					where: { id },
					data: { order: index + 1 },
				}),
			),
		);

		const photos = await prisma.propertyPhoto.findMany({
			where: { property_id },
			orderBy: { order: "asc" },
		});
		res.json(photos);
	},
);

photosRouter.delete("/:photo_id", authenticate, async (req, res) => {
	const { property_id, photo_id } = req.params as {
		property_id: string;
		photo_id: string;
	};
	await requireProperty(property_id, req.manager);

	const photo = await prisma.propertyPhoto.findUnique({
		where: { id: photo_id },
	});
	if (!photo || photo.property_id !== property_id) {
		throw new DomainError("not_found", "Photo not found");
	}

	await prisma.propertyPhoto.delete({ where: { id: photo_id } });
	res.status(204).send();
});
