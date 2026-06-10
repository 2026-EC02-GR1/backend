import type { User } from "../generated/prisma/client"

declare global {
	namespace Express {
		interface Request {
			manager: User
		}
	}
}
