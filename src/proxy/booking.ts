import type { Request, Response } from "express";
import { Router } from "express";
import { authenticate } from "../middleware/auth";

/**
 * Reservation domain (bookings, hold-slots, availability) lives in the
 * service_reservation microservice. The gateway keeps the auth boundary:
 * manager routes go through `authenticate` here, then the manager identity
 * is forwarded via X-Manager-Id — the service trusts that header.
 */
const RESERVATION_SERVICE_URL =
	process.env.RESERVATION_SERVICE_URL ?? "http://localhost:3001";

async function forward(req: Request, res: Response) {
	// The service mounts the same /api/v1 paths, so originalUrl (path + query)
	// is forwarded untouched.
	const url = new URL(req.originalUrl, RESERVATION_SERVICE_URL);

	const headers: Record<string, string> = {};
	if (req.manager) headers["x-manager-id"] = req.manager.id;

	const init: RequestInit = { method: req.method, headers };
	if (req.method !== "GET" && req.method !== "HEAD") {
		headers["content-type"] = "application/json";
		init.body = JSON.stringify(req.body ?? {});
	}

	let upstream: globalThis.Response;
	try {
		upstream = await fetch(url, init);
	} catch {
		res.status(502).json({
			code: "service_unavailable",
			message: "Reservation service is unreachable",
		});
		return;
	}

	res.status(upstream.status);
	const contentType = upstream.headers.get("content-type");
	if (contentType) res.set("content-type", contentType);
	const body = Buffer.from(await upstream.arrayBuffer());
	if (body.length === 0) {
		res.end();
	} else {
		res.send(body);
	}
}

export const bookingsProxyRouter = Router();
bookingsProxyRouter.post("/public", forward); // public (widget)
bookingsProxyRouter.get("/", authenticate, forward);
bookingsProxyRouter.get("/:id", authenticate, forward);
bookingsProxyRouter.patch("/:id", authenticate, forward);

export const availabilityProxyRouter = Router({ mergeParams: true });
availabilityProxyRouter.get("/estimate", forward); // public (widget)
availabilityProxyRouter.get("/", authenticate, forward);
availabilityProxyRouter.patch("/", authenticate, forward);

export const holdSlotsProxyRouter = Router({ mergeParams: true });
holdSlotsProxyRouter.post("/", forward); // public (widget)
holdSlotsProxyRouter.delete("/:hold_slot_id", forward); // public (widget)
