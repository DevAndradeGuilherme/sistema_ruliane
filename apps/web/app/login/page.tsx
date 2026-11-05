'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
export default function Login() {
  const [error, setError] = useState(false);
  return <main style={{ maxWidth: 420, margin: '8rem auto', padding: 24 }}><h1>Entrar</h1><form onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const result = await signIn('credentials', { email: data.get('email'), password: data.get('password'), redirect: false }); if (result?.error) setError(true); else window.location.href = '/'; }}><label>E-mail<input name="email" type="email" required autoComplete="username" /></label><label>Senha<input name="password" type="password" required autoComplete="current-password" /></label><button type="submit">Entrar</button>{error && <p role="alert">Credenciais inválidas</p>}</form></main>;
}
