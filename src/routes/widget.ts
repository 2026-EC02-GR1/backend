import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { DomainError } from "../domain/errors";
import { buildWidgetSnippet } from "../domain/widget";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { requireProperty } from "./properties";

export const widgetRouter = Router({ mergeParams: true });

const widgetConfigSchema = z.object({
	language: z.string().optional(),
	custom_css: z.string().optional(),
});

widgetRouter.get("/", authenticate, async (req, res) => {
	const { property_id } = req.params as { property_id: string };
	await requireProperty(property_id, req.manager);

	const config = await prisma.widgetConfig.findUnique({
		where: { property_id },
	});
	if (!config)
		throw new DomainError("not_found", "Widget configuration not found");
	res.json(config);
});

widgetRouter.put(
	"/",
	authenticate,
	validate(widgetConfigSchema),
	async (req, res) => {
		const { property_id } = req.params as { property_id: string };
		await requireProperty(property_id, req.manager);

		const { language, custom_css } = req.body as z.infer<
			typeof widgetConfigSchema
		>;
		const config = await prisma.widgetConfig.upsert({
			where: { property_id },
			create: {
				property_id,
				language: language ?? "fr",
				custom_css: custom_css ?? null,
			},
			update: { language: language ?? "fr", custom_css: custom_css ?? null },
		});
		res.json(config);
	},
);

widgetRouter.get("/snippet", authenticate, async (req, res) => {
	const { property_id } = req.params as { property_id: string };
	await requireProperty(property_id, req.manager);

	const cdnBaseUrl = process.env.WIDGET_CDN_URL;
	const snippet = buildWidgetSnippet(property_id, cdnBaseUrl);
	res.json({ snippet });
});
