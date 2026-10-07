/** Strips characters that have meaning in PostgREST filter syntax. */
export const cleanSearch = (q: string) => q.replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
