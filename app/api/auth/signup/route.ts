import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Use a password of at least 8 characters.' }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const alreadyRegistered = /already registered/i.test(error.message);
      return NextResponse.json(
        { error: alreadyRegistered ? 'That email is already registered. Sign in instead.' : 'Unable to create your account.' },
        { status: alreadyRegistered ? 409 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to create your account.' }, { status: 400 });
  }
}
