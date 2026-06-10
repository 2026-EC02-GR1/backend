import { Router } from "express"

export const paymentsRouter = Router()
export const webhookRouter = Router()

const NOT_IMPLEMENTED = {
	code: "not_implemented",
	message: "Payment integration not yet available",
}

paymentsRouter.get("/:booking_id/payments", (_req, res) => {
	res.status(501).json(NOT_IMPLEMENTED)
})

paymentsRouter.post("/:booking_id/payments/intent", (_req, res) => {
	res.status(501).json(NOT_IMPLEMENTED)
})

webhookRouter.post("/webhook", (_req, res) => {
	res.status(501).json(NOT_IMPLEMENTED)
})
