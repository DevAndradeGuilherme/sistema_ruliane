import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyCredentials } from './auth-credentials.ts';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: false,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [Credentials({
    credentials: { email: {}, password: {} },
    authorize: verifyCredentials,
  })],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.organizationId = user.organizationId; token.role = user.role; }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.organizationId = token.organizationId as string;
      session.user.role = token.role as 'FINANCEIRO' | 'PROPRIETARIA';
      return session;
    },
  },
});
