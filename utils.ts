const DATE_FORMAT = "yyyy-MM-dd";

export function formatDate(d: Date): string {
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yyyy = d.getFullYear().toString();

	return DATE_FORMAT
		.replace(/dd/g, dd)
		.replace(/MM/g, mm)
		.replace(/yyyy/g, yyyy);
}