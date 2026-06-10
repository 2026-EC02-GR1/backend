import express from "express"
import path from "node:path"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./lib/auth"
import { errorHandler } from "./middleware/error"
import { propertiesRouter } from "./routes/properties"
import { photosRouter } from "./routes/photos"
import { ratesRouter } from "./routes/rates"
import { availabilityRouter, holdSlotsRouter } from "./routes/availability"
import { bookingsRouter } from "./routes/bookings"
import { paymentsRouter, webhookRouter } from "./routes/payments"
import { widgetRouter } from "./routes/widget"

const app = express()

// Stripe webhook needs raw body — mount before json parser
app.use("/api/v1/payments", webhookRouter)

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Serve uploaded photos
app.use("/uploads", express.static(path.resolve("uploads")))

// better-auth handles all /api/v1/auth/* paths
const authHandler = toNodeHandler(auth)
app.use((req, res, next) => {
	if (req.path.startsWith("/api/v1/auth")) {
		authHandler(req, res)
	} else {
		next()
	}
})

// API routes
const v1 = express.Router()

v1.use("/properties", propertiesRouter)
v1.use("/properties/:property_id/photos", photosRouter)
v1.use("/properties/:property_id/rates", ratesRouter)
v1.use("/properties/:property_id/availability", availabilityRouter)
v1.use("/properties/:property_id/hold-slots", holdSlotsRouter)
v1.use("/bookings", bookingsRouter)
v1.use("/bookings", paymentsRouter)

v1.use("/properties/:property_id/widget", widgetRouter)

app.use("/api/v1", v1)

app.use(errorHandler)

export default app
