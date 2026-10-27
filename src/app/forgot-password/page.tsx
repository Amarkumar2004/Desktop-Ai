'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2, RotateCcw, Send } from 'lucide-react';
import AuthCardLayout from '@/components/account/AuthCardLayout';
import Input from '@/components/account/ui/Input';
import Button from '@/components/account/ui/Button';
import { useToast } from '@/lib/toast/ToastContext';

export default function ForgotPasswordPage() {
  const { success } = useToast();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');

    if (!email.trim()) {
      setEmailError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
      success('Reset Link Sent', `Instructions dispatched to ${email}`);
    }, 800);
  };

  const handleResend = () => {
    setResendLoading(true);
    setTimeout(() => {
      setResendLoading(false);
      setResendCount((prev) => prev + 1);
      success('Link Resent', `New verification link sent to ${email}`);
    }, 600);
  };

  if (isSubmitted) {
    return (
      <AuthCardLayout
        title="Check your inbox"
        subtitle="Password reset instructions have been sent."
        backHref="/login"
        backLabel="← Back to Sign In"
      >
        <div className="space-y-5 text-center sm:text-left">
          {/* Success Icon Badge */}
          <div className="flex items-center justify-center sm:justify-start">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300/80 flex items-center justify-center text-emerald-600 shadow-sm">
              <Mail className="w-6 h-6" />
            </div>
          </div>

          <div className="space-y-2 text-xs sm:text-sm text-stone-600">
            <p>
              We’ve sent a password reset link to{' '}
              <strong className="text-stone-900 font-bold">{email || 'your email'}</strong>.
            </p>
            <p className="text-[11.5px] text-stone-500">
              Please check your spam or junk folder if you don’t see it in your inbox within a few
              minutes.
            </p>
          </div>

          {resendCount > 0 && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>A fresh reset link was re-sent!</span>
            </div>
          )}

          <div className="pt-2 space-y-3">
            {/* Resend button */}
            <Button
              type="button"
              variant="outline"
              size="md"
              fullWidth
              isLoading={resendLoading}
              onClick={handleResend}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Resend reset link
            </Button>

            {/* Link to simulate receiving reset link */}
            <Link
              href="/reset-password"
              className="block w-full text-center py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              Open Reset Password Screen (Demo)
            </Link>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors pt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout
      title="Reset your password"
      subtitle="Enter your email and we’ll send reset instructions."
      backHref="/login"
      backLabel="← Back to Sign In"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Work Email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          disabled={isLoading}
          leftIcon={<Mail className="w-4 h-4" />}
          helperText="We will send a secure link valid for 60 minutes."
          autoComplete="email"
          required
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isLoading}
          leftIcon={<Send className="w-3.5 h-3.5" />}
        >
          Send reset link
        </Button>
      </form>

      <div className="pt-2 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to sign in</span>
        </Link>
      </div>
    </AuthCardLayout>
  );
}
