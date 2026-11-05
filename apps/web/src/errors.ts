export type Actor = { id: string; organizationId: string; role: 'FINANCEIRO' | 'PROPRIETARIA' };
export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
