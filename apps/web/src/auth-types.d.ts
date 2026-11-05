import 'next-auth';
declare module 'next-auth' {
  interface User { organizationId: string; role: 'FINANCEIRO' | 'PROPRIETARIA' }
  interface Session { user: { id: string; organizationId: string; role: 'FINANCEIRO' | 'PROPRIETARIA'; name?: string | null; email?: string | null; image?: string | null } }
}
