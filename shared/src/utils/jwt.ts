import { zodParse } from "@app/shared/api/service/common/zodUtils";
import { Result } from "@app/shared/api/service/common/result";
import jwt from "jsonwebtoken";
import { z } from "zod";

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiryStr = '15min';

const JWTPayloadSchema = z.object({
	uid: z.number().int(),
	exp: z.number().int(),
});

export type JWTData = z.infer<typeof JWTPayloadSchema>;

export function createJWT(data: Omit<JWTData, "exp">): string {
	if (jwtSecret === undefined) throw new Error('JWT_SECRET environment variable is not set');
	return jwt.sign(data, jwtSecret, { expiresIn: jwtExpiryStr });
}

export function verifyJWT(token: string): Result<JWTData, string> {
	if (jwtSecret === undefined)
		return Result.Err('JWT_SECRET environment variable is not set, cannot verify token');

	try {
		const decoded = jwt.verify(token, jwtSecret);
		const parseResult = zodParse(JWTPayloadSchema, decoded);
		if (parseResult.isErr())
			return Result.Err('Token data schema validation failed');
	
		if (parseResult.unwrap().exp < Math.floor(Date.now() / 1000))
			return Result.Err('Token has expired');

		return Result.Ok(parseResult.unwrap());
	} catch (err) {
		return Result.Err('Invalid token');
	}
}
