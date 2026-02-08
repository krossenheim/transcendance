
/**
 * Convert a File object to a base64 string
 * @param file The file to convert
 * @returns A base64 representation of the file contents
 */
export async function fileToBase64(file: File): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.onload = () => {
			const result = reader.result as string;
			const base64 = result.split(",")[1]!;
			resolve(base64);
		};
		reader.readAsDataURL(file);
	});
};
