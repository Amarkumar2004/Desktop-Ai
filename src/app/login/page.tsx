'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, ArrowRight } from 'lucide-react';
import AuthCardLayout from '@/components/account/AuthCardLayout';
import Input from '@/components/account/ui/Input';
import PasswordField from '@/components/account/ui/PasswordField';
import Button from '@/components/account/ui/Button';
import Alert from '@/components/account/ui/Alert';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { success, error: toastError } = useToast();

  const [email, setEmail] = useState('alex.rivera@susi.ai');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setPasswordError('');
    setGeneralError('');

    // Client-side validation
    let hasErr = false;
    if (!email.trim()) {
      setEmailError('Please enter your work email address.');
      hasErr = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      hasErr = true;
    }

    if (!password && email !== 'alex.rivera@susi.ai') {
      setPasswordError('Please enter your password.');
      hasErr = true;
    }

    if (hasErr) return;

    setIsLoading(true);
    try {
      const res = await login(email, password);
      if (res.success) {
        success('Welcome back!', `Signed in as ${email}`);
        router.push('/');
      } else {
        setGeneralError(res.error || 'Authentication failed. Please check your credentials.');
        toastError('Authentication Failed', res.error || 'Please check your email and password.');
      }
    } catch {
      setGeneralError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await login('google.user@susi.ai');
      success('Signed in with Google', 'Redirecting to your workspace...');
      router.push('/');
    } catch {
      setGeneralError('Google sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCardLayout
      title="Welcome back"
      subtitle="Sign in to manage your AI workforce."
    >
      {/* General Error Banner */}
      {generalError && (
        <Alert
          variant="error"
          title="Authentication Failed"
          onClose={() => setGeneralError('')}
          className="mb-4"
        >
          {generalError}
        </Alert>
      )}

      {/* Main Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email Input */}
        <Input
          label="Work Email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          error={emailError}
          leftIcon={<Mail className="w-4 h-4" />}
          autoComplete="email"
          required
        />

        {/* Password Input */}
        <div className="space-y-1">
          <PasswordField
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            error={passwordError}
            autoComplete="current-password"
            required
          />
        </div>

        {/* Remember Me & Forgot Password Row */}
        <div className="flex items-center justify-between text-xs pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none text-stone-700 hover:text-stone-900">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isLoading}
              className="w-4 h-4 rounded border-stone-300 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
            />
            <span className="font-medium">Remember me</span>
          </label>

          <Link
            href="/forgot-password"
            className="font-semibold text-amber-600 hover:text-amber-700 hover:underline transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Sign In Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Sign in
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-stone-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-stone-400 uppercase font-bold text-[10px] tracking-wider">
            or continue with
          </span>
        </div>
      </div>

      {/* Google Sign In Button */}
      <div>
        <Button
          type="button"
          variant="outline"
          size="md"
          fullWidth
          disabled={isLoading}
          onClick={handleGoogleSignIn}
          leftIcon={
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          }
        >
          Sign in with Google
        </Button>
      </div>

      {/* New to SUSI AI */}
      <div className="pt-2 text-center text-xs text-stone-600">
        New to SUSI AI?{' '}
        <Link
          href="/signup"
          className="font-bold text-amber-600 hover:text-amber-700 hover:underline transition-colors"
        >
          Create an account
        </Link>
      </div>
    </AuthCardLayout>
  );
}
