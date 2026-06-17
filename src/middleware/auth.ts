import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { auth } from "../lib/auth";

export async function authenticate(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});
	if (!session) {
		res
			.status(401)
			.json({ code: "unauthorized", message: "Authentication required" });
		return;
	}

	const manager = await prisma.user.findUnique({
		where: { id: session.user.id, deleted_at: null },
	});
	if (!manager) {
		res.status(401).json({
			code: "unauthorized",
			message: "Account not found or has been deleted",
		});
		return;
	}

	req.manager = manager;
	next();
}
