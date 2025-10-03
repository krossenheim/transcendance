import { z } from 'zod';

class Body {
	data: z.ZodTypeAny;

	constructor(data: z.ZodTypeAny) {
		this.data = data;
	}


}