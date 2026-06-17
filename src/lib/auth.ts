import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins";
import { prisma } from "../db";

export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
	basePath: "/api/v1/auth",
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
	advanced: {
		database: {
			generateId: "uuid",
		},
	},
	emailAndPassword: { enabled: true },
	plugins: [bearer()],
	user: {
		fields: {
			createdAt: "created_at",
			updatedAt: "updated_at",
			emailVerified: "email_verified",
		},
	},
	session: {
		fields: {
			expiresAt: "expires_at",
			createdAt: "created_at",
			updatedAt: "updated_at",
			userId: "user_id",
			ipAddress: "ip_address",
			userAgent: "user_agent",
		},
	},
	account: {
		fields: {
			createdAt: "created_at",
			updatedAt: "updated_at",
			userId: "user_id",
			accountId: "account_id",
			providerId: "provider_id",
			accessToken: "access_token",
			refreshToken: "refresh_token",
			idToken: "id_token",
			accessTokenExpiresAt: "access_token_expires_at",
			refreshTokenExpiresAt: "refresh_token_expires_at",
		},
	},
});
